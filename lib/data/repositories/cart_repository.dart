import 'package:uuid/uuid.dart';
import '../../models/cart_item.dart';
import '../../models/product.dart';

class CartRepository {
  final List<CartItem> _items = [];
  final _uuid = const Uuid();

  List<CartItem> get items => List.unmodifiable(_items);

  int get itemCount => _items.fold(0, (sum, item) => sum + item.quantity);

  double get subtotal => _items.fold(0.0, (sum, item) => sum + item.total);

  void addItem({
    required Product product,
    required String color,
    required String size,
    int quantity = 1,
  }) {
    // Verifica se já existe o mesmo produto + cor + tamanho
    final existingIndex = _items.indexWhere(
      (item) =>
          item.product.id == product.id &&
          item.color == color &&
          item.size == size,
    );

    if (existingIndex >= 0) {
      final existing = _items[existingIndex];
      _items[existingIndex] = existing.copyWith(
        quantity: existing.quantity + quantity,
      );
    } else {
      _items.add(CartItem(
        id: _uuid.v4(),
        product: product,
        color: color,
        size: size,
        quantity: quantity,
      ));
    }
  }

  void updateQuantity(String itemId, int quantity) {
    if (quantity <= 0) {
      removeItem(itemId);
      return;
    }
    final index = _items.indexWhere((item) => item.id == itemId);
    if (index >= 0) {
      _items[index] = _items[index].copyWith(quantity: quantity);
    }
  }

  void removeItem(String itemId) {
    _items.removeWhere((item) => item.id == itemId);
  }

  void clear() {
    _items.clear();
  }
}