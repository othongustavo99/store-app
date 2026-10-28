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
    // Carrinho local não reserva unidades: a API revalida o estoque no checkout.
    // Mesmo assim, impedimos aumentos acima do estoque mostrado na vitrine.
    final variant = product.getVariant(color, size);
    final available = variant?.stock ?? 0;
    if (quantity <= 0 || available <= 0) return;

    final existingIndex = _items.indexWhere(
      (item) =>
          item.product.id == product.id &&
          item.color == color &&
          item.size == size,
    );

    if (existingIndex >= 0) {
      final existing = _items[existingIndex];
      final updatedQuantity = (existing.quantity + quantity).clamp(1, available);
      _items[existingIndex] = existing.copyWith(
        product: product,
        quantity: updatedQuantity.toInt(),
      );
    } else {
      _items.add(CartItem(
        id: _uuid.v4(),
        product: product,
        color: color,
        size: size,
        quantity: quantity.clamp(1, available).toInt(),
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
      final current = _items[index];
      final stock = current.product.getVariant(current.color, current.size)?.stock ?? 0;
      if (stock <= 0) {
        _items.removeAt(index);
        return;
      }
      _items[index] = current.copyWith(quantity: quantity.clamp(1, stock).toInt());
    }
  }

  void removeItem(String itemId) {
    _items.removeWhere((item) => item.id == itemId);
  }

  void clear() {
    _items.clear();
  }
}