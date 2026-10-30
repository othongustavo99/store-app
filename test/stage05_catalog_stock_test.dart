import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:loja_roupas/core/network/loja_api.dart';
import 'package:loja_roupas/core/utils/admin_catalog_rules.dart';
import 'package:loja_roupas/data/repositories/railway_catalog_admin_repository.dart';
import 'package:loja_roupas/data/repositories/railway_inventory_repository.dart';
import 'package:loja_roupas/features/admin/products/railway_catalog_management_screen.dart';
import 'package:loja_roupas/features/admin/inventory/stock_adjustment_dialog.dart';
import 'package:loja_roupas/features/admin/inventory/railway_inventory_screen.dart';
import 'helpers/stage03_fixtures.dart';

final stockVariant = <String, dynamic>{
  'variantId': 'var-1',
  'productName': 'Camisa de linho',
  'sku': 'CAM-AZ-M',
  'color': 'Azul',
  'size': 'M',
  'onHand': 10,
  'reserved': 7,
  'available': 3,
  'priceCents': '7990'
};

class CatalogAdmin extends RailwayCatalogAdminRepository {
  final created = <Map<String, dynamic>>[],
      updated = <Map<String, dynamic>>[],
      categories = <Map<String, dynamic>>[];
  @override
  Future<Map<String, dynamic>> load() async => {
        'canEdit': true,
        'categories': [
          {'id': 'cat-a', 'name': 'Camisas'}
        ],
        'products': [
          {
            'id': 'product-a',
            'name': 'Camisa de linho',
            'description': 'Peça confortável',
            'sizeGuide': '',
            'categoryId': 'cat-a',
            'status': 'DRAFT',
            'priceCents': '7990',
            'oldPriceCents': null,
            'images': <String>[],
            'videos': <String>[],
            'revision': '2026-10-30T10:00:00.123456Z',
            'variants': [
              {'id': 'var-1', 'status': 'ACTIVE', ...stockVariant},
              {
                'id': 'var-2',
                'status': 'INACTIVE',
                'sku': 'CAM-PT-P',
                'color': 'Preto',
                'size': 'P',
                'onHand': 90,
                'reserved': 0,
                'available': 90
              }
            ]
          }
        ],
      };
  @override
  Future<void> createProduct(Map<String, dynamic> payload) async {
    created.add(payload);
  }

  @override
  Future<void> updateProduct(String id, Map<String, dynamic> payload) async {
    updated.add(payload);
  }

  @override
  Future<void> createCategory(String name,
      {String icon = '🏷️', String imageUrl = ''}) async {
    categories.add({'name': name, 'icon': icon, 'imageUrl': imageUrl});
  }
}

class StockAdmin extends RailwayInventoryRepository {
  final requests = <Map<String, dynamic>>[];
  bool failFirst = false;
  @override
  Future<Map<String, dynamic>> adjust(
      {required String variantId,
      required String requestId,
      required int delta,
      required String notes}) async {
    requests.add({'requestId': requestId, 'delta': delta, 'notes': notes});
    if (failFirst && requests.length == 1) {
      throw const LojaApiException('Falha de conexão.');
    }
    return {'afterOnHand': 10 + delta};
  }

  @override
  Future<Map<String, dynamic>> inventory(
          {String search = '',
          bool onlyLow = false,
          int threshold = 5,
          int page = 1}) async =>
      {
        'canAdjust': true,
        'variants': [stockVariant],
        'total': 1
      };
}

Future<void> screen(WidgetTester tester, Widget home,
    {double width = 390, double textScale = 1}) async {
  tester.view.physicalSize = Size(width, 980);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.runAsync(seedPreviewImages);
  await tester.pumpWidget(previewApp(home, textScale: textScale));
  await tester.pumpAndSettle();
}

Future<void> textField(WidgetTester tester, String label, String value) async {
  final finder = find.widgetWithText(TextField, label);
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.enterText(finder, value);
  await tester.pump();
}

