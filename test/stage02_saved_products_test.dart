import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:loja_roupas/core/network/loja_api.dart';
import 'package:loja_roupas/data/repositories/cart_repository.dart';
import 'package:loja_roupas/data/repositories/product_repository.dart';
import 'package:loja_roupas/features/client/cart/cart_screen.dart';
import 'package:loja_roupas/features/client/favorites/favorites_screen.dart';
import 'package:loja_roupas/models/product.dart';
import 'package:loja_roupas/providers/cart_providers.dart';
import 'package:loja_roupas/providers/favorites_providers.dart';
import 'package:loja_roupas/providers/product_providers.dart';
import 'package:loja_roupas/providers/store_profile_providers.dart';

Product product(String id, {int stock = 5, double price = 79.9}) => Product(
      id: id,
      name: 'Produto $id',
      description: '',
      price: price,
      categoryId: 'c1',
      images: const [],
      createdAt: DateTime(2026),
      variants: [ProductVariant(color: 'Preto', size: 'M', stock: stock)],
    );

String get favoritesKey =>
    'loja_favorites_v1_${LojaBackend.storeSlug.isEmpty ? 'legado' : LojaBackend.storeSlug}';

class SavedRepository extends ProductRepository {
  SavedRepository(this.load);
  final Future<List<Product>> Function(Iterable<String>) load;
  @override
  Future<List<Product>> getByIds(Iterable<String> ids) => load(ids);
  @override
  Stream<List<Product>> watchAll() =>
      throw StateError('Favoritos não devem consultar a Home');
}

