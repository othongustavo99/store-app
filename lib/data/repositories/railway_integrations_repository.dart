import '../../core/network/loja_api.dart';

/// API administrativa de integrações. Jamais utiliza tokens de ERP no Flutter.
/// Todas as operações sensíveis são autorizadas novamente no servidor (OWNER).
class RailwayIntegrationsRepository {
  RailwayIntegrationsRepository({LojaApi? api}) : _api = api ?? LojaApi.instance;

  final LojaApi _api;

  Future<String> _base() async {
    final storeId = await _api.fetchStoreId();
    return '/v1/stores/$storeId/integrations';
  }

  Future<bool> isOwner() async {
    final storeId = await _api.fetchStoreId();
    final response = await _api.request(
      'GET', '/v1/stores/mine', authenticated: true);
    final stores = response['stores'] as List? ?? const [];
    return stores.any((item) => item is Map &&
        item['id'] == storeId && item['role'] == 'OWNER');
  }

  Future<List<Map<String, dynamic>>> list() async {
    final response = await _api.request(
      'GET', await _base(), authenticated: true);
    return (response['integrations'] as List? ?? const [])
        .map((entry) => Map<String, dynamic>.from(entry as Map))
        .toList();
  }

  Future<Map<String, dynamic>> delivery(String integrationId) async =>
      _api.request('GET', '${await _base()}/$integrationId/delivery?limit=20',
          authenticated: true);

  /// Sinal do ultimo ciclo do worker, nao verifica disponibilidade do ERP.
  Future<Map<String, dynamic>> health(String integrationId) async =>
      _api.request('GET', '${await _base()}/$integrationId/health',
          authenticated: true);

  /// Checklist técnico por loja. Não verifica a API do ERP nem a homologação.
  Future<Map<String, dynamic>> readiness(String integrationId) async =>
      _api.request('GET', '${await _base()}/$integrationId/readiness',
          authenticated: true);

  /// A chave retornada não deve ser persistida, exibida em logs ou analytics.
  Future<Map<String, dynamic>> create({
    required String name,
    required String provider,
    required bool catalogAuthority,
    required bool stockAuthority,
    required bool orderAuthority,
    required bool customerDataAccess,
  }) async => _api.request('POST', await _base(), authenticated: true, body: {
    'name': name.trim(),
    'provider': provider,
    'catalogAuthority': catalogAuthority,
    'stockAuthority': stockAuthority,
    'orderAuthority': orderAuthority,
    'customerDataAccess': customerDataAccess,
  });

  Future<void> revoke(String integrationId) async {
    await _api.request('POST', '${await _base()}/$integrationId/revoke',
        authenticated: true);
  }

  /// Reprocessa apenas eventos DEAD; operações incertas no ERP ainda
  /// exigem conciliação antes de habilitar exportação de novos pedidos.
  Future<void> retryEvent(String integrationId, String eventId) async {
    await _api.request('POST',
        '${await _base()}/$integrationId/events/$eventId/retry',
        authenticated: true);
  }
}
