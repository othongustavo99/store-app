import '../../core/network/loja_api.dart';
import 'package:uuid/uuid.dart';

/// Solicitações de pós-venda: registram o processo, não executam estorno no gateway.
class RailwayAfterSalesRepository {
  final LojaApi _api = LojaApi.instance;

  Future<List<Map<String, dynamic>>> list({required bool admin}) async {
    final path = admin
        ? '/v1/stores/${await _api.fetchStoreId()}/after-sales/requests'
        : '/v1/shops/${LojaBackend.storeSlug}/after-sales/requests';
    final response = await _api.request('GET', path, authenticated: true);
    return (response['requests'] as List? ?? const [])
        .map((entry) => Map<String, dynamic>.from(entry as Map))
        .toList();
  }

  Future<void> request({required String orderId, required String type,
      required String reason}) async {
    await _api.request('POST',
      '/v1/shops/${LojaBackend.storeSlug}/orders/$orderId/after-sales',
      authenticated: true, body: {
        'idempotencyKey': const Uuid().v4(),
        'type': type,
        'reason': reason.trim(),
      });
  }

  Future<void> update({required String caseId, required String status,
      required String note}) async {
    await _api.request('PATCH',
      '/v1/stores/${await _api.fetchStoreId()}/after-sales/requests/$caseId',
      authenticated: true, body: {'status': status, 'note': note.trim()});
  }

  Future<bool> canReview() async {
    final store = await _api.fetchStoreId();
    final response = await _api.request('GET', '/v1/stores/mine', authenticated: true);
    return (response['stores'] as List? ?? const []).any((entry) => entry is Map &&
      entry['id'] == store && (entry['role'] == 'OWNER' || entry['role'] == 'MANAGER'));
  }
}
