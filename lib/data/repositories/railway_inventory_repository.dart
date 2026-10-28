import 'package:uuid/uuid.dart';
import '../../core/network/loja_api.dart';

/// Operações administrativas de inventário, com autorização sempre no servidor.
class RailwayInventoryRepository {
  final LojaApi _api = LojaApi.instance;

  Future<String> _root() async {
    await _api.fetchStoreId();
    return '/v1/stores/${_api.storeId}';
  }

  Future<Map<String, dynamic>> summary() async =>
      _api.request('GET', '${await _root()}/operations/summary', authenticated: true);

  Future<Map<String, dynamic>> inventory({
    String search = '',
    bool onlyLow = false,
    int threshold = 5,
    int page = 1,
  }) async {
    final root = await _root();
    final query = Uri(queryParameters: {
      'q': search,
      'onlyLow': onlyLow.toString(),
      'threshold': threshold.toString(),
      'page': page.toString(),
      'limit': '50',
    }).query;
    return _api.request('GET', '$root/inventory?$query', authenticated: true);
  }

  Future<List<Map<String, dynamic>>> movements({String? variantId}) async {
    final root = await _root();
    final query = Uri(queryParameters: {
      if (variantId != null) 'variantId': variantId,
      'limit': '60',
    }).query;
    final result = await _api.request('GET', '$root/inventory/movements?$query', authenticated: true);
    return (result['movements'] as List? ?? const [])
        .map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  /// requestId é gerado uma vez por operação. Em caso de timeout, reutilizar
  /// o mesmo valor em vez de criar uma segunda baixa de estoque.
  String newOperationId() => const Uuid().v4();

  Future<Map<String, dynamic>> adjust({
    required String variantId,
    required String requestId,
    required int delta,
    required String notes,
  }) async => _api.request('POST', '${await _root()}/inventory/$variantId/adjust',
      authenticated: true,
      body: {'requestId': requestId, 'delta': delta, 'notes': notes});
}
