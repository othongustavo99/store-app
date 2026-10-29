import 'package:flutter_test/flutter_test.dart';
import 'package:loja_roupas/core/network/loja_api.dart';
import 'package:loja_roupas/data/repositories/railway_catalog_repository.dart';

class CatalogApi extends Fake implements LojaApi {
  final calls = <List<String>>[];
  bool failSecondBatch = false;
  @override
  String get publicCatalog => '/v1/shops/loja-a/catalog';
  @override
  Future<Map<String, dynamic>> request(String method, String path,
      {Object? body,
      bool authenticated = false,
      bool allowRefresh = true}) async {
    expect(method, 'POST');
    expect(path, '$publicCatalog/products/resolve');
    expect(authenticated, isFalse);
    final ids = List<String>.from((body as Map)['ids'] as List);
    calls.add(ids);
    if (failSecondBatch && calls.length == 2) {
      throw const LojaApiException('offline');
    }
    return {
      'products': [
        for (final id in ids)
          {
            'id': id,
            'name': 'Produto $id',
            'price': 79.9,
            'images': <String>[],
            'variants': [
              {'color': 'Preto', 'size': 'M', 'stock': 3}
            ],
            'createdAt': '2026-01-01T00:00:00.000Z',
          }
      ]
    };
  }
}

void main() {
  test('resolve produtos salvos em lotes de até 100 sem duplicar IDs',
      () async {
    final api = CatalogApi();
    final ids = List.generate(
        105,
        (index) =>
            '00000000-0000-4000-8000-${index.toString().padLeft(12, '0')}');
    final products = await RailwayCatalogRepository(api: api)
        .getProductsByIds([...ids, ids.first]);
    expect(api.calls.map((batch) => batch.length), [100, 5]);
    expect(products.map((product) => product.id).toSet(), ids.toSet());
  });

  test('falha em um lote não é convertida em catálogo parcial', () async {
    final api = CatalogApi()..failSecondBatch = true;
    final ids = List.generate(101, (index) => 'id-$index');
    await expectLater(RailwayCatalogRepository(api: api).getProductsByIds(ids),
        throwsA(isA<LojaApiException>()));
    expect(api.calls, hasLength(2));
  });

  test('lista vazia não consulta a API', () async {
    final api = CatalogApi();
    expect(
        await RailwayCatalogRepository(api: api).getProductsByIds([]), isEmpty);
    expect(api.calls, isEmpty);
  });
}