Future<void> saveCart(String id) async {
  final cart = CartRepository(loadProductsByIds: (_) async => []);
  cart.addItem(product: product(id), color: 'Preto', size: 'M', quantity: 3);
  await cart.pendingWrite;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('recupera produto 80 pelo ID com preço e estoque atualizados', () async {
    await saveCart('p80');
    final repository = CartRepository(loadProductsByIds: (ids) async {
      expect(ids.toList(), ['p80']);
      return [product('p80', price: 89.9, stock: 2)];
    });
    final items = await repository.restore();
    expect(items.single.product.id, 'p80');
    expect(items.single.product.price, 89.9);
    expect(items.single.quantity, 2);
    await repository.pendingWrite;
  });

  test('falha de rede preserva o cache e permite recuperar depois', () async {
    await saveCart('p80');
    final preferences = await SharedPreferences.getInstance();
    final key =
        preferences.getKeys().singleWhere((key) => key.startsWith('cart_v2_'));
    final before = preferences.getString(key);
    final unavailable = CartRepository(
        loadProductsByIds: (_) async => throw StateError('offline'));
    await expectLater(unavailable.restore(), throwsStateError);
    expect(preferences.getString(key), before);
    final online =
        CartRepository(loadProductsByIds: (_) async => [product('p80')]);
    expect((await online.restore()).single.product.id, 'p80');
    await online.pendingWrite;
  });

  test('interação durante recuperação vence os dados antigos', () async {
    await saveCart('old');
    final response = Completer<List<Product>>();
    final started = Completer<void>();
    final repository = CartRepository(loadProductsByIds: (_) {
      started.complete();
      return response.future;
    });
    final restore = repository.restore();
    await started.future;
    repository.addItem(product: product('new'), color: 'Preto', size: 'M');
    response.complete([product('old')]);
    expect((await restore).map((line) => line.product.id), ['new']);
    await repository.pendingWrite;
  });

  test('notifier tenta novamente após falha sem exigir reiniciar o aplicativo',
      () async {
    await saveCart('p80');
    var online = false;
    var requests = 0;
    final notifier = CartNotifier(CartRepository(loadProductsByIds: (_) async {
      requests++;
      if (!online) throw StateError('offline');
      return [product('p80')];
    }));
    addTearDown(notifier.dispose);
    await expectLater(notifier.restore(), throwsStateError);
    online = true;
    await notifier.restore();
    expect(notifier.state.single.product.id, 'p80');
    expect(requests, 2);
  });

  test('favoritar durante inicialização conserva favoritos anteriores',
      () async {
    SharedPreferences.setMockInitialValues({
      favoritesKey: ['old']
    });
    final notifier = FavoritesNotifier();
    addTearDown(notifier.dispose);
    await notifier.toggle('p80');
    expect(notifier.state, {'old', 'p80'});
    final preferences = await SharedPreferences.getInstance();
    expect(preferences.getStringList(favoritesKey), ['old', 'p80']);
  });

  test('toques rápidos não deixam gravação antiga sobrescrever a lista final',
      () async {
    final notifier = FavoritesNotifier();
    addTearDown(notifier.dispose);
    await Future.wait([notifier.toggle('p80'), notifier.toggle('p80')]);
    expect(notifier.state, isEmpty);
    expect((await SharedPreferences.getInstance()).getStringList(favoritesKey),
        isEmpty);
  });

  testWidgets(
      'favoritos exibem produto fora da Home sem consultar a seleção inicial',
      (tester) async {
    SharedPreferences.setMockInitialValues({
      favoritesKey: ['p80']
    });
    await tester.pumpWidget(ProviderScope(overrides: [
      productRepositoryProvider.overrideWithValue(SavedRepository((ids) async {
        expect(ids.toList(), ['p80']);
        return [product('p80')];
      })),
      storeProfileEventsProvider
          .overrideWith((ref) => const Stream<int>.empty()),
    ], child: const MaterialApp(home: FavoritesScreen())));
    await tester.pumpAndSettle();
    expect(find.text('Produto p80'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('erro nos favoritos preserva IDs e o botão recupera a lista',
      (tester) async {
    SharedPreferences.setMockInitialValues({
      favoritesKey: ['p80']
    });
    var online = false;
    await tester.pumpWidget(ProviderScope(overrides: [
      productRepositoryProvider.overrideWithValue(SavedRepository((_) async {
        if (!online) throw StateError('offline');
        return [product('p80')];
      })),
      storeProfileEventsProvider
          .overrideWith((ref) => const Stream<int>.empty()),
    ], child: const MaterialApp(home: FavoritesScreen())));
    await tester.pumpAndSettle();
    expect(
        find.text('Não foi possível carregar seus favoritos'), findsOneWidget);
    expect((await SharedPreferences.getInstance()).getStringList(favoritesKey),
        ['p80']);
    online = true;
    await tester.tap(find.text('Tentar novamente'));
    await tester.pumpAndSettle();
    expect(find.text('Produto p80'), findsOneWidget);
  });

  testWidgets(
      'produto indisponível não é confundido com lista de favoritos vazia',
      (tester) async {
    SharedPreferences.setMockInitialValues({
      favoritesKey: ['p80']
    });
    await tester.pumpWidget(ProviderScope(overrides: [
      productRepositoryProvider
          .overrideWithValue(SavedRepository((_) async => [])),
      storeProfileEventsProvider
          .overrideWith((ref) => const Stream<int>.empty()),
    ], child: const MaterialApp(home: FavoritesScreen())));
    await tester.pumpAndSettle();
    expect(find.textContaining('Os produtos salvos estão indisponíveis'),
        findsOneWidget);
    expect((await SharedPreferences.getInstance()).getStringList(favoritesKey),
        ['p80']);
  });

  testWidgets(
      'carrinho com falha de rede oferece recuperação e volta a mostrar os itens',
      (tester) async {
    await saveCart('p80');
    var online = false;
    await tester.pumpWidget(ProviderScope(overrides: [
      cartRepositoryProvider
          .overrideWithValue(CartRepository(loadProductsByIds: (_) async {
        if (!online) throw StateError('offline');
        return [product('p80')];
      })),
    ], child: const MaterialApp(home: CartScreen())));
    await tester.pumpAndSettle();
    expect(
        find.text('Não foi possível recuperar seu carrinho'), findsOneWidget);
    online = true;
    await tester.tap(find.text('Tentar novamente'));
    await tester.pumpAndSettle();
    expect(find.text('Produto p80'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
