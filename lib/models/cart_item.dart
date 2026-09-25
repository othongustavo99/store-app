import 'product.dart';

class CartItem {
  final String id;
  final Product product;
  final String color;
  final String size;
  final int quantity;

  const CartItem({
    required this.id,
    required this.product,
    required this.color,
    required this.size,
    required this.quantity,
  });

  double get total => product.price * quantity;

  CartItem copyWith({
    String? id,
    Product? product,
    String? color,
    String? size,
    int? quantity,
  }) {
    return CartItem(
      id: id ?? this.id,
      product: product ?? this.product,
      color: color ?? this.color,
      size: size ?? this.size,
      quantity: quantity ?? this.quantity,
    );
  }
}