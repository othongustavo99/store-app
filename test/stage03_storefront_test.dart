import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:loja_roupas/core/network/loja_api.dart';
import 'package:loja_roupas/features/client/home/home_screen.dart';
import 'package:loja_roupas/features/client/product_detail/product_detail_screen.dart';
import 'package:loja_roupas/features/client/widgets/product_media_gallery.dart';
import 'package:loja_roupas/features/client/widgets/product_purchase_bar.dart';
import 'package:loja_roupas/features/client/widgets/empty_state.dart';
import 'package:loja_roupas/providers/cart_providers.dart';
import 'helpers/stage03_fixtures.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  for (final layout in [
    (390.0, 980.0, 1.0),
    (320.0, 800.0, 1.3),
    (1200.0, 900.0, 1.0)
  ]) {
    testWidgets('vitrine cabe em ${layout.$1}px com texto ${layout.$3}',
        (tester) async {
      tester.view.physicalSize = Size(layout.$1, layout.$2);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.runAsync(seedPreviewImages);
      await tester
          .pumpWidget(previewApp(const HomeScreen(), textScale: layout.$3));
      await tester.pumpAndSettle();
      expect(find.text('Vila Moda'), findsOneWidget);
      expect(find.text('Ver coleção'), findsOneWidget);
      expect(tester.takeException(), isNull);
      if (layout.$3 == 1) {
        await savePreview(
            tester, layout.$1 < 600 ? 'vitrine-celular' : 'vitrine-desktop');
      }
    });
  }

  testWidgets('peças com várias marcações não se repetem em seções diferentes',
      (tester) async {
    await tester.runAsync(seedPreviewImages);
    final product = previewProducts.first
        .copyWith(isFeatured: true, isNew: true, oldPrice: 120);
    await tester
        .pumpWidget(previewApp(const HomeScreen(), products: [product]));
    await tester.pumpAndSettle();
    expect(find.text('Seleção da loja'), findsOneWidget);
    expect(find.text('Bons achados'), findsNothing);
    expect(find.text('Acabaram de chegar'), findsNothing);
    expect(find.text('Todos os produtos'), findsNothing);
  });

  testWidgets('selecionar cor troca foto e adiciona a combinação correta',
      (tester) async {
    tester.view.physicalSize = const Size(390, 980);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.runAsync(seedPreviewImages);
    final product = previewProducts.first;
    await tester
        .pumpWidget(previewApp(ProductDetailScreen(productId: product.id)));
    await tester.pumpAndSettle();
    expect(
        tester
            .widget<ProductMediaGallery>(find.byType(ProductMediaGallery))
            .images
            .first,
        photo('piece-0'));
    final blue = find.widgetWithText(ChoiceChip, 'Azul');
    await tester.ensureVisible(blue);
    await tester.tap(blue);
    await tester.pumpAndSettle();
    expect(
        tester
            .widget<ProductMediaGallery>(find.byType(ProductMediaGallery))
            .images
            .first,
        photo('blue-0'));
    final unavailable =
        tester.widget<ChoiceChip>(find.widgetWithText(ChoiceChip, 'G'));
    expect(unavailable.onSelected, isNull);
    await tester.tap(find.text('Adicionar'));
    await tester.pumpAndSettle();
    final container = ProviderScope.containerOf(
        tester.element(find.byType(ProductDetailScreen)));
    expect(container.read(cartProvider).single.color, 'Azul');
    expect(container.read(cartProvider).single.size, 'M');
    expect(find.textContaining('item adicionado ao carrinho'), findsOneWidget);
    ScaffoldMessenger.of(tester.element(find.byType(ProductDetailScreen)))
        .hideCurrentSnackBar();
    await tester.pumpAndSettle();
    // Volta ao topo para inspecionar a imagem escolhida na prévia.
    final scrollable = tester.state<ScrollableState>(find
        .descendant(
            of: find.byType(CustomScrollView).first,
            matching: find.byType(Scrollable))
        .first);
    scrollable.position.jumpTo(0);
    await tester.pumpAndSettle();
    await savePreview(tester, 'produto-celular');
    expect(tester.takeException(), isNull);
  });

  testWidgets('produto abre mesmo quando a Home falha no modo Railway',
      (tester) async {
    await tester.runAsync(seedPreviewImages);
    await tester.pumpWidget(previewApp(
        ProductDetailScreen(productId: previewProducts.first.id),
        homeError: true));
    await tester.pumpAndSettle();
    expect(find.byType(ProductPurchaseBar), findsOneWidget);
    expect(find.text('Não foi possível abrir esta peça'), findsNothing);
    expect(tester.takeException(), isNull);
  }, skip: !LojaBackend.isRailway);

  testWidgets('barra de compra cabe com texto ampliado e preço extenso',
      (tester) async {
    tester.view.physicalSize = const Size(320, 568);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    var added = false, bought = false;
    await tester.pumpWidget(previewApp(
        Scaffold(
            body: const SizedBox(),
            bottomNavigationBar: ProductPurchaseBar(
                selection: 'Azul marinho · Extra grande · 20 un.',
                total: 'R\$ 19.999,90',
                available: true,
                onAdd: () => added = true,
                onBuy: () => bought = true)),
        textScale: 1.3));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Adicionar'));
    await tester.tap(find.text('Comprar agora'));
    expect(added && bought, isTrue);
    expect(tester.takeException(), isNull);
  });

  testWidgets('peça esgotada mantém ações de compra desabilitadas',
      (tester) async {
    await tester.pumpWidget(previewApp(Scaffold(
        body: ProductPurchaseBar(
            selection: 'Esgotado',
            total: 'R\$ 89,90',
            available: false,
            onAdd: () => fail('Adição indevida'),
            onBuy: () => fail('Compra indevida')))));
    await tester.pumpAndSettle();
    expect(
        tester
            .widget<FilledButton>(
                find.widgetWithText(FilledButton, 'Indisponível'))
            .onPressed,
        isNull);
  });

  testWidgets('estado vazio permanece utilizável em uma área pequena',
      (tester) async {
    await tester.pumpWidget(previewApp(const Scaffold(
        body: SizedBox(
            width: 320,
            height: 180,
            child: EmptyState(
                icon: Icons.search_off,
                title: 'Nenhuma peça por aqui',
                subtitle: 'Ajuste os filtros e tente novamente.')))));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
