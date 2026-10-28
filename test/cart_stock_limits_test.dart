import 'package:flutter_test/flutter_test.dart';
import 'package:loja_roupas/data/repositories/cart_repository.dart';
import 'package:loja_roupas/models/product.dart';

Product product({int stock = 3, String id = 'camiseta'}) => Product(
      id: id,
      name: 'Camiseta',
      description: 'Produto de teste',
      categoryId: 'roupas',
      price: 49.90,
      images: const [],
      variants: [ProductVariant(color: 'Azul', size: 'M', stock: stock)],
      createdAt: DateTime(2026, 10, 28),
    );

void main() {
  test('impede que itens excedam o estoque da variante', () {
    final cart = CartRepository();
    cart.addItem(product: product(), color: 'Azul', size: 'M', quantity: 2);
    cart.addItem(product: product(), color: 'Azul', size: 'M', quantity: 5);
    expect(cart.items, hasLength(1));
    expect(cart.items.single.quantity, 3);
    expect(cart.itemCount, 3);
  });

  test('não adiciona variante inexistente ou esgotada', () {
    final cart = CartRepository();
    cart.addItem(product: product(stock: 0), color: 'Azul', size: 'M');
    cart.addItem(product: product(), color: 'Preto', size: 'GG');
    expect(cart.items, isEmpty);
  });

  test('diminui até zero e remove a linha', () {
    final cart = CartRepository();
    cart.addItem(product: product(), color: 'Azul', size: 'M');
    final id = cart.items.single.id;
    cart.updateQuantity(id, 0);
    expect(cart.items, isEmpty);
  });

  test('limita aumentos feitos pela edição de quantidade', () {
    final cart = CartRepository();
    cart.addItem(product: product(stock: 2), color: 'Azul', size: 'M');
    cart.updateQuantity(cart.items.single.id, 50);
    expect(cart.items.single.quantity, 2);
  });

  test('subtotal considera quantidade efetivamente aceita', () {
    final cart = CartRepository();
    cart.addItem(product: product(stock: 1), color: 'Azul', size: 'M', quantity: 9);
    expect(cart.subtotal, closeTo(49.9, 0.001));
  });
}
