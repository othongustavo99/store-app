import '../../core/network/loja_api.dart';
import '../../models/cart_item.dart';

class RailwayCouponRepository {
 final LojaApi api=LojaApi.instance;
 Future<Map<String,dynamic>> preview(String code,List<CartItem> cart) => api.request('POST',
  '/v1/shops/${LojaBackend.storeSlug}/coupons/preview',authenticated:true,body:{
    'code':code.trim().toUpperCase(),
    'items':[for(final c in cart){'productId':c.product.id,'color':c.color,'size':c.size,'quantity':c.quantity}]
  });
 Future<List<Map<String,dynamic>>> list() async {
  final store=await api.fetchStoreId();
  final response=await api.request('GET','/v1/stores/$store/coupons',authenticated:true);
  return [for(final row in response['coupons'] as List) Map<String,dynamic>.from(row as Map)];
 }
 Future<void> create({required String code,required String type,required int amount,
  required int minCents,int? maxUses,required int maxPerCustomer,DateTime? expiresAt}) async {
  final store=await api.fetchStoreId();
  await api.request('POST','/v1/stores/$store/coupons',authenticated:true,body:{
    'code':code.trim().toUpperCase(),'discountType':type,'amount':amount,
    'minimumSubtotalCents':minCents,'maxUses':maxUses,'maxUsesPerUser':maxPerCustomer,
    'startsAt':null,'expiresAt':expiresAt?.toUtc().toIso8601String(),'active':true
  });
 }
 Future<void> setActive(String id,bool active) async {
  final store=await api.fetchStoreId();
  await api.request('PATCH','/v1/stores/$store/coupons/$id',authenticated:true,body:{'active':active});
 }
}
