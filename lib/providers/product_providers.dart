import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/repositories/product_repository.dart';
import '../models/product.dart';

final productRepositoryProvider = Provider<ProductRepository>((ref) {
  return ProductRepository();
});

/// Lista de produtos em tempo real (Firestore)
final productsProvider = StreamProvider<List<Product>>((ref) {
  final repo = ref.watch(productRepositoryProvider);
  return repo.watchAll();
});

final featuredProductsProvider = Provider<List<Product>>((ref) {
  final asyncProducts = ref.watch(productsProvider);
  return asyncProducts.when(
    data: (list) => list.where((p) => p.isFeatured).toList(),
    loading: () => [],
    error: (_, __) => [],
  );
});

/// Helper para ações (add, update, delete, desconto...)
final productsActionsProvider = Provider<ProductsActions>((ref) {
  return ProductsActions(ref.watch(productRepositoryProvider));
});

class ProductsActions {
  final ProductRepository _repo;

  ProductsActions(this._repo);

  Future<void> addProduct(Product product) => _repo.addProduct(product);

  Future<void> updateProduct(Product product) => _repo.updateProduct(product);

  Future<void> deleteProduct(String id) => _repo.deleteProduct(id);

  Future<bool> decreaseStock(
    String productId,
    String color,
    String size,
    int quantity,
  ) =>
      _repo.decreaseStock(productId, color, size, quantity);

  Future<bool> updatePrice(String productId, double newPrice) =>
      _repo.updatePrice(productId, newPrice);

  Future<bool> updateVariantStock(
    String productId,
    String color,
    String size,
    int newStock,
  ) =>
      _repo.updateVariantStock(productId, color, size, newStock);

  Future<bool> applyDiscount(String productId, double percent) =>
      _repo.applyDiscount(productId, percent);

  Future<bool> removeDiscount(String productId) =>
      _repo.removeDiscount(productId);

  Future<void> reset() => _repo.resetToMock();

  Future<void> seedIfEmpty() => _repo.seedIfEmpty();

  Future<Product?> getById(String id) => _repo.getById(id);

  List<Product> search(List<Product> all, String query) {
    final lower = query.toLowerCase();
    return all
        .where((p) =>
            p.name.toLowerCase().contains(lower) ||
            p.description.toLowerCase().contains(lower))
        .toList();
  }
}
