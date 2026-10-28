import '../../core/network/loja_api.dart';

/// Fase 4.8: só metadados públicos da loja. Senhas e tokens nunca vão ao Flutter.
class RailwayStoreProfileRepository {
  final LojaApi _api = LojaApi.instance;

  Future<Map<String, dynamic>> publicProfile() => _api.request(
        'GET', '/v1/shops/${LojaBackend.storeSlug}/profile');

  Future<Map<String, dynamic>> adminProfile() async {
    final id = await _api.fetchStoreId();
    return _api.request('GET', '/v1/stores/$id/profile', authenticated: true);
  }

  Future<Map<String, dynamic>> readiness() async {
    final id = await _api.fetchStoreId();
    return _api.request('GET', '/v1/stores/$id/readiness', authenticated: true);
  }

  Future<Map<String, dynamic>> saveProfile(Map<String, dynamic> profile) async {
    final id = await _api.fetchStoreId();
    return _api.request('PUT', '/v1/stores/$id/profile',
        authenticated: true, body: profile);
  }
}
