import '../../core/network/loja_api.dart';

/// Atendimento vinculado à loja; o backend é responsável pelo isolamento.
class RailwaySupportRepository {
  final LojaApi _api = LojaApi.instance;

  Future<String> _base(bool admin) async {
    if (admin) {
      final id = await _api.fetchStoreId();
      return '/v1/stores/$id/support';
    }
    return '/v1/shops/${LojaBackend.storeSlug}/support';
  }

  Future<List<Map<String, dynamic>>> tickets({required bool admin}) async {
    final data = await _api.request('GET', '${await _base(admin)}/tickets',
        authenticated: true);
    return (data['tickets'] as List? ?? const [])
        .map((x) => Map<String, dynamic>.from(x as Map)).toList();
  }

  Future<String> createTicket({
    required String subject,
    required String message,
    String? orderId,
  }) async {
    final data = await _api.request('POST', '${await _base(false)}/tickets',
        authenticated: true, body: {
          'subject': subject.trim(),
          'message': message.trim(),
          if (orderId != null) 'orderId': orderId,
        });
    return data['ticketId'] as String;
  }

  Future<Map<String, dynamic>> conversation(String ticketId,
      {required bool admin}) => _loadConversation(ticketId, admin);

  Future<Map<String, dynamic>> _loadConversation(String id, bool admin) async =>
      _api.request('GET', '${await _base(admin)}/tickets/$id/messages',
          authenticated: true);

  Future<void> send(String id, String message, {required bool admin}) async {
    await _api.request('POST', '${await _base(admin)}/tickets/$id/messages',
        authenticated: true, body: {'body': message.trim()});
  }

  Future<void> status(String id, String status, {required bool admin}) async {
    await _api.request('PATCH', '${await _base(admin)}/tickets/$id/status',
        authenticated: true, body: {'status': status});
  }
}
