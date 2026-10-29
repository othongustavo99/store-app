import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:loja_roupas/data/repositories/cart_repository.dart';
import 'package:loja_roupas/models/product.dart';

Product item({int stock=5, String id='p1'})=>Product(
  id:id,name:'Produto',description:'Teste',price:89.90,categoryId:'c1',
  images:const [],createdAt:DateTime(2026),
  variants:[ProductVariant(color:'Preto',size:'M',stock:stock)],
);

void main(){
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(()=>SharedPreferences.setMockInitialValues({}));

  test('carrinho volta após reinstanciar e respeita estoque atual',() async {
    final cart=CartRepository(loadCatalog:()async=>[item()]);
    cart.addItem(product:item(),color:'Preto',size:'M',quantity:4);
    await cart.pendingWrite;
    final fresh=CartRepository(loadCatalog:()async=>[item(stock:2)]);
    final recovered=await fresh.restore();
    expect(recovered,hasLength(1));
    expect(recovered.first.quantity,2);
    expect(recovered.first.product.price,89.90);
  });

  test('produto ausente do catálogo é descartado',()async{
    final cart=CartRepository(loadCatalog:()async=>[item()]);
    cart.addItem(product:item(),color:'Preto',size:'M');
    await cart.pendingWrite;
    final fresh=CartRepository(loadCatalog:()async=>[]);
    expect(await fresh.restore(),isEmpty);
  });

  test('limpeza é gravada no armazenamento',()async{
    final cart=CartRepository(loadCatalog:()async=>[item()]);
    cart.addItem(product:item(),color:'Preto',size:'M');
    cart.clear();
    await cart.pendingWrite;
    final fresh=CartRepository(loadCatalog:()async=>[item()]);
    expect(await fresh.restore(),isEmpty);
  });
}
