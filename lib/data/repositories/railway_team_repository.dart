import '../../core/network/loja_api.dart';

/// Equipes são gerenciadas pela API; nenhuma autorização depende da UI.
class RailwayTeamRepository {
  final LojaApi _api = LojaApi.instance;

  Future<String> _base() async {
    final storeId = await _api.fetchStoreId();
    return '/v1/stores/$storeId/team';
  }

  Future<Map<String, dynamic>> team() async =>
      _api.request('GET', await _base(), authenticated: true);

  Future<Map<String, dynamic>> invite({
    required String email,
    required String role,
  }) async => _api.request('POST', '${await _base()}/invitations',
      authenticated: true, body: {'email': email.trim().toLowerCase(), 'role': role});

  Future<void> revokeInvitation(String id) async {
    await _api.request('POST', '${await _base()}/invitations/$id/revoke',
        authenticated: true);
  }

  Future<void> updateMemberRole(String userId, String role) async {
    await _api.request('PATCH', '${await _base()}/members/$userId',
        authenticated: true, body: {'role': role});
  }

  Future<void> removeMember(String userId) async {
    await _api.request('DELETE', '${await _base()}/members/$userId',
        authenticated: true);
  }

  Future<void> acceptInvitation(String code) async {
    await _api.request('POST', '/v1/team/invitations/accept',
        authenticated: true, body: {'code': code.trim(), 'storeId': await _api.fetchStoreId()});
  }
}
