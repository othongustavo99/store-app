import '../../core/network/loja_api.dart';
import '../../models/cart_item.dart';

class RailwayShippingRepository {
  final LojaApi _api = LojaApi.instance;
  String get _shop => '/v1/shops/${LojaBackend.storeSlug}';

  Future<Map<String, dynamic>> availability() =>
      _api.request('GET', '$_shop/shipping/availability');

  Future<Map<String, dynamic>> quote(List<CartItem> items, String postalCode) =>
      _api.request('POST', '$_shop/shipping/quotes', authenticated: true, body: {
        'destinationPostalCode': postalCode,
        'items': items.map((i) => {
          'productId': i.product.id, 'color': i.color, 'size': i.size,
          'quantity': i.quantity,
        }).toList(),
      });

  Future<Map<String, dynamic>> setup() async {
    final id = await _api.fetchStoreId();
    return _api.request('GET', '/v1/stores/$id/shipping/setup', authenticated: true);
  }

  Future<void> saveOrigin(String zip) async {
    final id = await _api.fetchStoreId();
    await _api.request('PUT', '/v1/stores/$id/shipping/origin',
      authenticated: true, body: {'originPostalCode': zip});
  }

  Future<void> saveParcel(String variantId, Map<String, double> profile) async {
    final id = await _api.fetchStoreId();
    await _api.request('PUT', '/v1/stores/$id/shipping/parcels/$variantId',
      authenticated: true, body: profile);
  }

  Future<void> postShipment(String orderId, String trackingCode) async {
    final id = await _api.fetchStoreId();
    await _api.request('PUT', '/v1/stores/$id/orders/$orderId/shipment',
      authenticated: true, body: {'trackingCode': trackingCode});
  }

  Future<void> delivered(String orderId) async {
    final id = await _api.fetchStoreId();
    await _api.request('PATCH', '/v1/stores/$id/orders/$orderId/shipment/status',
      authenticated: true, body: {'status':'DELIVERED'});
  }
}
