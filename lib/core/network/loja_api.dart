import 'dart:async';
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

/// Fase 2: ativação explícita, para não quebrar o Firebase anterior durante os testes.
/// --dart-define=LOJA_BACKEND=railway --dart-define=LOJA_API_BASE_URL=https://... 
/// --dart-define=LOJA_STORE_SLUG=sua-loja
abstract final class LojaBackend {
  static const String provider = String.fromEnvironment('LOJA_BACKEND', defaultValue: 'firebase');
  static const String apiUrl = String.fromEnvironment('LOJA_API_BASE_URL');
  static const String storeSlug = String.fromEnvironment('LOJA_STORE_SLUG');
  static bool get isRailway => provider == 'railway';

  static void validate() {
    if (!isRailway) return;
    final url = Uri.tryParse(apiUrl);
    if (url == null || !url.hasAuthority || url.scheme != 'https' ||
        storeSlug.isEmpty || !RegExp(r'^[a-z0-9]+(?:-[a-z0-9]+)*$').hasMatch(storeSlug)) {
      throw StateError('Configuração Railway inválida: LOJA_API_BASE_URL deve ser HTTPS e LOJA_STORE_SLUG deve ser o slug da loja.');
    }
  }
}

class LojaApiException implements Exception {
  const LojaApiException(this.message, [this.status]);
  final String message;
  final int? status;
  @override
  String toString() => message;
}

class LojaApi {
  LojaApi._();
  static final LojaApi instance = LojaApi._();
  final http.Client _http = http.Client();
  final FlutterSecureStorage _secure = const FlutterSecureStorage();
  String? _accessToken;
  String? _refreshToken;
  Future<bool>? _refreshing;
  String? _storeId;
  bool userIsStoreStaff = false;

  Uri _uri(String path) => Uri.parse('${LojaBackend.apiUrl.replaceAll(RegExp(r'/$'), '')}$path');
  String get publicCatalog => '/v1/shops/${LojaBackend.storeSlug}/catalog';
  String get storeId => _storeId ?? (throw StateError('Loja ainda não carregada.'));
  String get adminCatalog => '/v1/stores/$storeId/catalog';

  Future<String> fetchStoreId() async {
    if (_storeId != null) return _storeId!;
    final data = await request('GET', '/v1/shops/${LojaBackend.storeSlug}');
    _storeId = (data['store'] as Map)['id'] as String;
    return _storeId!;
  }

