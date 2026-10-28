import 'dart:async';

import 'package:uuid/uuid.dart';
import '../../core/network/loja_api.dart';
import '../../models/cart_item.dart';
import 'railway_after_sales_repository.dart';

/// Um checkout é criado apenas pelo servidor; o Flutter nunca define preço,
/// status pago, frete ou estoque disponível.
class RailwayOrderRepository {
  final LojaApi _api = LojaApi.instance;
  final RailwayAfterSalesRepository _afterSales = RailwayAfterSalesRepository();

  Future<bool> checkoutEnabled() async {
    final json = await _api.request('GET',
        '/v1/shops/${LojaBackend.storeSlug}/checkout/availability');
    return json['enabled'] == true;
  }

  Future<Map<String, dynamic>> createOrder({
    required List<CartItem> cart,
    required String customerName,
    required String customerPhone,
    required String idempotencyKey,
  }) async {
    final result = await _api.request(
      'POST', '/v1/shops/${LojaBackend.storeSlug}/checkout/orders',
      authenticated: true,
      body: {
        'idempotencyKey': idempotencyKey,
        'fulfillment': 'PICKUP',
        'customer': {'name': customerName.trim(), 'phone': customerPhone.trim()},
        'items': cart.map((c) => {
          'productId': c.product.id,
          'color': c.color,
          'size': c.size,
          'quantity': c.quantity,
        }).toList(),
      },
    );
    return result;
  }

  Future<String> retryCheckout(String orderId) async {
    final response = await _api.request('POST',
        '/v1/shops/${LojaBackend.storeSlug}/orders/$orderId/checkout',
        authenticated: true);
    final url = response['checkoutUrl'];
    if (url is! String || url.isEmpty) throw StateError('Link de pagamento indisponível.');
    return url;
  }

  Future<List<Map<String, dynamic>>> myOrders() async {
    final response = await _api.request('GET',
        '/v1/shops/${LojaBackend.storeSlug}/orders', authenticated: true);
    return _mergeCases(_list(response), await _afterSales.list(admin: false));
  }

  Future<List<Map<String, dynamic>>> adminOrders() async {
    await _api.fetchStoreId();
    final response = await _api.request('GET',
        '/v1/stores/${_api.storeId}/orders', authenticated: true);
    return _mergeCases(_list(response), await _afterSales.list(admin: true));
  }

  List<Map<String, dynamic>> _mergeCases(List<Map<String, dynamic>> orders,
      List<Map<String, dynamic>> requests) {
    for (final order in orders) {
      order['afterSalesRequests'] = requests
          .where((item) => item['orderId'] == order['id']).toList();
    }
    return orders;
  }

  Future<Map<String, dynamic>> changeStatus(String orderId, String status) async {
    await _api.fetchStoreId();
    final response = await _api.request('PATCH',
        '/v1/stores/${_api.storeId}/orders/$orderId/status',
        authenticated: true, body: {'status': status});
    return Map<String, dynamic>.from(response['order'] as Map);
  }

  Future<Map<String, dynamic>> timeline(String orderId, {required bool admin}) async {
    final path = admin
        ? '/v1/stores/${await _api.fetchStoreId()}/orders/$orderId/timeline'
        : '/v1/shops/${LojaBackend.storeSlug}/orders/$orderId/timeline';
    return _api.request('GET', path, authenticated: true);
  }

  List<Map<String, dynamic>> _list(Map<String, dynamic> data) =>
      (data['orders'] as List? ?? const [])
          .map((e) => Map<String, dynamic>.from(e as Map)).toList();

  static String newCheckoutKey() => const Uuid().v4();
}
