import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:loja_roupas/features/client/widgets/product_card.dart';
import 'package:loja_roupas/models/product.dart';

Product _product({required int stock, double? oldPrice}) => Product(
      id: 'test-item',
      name: 'Produto de teste com nome extenso para conferir a responsividade',
      description: 'Descrição de teste',
      price: 79.9,
      oldPrice: oldPrice,
      categoryId: 'teste',
      images: const [],
      variants: [ProductVariant(color: 'Preto', size: 'M', stock: stock)],
      createdAt: DateTime(2026, 10, 28),
    );

Future<void> _pumpCard(WidgetTester tester, Product product) async {
  await tester.pumpWidget(
    ProviderScope(
      child: MaterialApp(
        home: Scaffold(
          body: Center(
            child: SizedBox(
              width: 160,
              height: 318,
              child: ProductCard(product: product),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('mostra produto esgotado sem transbordar na largura móvel',
      (tester) async {
    await _pumpCard(tester, _product(stock: 0));
    expect(find.text('Esgotado'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('permite favoritar e desfavoritar o produto', (tester) async {
    await _pumpCard(tester, _product(stock: 3));
    await tester.tap(find.byTooltip('Adicionar aos favoritos'));
    await tester.pumpAndSettle();
    expect(find.byTooltip('Remover dos favoritos'), findsOneWidget);

    await tester.tap(find.byTooltip('Remover dos favoritos'));
    await tester.pumpAndSettle();
    expect(find.byTooltip('Adicionar aos favoritos'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('não mostra desconto artificial com preço anterior menor',
      (tester) async {
    await _pumpCard(tester, _product(stock: 3, oldPrice: 50));
    expect(find.textContaining('%'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('mostra desconto válido para produto em estoque', (tester) async {
    await _pumpCard(tester, _product(stock: 3, oldPrice: 100));
    expect(find.text('-20%'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
