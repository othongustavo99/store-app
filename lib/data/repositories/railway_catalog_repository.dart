import '../../core/network/loja_api.dart';
import '../../models/category.dart';
import '../../models/product.dart';
import '../../models/catalog_page.dart';

/// Adapta o contrato original dos modelos Flutter ao JSON da API Railway.
/// Não utiliza o Firestore e não permite registrar compras pelo cliente.
class RailwayCatalogRepository {
  RailwayCatalogRepository({LojaApi? api}) : _api = api ?? LojaApi.instance;
  final LojaApi _api;

  // A vitrine consulta SEMPRE apenas produtos publicados.
  // Gestão de rascunhos ocorre na rota protegida /catalog/manage.
  String get _productPath => '${_api.publicCatalog}/products';

  Future<CatalogFilters> getFilters() async {
    final data = await _api.request('GET', '${_api.publicCatalog}/filters');
    return CatalogFilters(
      colors: List<String>.from(data['colors'] as List? ?? const []),
      sizes: List<String>.from(data['sizes'] as List? ?? const []),
    );
  }

  Future<CatalogPage> search(Map<String, String> query) async {
    final data = await _api.request('GET',
        '${_api.publicCatalog}/search?${Uri(queryParameters: query).query}');
    return CatalogPage(
        (data['products'] as List).map((raw) {
          final value = Map<String, dynamic>.from(raw as Map);
          return Product.fromJson(value['id'] as String, value);
        }).toList(),
        data['nextCursor'] as String?);
  }

  Future<List<Product>> getProductsByIds(Iterable<String> ids) async {
    final unique = ids.toSet().toList(growable: false);
    final products = <Product>[];
    for (var start = 0; start < unique.length; start += 100) {
      final end = (start + 100).clamp(0, unique.length).toInt();
      final data = await _api.request('POST', '$_productPath/resolve',
          body: {'ids': unique.sublist(start, end)});
      products.addAll((data['products'] as List).map((raw) {
        final value = Map<String, dynamic>.from(raw as Map);
        return Product.fromJson(value['id'] as String, value);
      }));
    }
    // Uma falha em qualquer lote aborta a leitura inteira; não retorna resultado parcial.
    return products;
  }

  Future<List<Product>> getProducts() async {
    // Primeira página da vitrine. Demais produtos são buscados por scroll/pesquisa.
    final data =
        await _api.request('GET', '${_api.publicCatalog}/search?limit=50');
    return (data['products'] as List)
        .map((v) => Product.fromJson(
            (v as Map)['id'] as String, Map<String, dynamic>.from(v)))
        .toList();
  }

  Stream<List<Product>> watchProducts() async* {
    yield await getProducts();
    await for (final _ in _api.catalogChanges()) {
      yield await getProducts();
    }
  }

  Future<Product?> getProduct(String id) async {
    try {
      final data = await _api.request('GET', '$_productPath/$id');
      final item = Map<String, dynamic>.from(data['product'] as Map);
      return Product.fromJson(id, item);
    } on LojaApiException catch (e) {
      if (e.status == 404) return null;
      rethrow;
    }
  }

  Map<String, dynamic> _productPayload(Product product) => {
        'name': product.name,
        'description': product.description,
        'categoryId': product.categoryId,
        'price': product.price,
        'oldPrice': product.oldPrice,
        'images': product.images,
        'videos': product.videos,
        'isFeatured': product.isFeatured,
        'isNew': product.isNew,
        'status': 'PUBLISHED',
        'variants': product.variants
            .map((v) => {
                  'color': v.color,
                  'size': v.size,
                  'stock': v.stock,
                  'imageUrl': v.imageUrl,
                })
            .toList(),
      };

  Future<Product> addProduct(Product product) async {
    await _api.fetchStoreId();
    final data = await _api.request('POST', '${_api.adminCatalog}/products',
        authenticated: true, body: _productPayload(product));
    return product.copyWith(id: data['id'] as String);
  }

  Future<bool> updateProduct(Product product) async {
    await _api.fetchStoreId();
    await _api.request('PUT', '${_api.adminCatalog}/products/${product.id}',
        authenticated: true, body: _productPayload(product));
    return true;
  }

  Future<bool> deleteProduct(String id) async {
    await _api.fetchStoreId();
    await _api.request('DELETE', '${_api.adminCatalog}/products/$id',
        authenticated: true);
    return true;
  }

  Future<List<Category>> getCategories() async {
    final data = await _api.request('GET', '${_api.publicCatalog}/categories');
    return (data['categories'] as List)
        .map((v) => Category.fromJson(
            (v as Map)['id'] as String, Map<String, dynamic>.from(v)))
        .toList();
  }

  Stream<List<Category>> watchCategories() async* {
    yield await getCategories();
    await for (final _ in _api.catalogChanges()) {
      yield await getCategories();
    }
  }

  Future<void> addCategory(Category category) async {
    await _api.fetchStoreId();
    await _api.request('POST', '${_api.adminCatalog}/categories',
        authenticated: true,
        body: {
          'name': category.name,
          'icon': category.icon,
          'imageUrl': category.imageUrl
        });
  }
}
