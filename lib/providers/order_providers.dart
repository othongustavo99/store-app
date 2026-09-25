import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/repositories/order_repository.dart';
import '../models/order.dart';
import '../models/product.dart';
import 'cart_providers.dart';
import 'product_providers.dart';

final orderRepositoryProvider = Provider<OrderRepository>((ref) {
  return OrderRepository();
});

/// Pedidos em tempo real — os dois celulares escutam aqui
final ordersProvider = StreamProvider<List<Order>>((ref) {
  final repo = ref.watch(orderRepositoryProvider);
  return repo.watchAll();
});

final ordersActionsProvider = Provider<OrdersActions>((ref) {
  return OrdersActions(ref);
});

class OrdersActions {
  final Ref _ref;

  OrdersActions(this._ref);

  OrderRepository get _repo => _ref.read(orderRepositoryProvider);

  Future<Order> createOrder({
    required String customerName,
    required String customerPhone,
    required String zipCode,
    required String street,
    required String number,
    String? complement,
    required String neighborhood,
    required String city,
    required String state,
    required String paymentMethod,
    String? notes,
  }) async {
    final cartItems = _ref.read(cartProvider);

    if (cartItems.isEmpty) {
      throw Exception('O carrinho está vazio.');
    }

    final productsActions = _ref.read(productsActionsProvider);

    // Primeiro valida e reserva o estoque.
    for (final item in cartItems) {
      final success = await productsActions.decreaseStock(
        item.product.id,
        item.color,
        item.size,
        item.quantity,
      );

      if (!success) {
        throw Exception(
          'O produto "${item.product.name}" '
          'não possui estoque suficiente para '
          '${item.color} / ${item.size}.',
        );
      }
    }

    try {
      final order = await _repo.createOrder(
        cartItems: cartItems,
        customerName: customerName,
        customerPhone: customerPhone,
        zipCode: zipCode,
        street: street,
        number: number,
        complement: complement,
        neighborhood: neighborhood,
        city: city,
        state: state,
        paymentMethod: paymentMethod,
        paymentStatus: PaymentStatus.approved,
        notes: notes,
      );

      // Pedido criado com sucesso: limpa o carrinho.
      _ref.read(cartProvider.notifier).clear();

      return order;
    } catch (e) {
      // Se a criação do pedido falhar depois de baixar o estoque,
      // tentamos restaurar as quantidades.

      for (final item in cartItems) {
        final product =
            await _ref.read(productRepositoryProvider).getById(item.product.id);

        if (product == null) {
          continue;
        }

        final variantIndex = product.variants.indexWhere(
          (v) => v.color == item.color && v.size == item.size,
        );

        if (variantIndex == -1) {
          continue;
        }

        final variant = product.variants[variantIndex];

        final restoredVariants = List<ProductVariant>.from(product.variants);

        restoredVariants[variantIndex] = variant.copyWith(
          stock: variant.stock + item.quantity,
        );

        await _ref.read(productRepositoryProvider).updateProduct(
              product.copyWith(
                variants: restoredVariants,
              ),
            );
      }

      rethrow;
    }
  }

  Future<void> updateStatus(
    String orderId,
    OrderStatus newStatus,
  ) async {
    await _repo.updateStatus(
      orderId,
      newStatus,
    );
  }

  Future<void> updatePaymentStatus(
    String orderId,
    PaymentStatus newStatus,
  ) async {
    await _repo.updatePaymentStatus(
      orderId,
      newStatus,
    );
  }

  Future<void> clearAll() async {
    await _repo.clearAll();
  }
}