Future<void> openAdjustment(WidgetTester tester, StockAdmin repo) async {
  await screen(
      tester,
      Scaffold(
          body: Builder(
              builder: (context) => TextButton(
                  onPressed: () => showDialog<bool>(
                      context: context,
                      builder: (_) => StockAdjustmentDialog(
                          variant: stockVariant, repository: repo)),
                  child: const Text('Ajustar')))));
  await tester.tap(find.text('Ajustar'));
  await tester.pumpAndSettle();
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test('preço em centavos aceita formato local sem arredondar casas ocultas',
      () {
    expect(adminPriceCents('79,90'), 7990);
    expect(adminPriceCents('R\$ 1.250,01'), 125001);
    expect(adminPriceCents('1250.01'), 125001);
    expect(adminPriceCents('1.250'), 125000);
    expect(adminPriceCents('1000000'), 100000000);
    for (final value in [
      '1e2',
      '-1',
      '0',
      '1,234',
      '12.3456',
      'NaN',
      '1000000,01',
      '1,2,3'
    ]) {
      expect(adminPriceCents(value), isNull, reason: value);
    }
  });
  test(
      'grade remove duplicatas e estoque do catálogo usa somente variantes ativas',
      () {
    expect(catalogOptions('Azul, azul, AZUL, Lavanda, '), ['Azul', 'Lavanda']);
    expect(catalogOptions(''), isEmpty);
    expect(
        activeCatalogStock([
          {'status': 'ACTIVE', 'available': 3},
          {'status': 'INACTIVE', 'available': 90}
        ]),
        3);
  });
  testWidgets(
      'catálogo não soma estoque inativo e novo produto não inventa cores ou tamanhos',
      (tester) async {
    final repo = CatalogAdmin();
    await screen(
        tester,
        RailwayCatalogManagementScreen(
            repository: repo, changes: const Stream<int>.empty()));
    expect(find.textContaining('3 disponíveis em variantes ativas'),
        findsOneWidget);
    await tester.tap(find.text('Novo produto'));
    await tester.pumpAndSettle();
    final colors =
        find.widgetWithText(TextField, 'Cores (ex.: Preto, Branco, Azul)');
    await tester.ensureVisible(colors);
    await tester.pumpAndSettle();
    expect(tester.widget<TextField>(colors).controller!.text, isEmpty);
    expect(find.widgetWithText(TextField, 'Estoque'), findsNothing);
    await tester.tap(find.text('Salvar produto'));
    await tester.pumpAndSettle();
    expect(
        find.text(
            'Informe nome, preço válido e, se houver, preço anterior maior que o atual.'),
        findsOneWidget);
    await tester.tap(find.byTooltip('Voltar').last);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
  testWidgets(
      'cadastro gera somente a grade informada com estoque inicial explícito',
      (tester) async {
    final repo = CatalogAdmin();
    await screen(
        tester,
        RailwayCatalogManagementScreen(
            repository: repo, changes: const Stream<int>.empty()));
    await tester.tap(find.text('Novo produto'));
    await tester.pumpAndSettle();
    await textField(tester, 'Nome *', 'Blusa lavanda');
    await textField(tester, 'Preço (R\$) *', '39,90');
    await textField(tester, 'Prefixo do SKU * (ex.: CAMISETA01)', 'BLUSA01');
    await textField(
        tester, 'Cores (ex.: Preto, Branco, Azul)', 'Lavanda, lavanda');
    await textField(tester, 'Tamanhos (ex.: P, M, G, GG)', 'Único');
    await tester.ensureVisible(find.text('Gerar grade'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Gerar grade'));
    await tester.pumpAndSettle();
    await textField(tester, 'Estoque', '5');
    await savePreview(tester, 'cadastro-grade-real');
    await tester.tap(find.text('Salvar produto'));
    await tester.pumpAndSettle();
    final variants = repo.created.single['variants'] as List;
    expect(variants, hasLength(1));
    expect(variants.single['color'], 'Lavanda');
    expect(variants.single['initialStock'], 5);
    expect(repo.created.single['priceCents'], 3990);
    expect(tester.takeException(), isNull);
  });
  testWidgets('edição envia revisão original e não altera quantidades',
      (tester) async {
    final repo = CatalogAdmin();
    await screen(
        tester,
        RailwayCatalogManagementScreen(
            repository: repo, changes: const Stream<int>.empty()));
    await tester.tap(find.text('Editar'));
    await tester.pumpAndSettle();
    await textField(tester, 'Preço (R\$) *', '89,90');
    await tester.tap(find.text('Salvar produto'));
    await tester.pumpAndSettle();
    expect(
        repo.updated.single['expectedRevision'], '2026-10-30T10:00:00.123456Z');
    expect(repo.updated.single['priceCents'], 8990);
    expect(repo.updated.single.containsKey('variants'), false);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
      'categoria cadastra imagem HTTPS e fechar formulário não usa controlador descartado',
      (tester) async {
    final repo = CatalogAdmin();
    await screen(
        tester,
        RailwayCatalogManagementScreen(
            repository: repo, changes: const Stream<int>.empty()));
    await tester.tap(find.text('Nova categoria'));
    await tester.pumpAndSettle();
    await textField(tester, 'Nome da categoria', 'Vestidos');
    await textField(tester, 'Imagem da categoria (URL HTTPS, opcional)',
        'https://example.invalid/category.jpg');
    await tester.tap(find.text('Criar'));
    await tester.pumpAndSettle();
    expect(repo.categories.single['imageUrl'],
        'https://example.invalid/category.jpg');
    expect(tester.takeException(), isNull);
  });
  testWidgets('saída acima do disponível é bloqueada e prévia mostra o saldo',
      (tester) async {
    final repo = StockAdmin();
    await openAdjustment(tester, repo);
    await tester.tap(find.text('Saída'));
    await tester.pumpAndSettle();
    await textField(tester, 'Quantidade', '4');
    await textField(tester, 'Motivo do ajuste', 'Peça avariada');
    await tester.tap(find.text('Confirmar ajuste'));
    await tester.pumpAndSettle();
    expect(repo.requests, isEmpty);
    expect(
        find.textContaining('preserve as unidades reservadas'), findsOneWidget);
    await textField(tester, 'Quantidade', '2');
    expect(find.textContaining('Físico: 8 · Reservado: 7'), findsOneWidget);
    await savePreview(tester, 'ajuste-estoque-previa');
    await tester.tap(find.text('Confirmar ajuste'));
    await tester.pumpAndSettle();
    expect(repo.requests.single['delta'], -2);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
      'repetir ajuste após falha usa a mesma operação e os mesmos dados',
      (tester) async {
    final repo = StockAdmin()..failFirst = true;
    await openAdjustment(tester, repo);
    await textField(tester, 'Quantidade', '2');
    await textField(tester, 'Motivo do ajuste', 'Recebimento de mercadoria');
    await tester.tap(find.text('Confirmar ajuste'));
    await tester.pumpAndSettle();
    expect(
        tester
            .widget<TextField>(find.widgetWithText(TextField, 'Quantidade'))
            .enabled,
        false);
    await tester.tap(find.text('Repetir mesma operação'));
    await tester.pumpAndSettle();
    expect(repo.requests, hasLength(2));
    expect(repo.requests[0], repo.requests[1]);
    expect(tester.takeException(), isNull);
  });
  testWidgets('estoque cabe em 320 pixels com texto ampliado', (tester) async {
    await screen(
        tester,
        RailwayInventoryScreen(
            repository: StockAdmin(), changes: const Stream<int>.empty()),
        width: 320,
        textScale: 1.3);
    await savePreview(tester, 'estoque-celular');
    expect(tester.takeException(), isNull);
  });
}