  Future<Map<String, dynamic>> request(String method, String path,
      {Object? body, bool authenticated = false, bool allowRefresh = true}) async {
    LojaBackend.validate();
    final token = _accessToken;
    final headers = <String, String>{'Accept': 'application/json'};
    if (body != null) headers['Content-Type'] = 'application/json';
    if (authenticated) {
      if (token == null) throw const LojaApiException('Entre novamente para continuar.', 401);
      headers['Authorization'] = 'Bearer $token';
    }
    final req = http.Request(method, _uri(path))..headers.addAll(headers);
    if (body != null) req.body = jsonEncode(body);
    late http.StreamedResponse stream;
    try {
      stream = await _http.send(req).timeout(const Duration(seconds: 15));
    } catch (_) {
      throw const LojaApiException('Não foi possível conectar ao servidor. Verifique sua internet.');
    }
    final response = await http.Response.fromStream(stream);
    if (response.statusCode == 401 && authenticated && allowRefresh && await _refresh()) {
      return request(method, path, body: body, authenticated: authenticated, allowRefresh: false);
    }
    Map<String, dynamic> result = {};
    if (response.body.isNotEmpty) {
      try {
        result = Map<String, dynamic>.from(jsonDecode(utf8.decode(response.bodyBytes)) as Map);
      } catch (_) {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          throw LojaApiException('Servidor retornou um erro (${response.statusCode}).', response.statusCode);
        }
        throw const LojaApiException('Resposta inválida do servidor.');
      }
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw LojaApiException(result['message']?.toString() ?? 'Falha na operação (${response.statusCode}).', response.statusCode);
    }
    return result;
  }

  Future<void> _saveTokens(Map<String, dynamic> result) async {
    _accessToken = result['accessToken'] as String?;
    _refreshToken = result['refreshToken'] as String?;
    if (_refreshToken != null) await _secure.write(key: 'loja_railway_refresh_v1', value: _refreshToken);
  }

  Future<bool> _refresh() async {
    if (_refreshing != null) return _refreshing!;
    final completer = Completer<bool>();
    _refreshing = completer.future;
    try {
      _refreshToken ??= await _secure.read(key: 'loja_railway_refresh_v1');
      final token = _refreshToken;
      if (token == null) { completer.complete(false); return false; }
      final result = await request('POST', '/v1/auth/refresh', body: {'refreshToken': token}, allowRefresh: false);
      await _saveTokens(result);
      completer.complete(true);
      return true;
    } catch (_) {
      await clearLocalSession();
      completer.complete(false);
      return false;
    } finally { _refreshing = null; }
  }

  Future<Map<String, dynamic>> login(String email, String password) async {
    final result = await request('POST', '/v1/auth/login', body: {'email': email, 'password': password});
    await _saveTokens(result);
    return result;
  }

  Future<Map<String, dynamic>> register(String email, String password) async {
    final name = email.split('@').first.trim();
    final result = await request('POST', '/v1/auth/register', body: {
      'email': email, 'password': password, 'name': name.length < 2 ? 'Cliente' : name,
    });
    await _saveTokens(result);
    return result;
  }

  Future<Map<String, dynamic>?> restore() async {
    _refreshToken ??= await _secure.read(key: 'loja_railway_refresh_v1');
    if (_refreshToken == null || !await _refresh()) return null;
    return await request('GET', '/v1/me', authenticated: true);
  }

  Future<bool> updateStoreRole() async {
    await fetchStoreId();
    final result = await request('GET', '/v1/stores/mine', authenticated: true);
    final entries = (result['stores'] as List? ?? const []);
    userIsStoreStaff = entries.any((e) => e is Map && e['id'] == _storeId &&
        (e['role'] == 'OWNER' || e['role'] == 'MANAGER' || e['role'] == 'STAFF'));
    return userIsStoreStaff;
  }

  Future<void> logout() async {
    try { await request('POST', '/v1/auth/logout', authenticated: true); } catch (_) { /* sessão pode estar expirada */ }
    await clearLocalSession();
  }

  Future<void> clearLocalSession() async {
    _accessToken = null;
    _refreshToken = null;
    userIsStoreStaff = false;
    await _secure.delete(key: 'loja_railway_refresh_v1');
  }

  /// SSE público: cada evento anuncia alteração, mas nunca traz dados privados.
  /// A assinatura busca estado completo ao abrir e ao reconectar (sem perder eventos).
  Stream<int> catalogChanges() async* {
    while (true) {
      try {
        final req = http.Request('GET', _uri('$publicCatalog/events'));
        final resp = await _http.send(req).timeout(const Duration(seconds: 15));
        if (resp.statusCode != 200) throw LojaApiException('SSE indisponível (${resp.statusCode}).');
        var nextRecheck = DateTime.now().add(const Duration(minutes: 2));
        await for (final line in resp.stream.transform(utf8.decoder).transform(const LineSplitter())) {
          if (line.startsWith('data:')) {
            yield 1;
            nextRecheck = DateTime.now().add(const Duration(minutes: 2));
          } else if (line.startsWith(':') && DateTime.now().isAfter(nextRecheck)) {
            // Rede instável ou notificação perdida: ressincronização preventiva.
            yield 1;
            nextRecheck = DateTime.now().add(const Duration(minutes: 2));
          }
        }
      } catch (_) { /* reconectar: a próxima conexão aciona nova leitura */ }
      await Future<void>.delayed(const Duration(seconds: 4));
    }
  }
  /// Eventos privados de pedidos. Recebe apenas aviso de mudança; busca os
  /// registros completos via API autenticada e sempre revalida após reconectar.
  Stream<int> orderChanges({required bool admin}) async* {
    while (true) {
      try {
        if (_accessToken == null && !await _refresh()) {
          throw const LojaApiException('Faça login para acompanhar pedidos.', 401);
        }
        if (admin) await fetchStoreId();
        final path = admin
            ? '/v1/stores/$storeId/orders/events'
            : '/v1/shops/${LojaBackend.storeSlug}/orders/events';
        final req = http.Request('GET', _uri(path));
        req.headers['Authorization'] = 'Bearer $_accessToken';
        req.headers['Accept'] = 'text/event-stream';
        final resp = await _http.send(req).timeout(const Duration(seconds: 15));
        if (resp.statusCode == 401) {
          if (!await _refresh()) throw const LojaApiException('Sessão encerrada.', 401);
          continue;
        }
        if (resp.statusCode != 200) {
          throw LojaApiException('Eventos de pedidos indisponíveis (${resp.statusCode}).');
        }
        await for (final line in resp.stream.transform(utf8.decoder).transform(const LineSplitter())) {
          if (line.startsWith('data:')) yield 1;
        }
      } catch (_) { /* redes instáveis: reconexão automática */ }
      await Future<void>.delayed(const Duration(seconds: 4));
    }
  }

}
