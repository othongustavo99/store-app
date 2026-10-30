import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:loja_roupas/data/repositories/railway_catalog_repository.dart';
import 'package:loja_roupas/features/client/search/railway_search_screen.dart';
import 'package:loja_roupas/models/catalog_page.dart';
import 'package:loja_roupas/models/category.dart';
import 'helpers/stage03_fixtures.dart';

class DiscoveryRepository extends RailwayCatalogRepository {
  final calls = <Map<String, String>>[];
  Future<CatalogPage> Function(Map<String, String>)? response;
  @override
  Future<List<Category>> getCategories() async => previewCategories;
  @override
  Future<CatalogFilters> getFilters() async => const CatalogFilters(
      colors: ['Areia', 'Azul', 'Lavanda'], sizes: ['M', 'G', '38', '42']);
  @override
  Future<CatalogPage> search(Map<String, String> query) async {
    calls.add(Map.of(query));
    if (response != null) return response!(query);
    final items = previewProducts
        .where((product) => query['new'] != 'true' || product.isNew)
        .toList();
    if (query['sort'] == 'price_asc') {
      items.sort((a, b) => a.price.compareTo(b.price));
    }
    if (query['sort'] == 'price_desc') {
      items.sort((a, b) => b.price.compareTo(a.price));
    }
    return CatalogPage(items, null);
  }
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('categoria da navegação é aplicada e pode ser removida',
      (tester) async {
    await tester.runAsync(seedPreviewImages);
    final repository = DiscoveryRepository();
    await tester.pumpWidget(previewApp(RailwaySearchScreen(
        repository: repository,
        initialFilters: const {'categoryId': 'categoria-indisponivel'})));
    await tester.pumpAndSettle();
    expect(repository.calls.last['categoryId'], 'categoria-indisponivel');
    expect(find.text('Filtros (1)'), findsOneWidget);
    await tester.tap(find.text('Filtros (1)'));
    await tester.pumpAndSettle();
    expect(find.text('Categoria selecionada'), findsOneWidget);
    await tester.tap(find.byTooltip('Fechar filtros'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Limpar filtros'));
    await tester.pumpAndSettle();
    expect(repository.calls.last['categoryId'], isNull);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'filtros exibem opções da loja e só consultam produtos ao aplicar',
      (tester) async {
    tester.view.physicalSize = const Size(390, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.runAsync(seedPreviewImages);
    final repository = DiscoveryRepository();
    await tester
        .pumpWidget(previewApp(RailwaySearchScreen(repository: repository)));
    await tester.pumpAndSettle();
    final before = repository.calls.length;
    await tester.tap(find.text('Filtrar'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('Cor:null')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Lavanda').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('Tamanho:null')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('42').last);
    await tester.pumpAndSettle();
    expect(repository.calls.length, before);
    await tester.tap(find.text('Ver produtos'));
    await tester.pumpAndSettle();
    expect(repository.calls.last['color'], 'Lavanda');
    expect(repository.calls.last['size'], '42');
    expect(find.text('Filtros (2)'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('preços inválidos mostram orientação sem enviar consulta',
      (tester) async {
    await tester.runAsync(seedPreviewImages);
    final repository = DiscoveryRepository();
    await tester
        .pumpWidget(previewApp(RailwaySearchScreen(repository: repository)));
    await tester.pumpAndSettle();
    final before = repository.calls.length;
    await tester.tap(find.text('Filtrar'));
    await tester.pumpAndSettle();
    await tester.enterText(
        find.widgetWithText(TextField, 'Preço mínimo'), '90');
    await tester.enterText(
        find.widgetWithText(TextField, 'Preço máximo'), '10');
    await tester.tap(find.text('Ver produtos'));
    await tester.pumpAndSettle();
    expect(find.text('O preço mínimo deve ser menor que o máximo.'),
        findsOneWidget);
    expect(repository.calls.length, before);
    await tester.tap(find.byTooltip('Fechar filtros'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'ordenar altera o pedido ao servidor e preserva o filtro da vitrine',
      (tester) async {
    tester.view.physicalSize = const Size(1200, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.runAsync(seedPreviewImages);
    final repository = DiscoveryRepository();
    await tester.pumpWidget(previewApp(RailwaySearchScreen(
        repository: repository, initialFilters: const {'new': 'true'})));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Mais recentes').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Menor preço').last);
    await tester.pumpAndSettle();
    expect(repository.calls.last['sort'], 'price_asc');
    expect(repository.calls.last['new'], 'true');
    await tester.tap(find.text('Limpar filtros'));
    await tester.pumpAndSettle();
    expect(repository.calls.last['new'], isNull);
    expect(repository.calls.last['sort'], 'price_asc');
    await savePreview(tester, 'busca-desktop');
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'resultado atrasado de uma busca antiga não substitui a busca atual',
      (tester) async {
    await tester.runAsync(seedPreviewImages);
    final pending = Completer<CatalogPage>();
    final repository = DiscoveryRepository()
      ..response = (query) async {
        if (query['q'] == 'antiga') return pending.future;
        return CatalogPage([previewProducts[2]], null);
      };
    await tester
        .pumpWidget(previewApp(RailwaySearchScreen(repository: repository)));
    await tester.pumpAndSettle();
    final input = find.widgetWithText(TextField, 'Busque uma peça ou estilo');
    await tester.enterText(input, 'antiga');
    await tester.pump(const Duration(milliseconds: 400));
    await tester.enterText(input, 'nova');
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();
    pending.complete(CatalogPage([previewProducts.first], null));
    await tester.pumpAndSettle();
    expect(find.text('Calça reta'), findsOneWidget);
    expect(find.text('Camisa de linho'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('busca e filtros cabem no celular estreito com texto ampliado',
      (tester) async {
    tester.view.physicalSize = const Size(320, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.runAsync(seedPreviewImages);
    await tester.pumpWidget(previewApp(
        RailwaySearchScreen(repository: DiscoveryRepository()),
        textScale: 1.3));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.tap(find.text('Filtrar'));
    await tester.pumpAndSettle();
    expect(find.text('Ver produtos'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
