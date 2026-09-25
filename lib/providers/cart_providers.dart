import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/repositories/cart_repository.dart';
import '../models/cart_item.dart';
import '../models/product.dart';

final cartRepositoryProvider = Provider<CartRepository>((ref) {
  return CartRepository();
});

final cartProvider = StateNotifierProvider<CartNotifier, List<CartItem>>((ref) {
  final repo = ref.watch(cartRepositoryProvider);
  return CartNotifier(repo);
});

class CartNotifier extends StateNotifier<List<CartItem>> {
  final CartRepository _repo;

  CartNotifier(this._repo) : super(_repo.items);

  int get itemCount => _repo.itemCount;
  double get subtotal => _repo.subtotal;

  void addItem({
    required Product product,
    required String color,
    required String size,
    int quantity = 1,
  }) {
    _repo.addItem(
      product: product,
      color: color,
      size: size,
      quantity: quantity,
    );
    state = _repo.items;
  }

  void updateQuantity(String itemId, int quantity) {
    _repo.updateQuantity(itemId, quantity);
    state = _repo.items;
  }

  void removeItem(String itemId) {
    _repo.removeItem(itemId);
    state = _repo.items;
  }

  void clear() {
    _repo.clear();
    state = [];
  }
}

// Provider só para a quantidade (útil no badge do carrinho)
final cartItemCountProvider = Provider<int>((ref) {
  final cart = ref.watch(cartProvider);
  return cart.fold(0, (sum, item) => sum + item.quantity);
});