import '../../core/network/loja_api.dart';
import '../../models/category.dart';
import '../../models/product.dart';

/// Adapta o contrato original dos modelos Flutter ao JSON da API Railway.
/// Não utiliza o Firestore e não permite registrar compras pelo cliente.
class RailwayCatalogRepository {
  final LojaApi _api = LojaApi.instance;

  Future<String> _productPath() async {
    if (!_api.userIsStoreStaff) return '${_api.publicCatalog}/products';
    await _api.fetchStoreId();
    return '${_api.adminCatalog}/products';
  }

  Future<List<Product>> getProducts() async {
    final data = await _api.request('GET', await _productPath(), authenticated: _api.userIsStoreStaff);
    return (data['products'] as List)
        .map((v) => Product.fromJson((v as Map)['id'] as String, Map<String, dynamic>.from(v)))
        .toList();
  }

  Stream<List<Product>> watchProducts() async* {
    yield await getProducts();
    await for (final _ in _api.catalogChanges()) {
      yield await getProducts();
    }
  }

  Future<Product?> getProduct(String id) async {
    final products = await getProducts();
    for (final p in products) { if (p.id == id) return p; }
    return null;
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
    'variants': product.variants.map((v) => {
      'color': v.color,
      'size': v.size,
      'stock': v.stock,
      'imageUrl': v.imageUrl,
    }).toList(),
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
    await _api.request('DELETE', '${_api.adminCatalog}/products/$id', authenticated: true);
    return true;
  }

  Future<List<Category>> getCategories() async {
    final data = await _api.request('GET', '${_api.publicCatalog}/categories');
    return (data['categories'] as List)
        .map((v) => Category.fromJson((v as Map)['id'] as String, Map<String, dynamic>.from(v)))
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
    await _api.request('POST', '${_api.adminCatalog}/categories', authenticated: true,
      body: {'name': category.name, 'icon': category.icon, 'imageUrl': category.imageUrl});
  }
}
