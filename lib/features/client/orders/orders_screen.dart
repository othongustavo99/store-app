import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../widgets/empty_state.dart';
import '../../../core/theme/app_colors.dart';
import '../../../models/order.dart';
import '../../../providers/order_providers.dart';

class OrdersScreen extends ConsumerWidget {
  const OrdersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncOrders = ref.watch(ordersProvider);

    final currency = NumberFormat.currency(
      locale: 'pt_BR',
      symbol: 'R\$',
    );

    final dateFormat = DateFormat('dd/MM/yyyy • HH:mm');

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Meus Pedidos'),
      ),
      body: asyncOrders.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Erro: $e')),
        data: (orders) {
          if (orders.isEmpty) return const _EmptyOrders();
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: orders.length,
            separatorBuilder: (_, __) => const SizedBox(height: 14),
            itemBuilder: (context, index) {
              return _OrderCard(
                order: orders[index],
                currency: currency,
                dateFormat: dateFormat,
              );
            },
          );
        },
      ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  final Order order;
  final NumberFormat currency;
  final DateFormat dateFormat;

  const _OrderCard({
    required this.order,
    required this.currency,
    required this.dateFormat,
  });

  Color _statusColor(OrderStatus status) {
    switch (status) {
      case OrderStatus.received:
        return AppColors.warning;

      case OrderStatus.preparing:
        return Colors.blue;

      case OrderStatus.shipped:
        return Colors.purple;

      case OrderStatus.delivered:
        return AppColors.success;

      case OrderStatus.cancelled:
        return AppColors.error;
    }
  }

  IconData _statusIcon(OrderStatus status) {
    switch (status) {
      case OrderStatus.received:
        return Icons.receipt_long_outlined;

      case OrderStatus.preparing:
        return Icons.inventory_2_outlined;

      case OrderStatus.shipped:
        return Icons.local_shipping_outlined;

      case OrderStatus.delivered:
        return Icons.check_circle_outline;

      case OrderStatus.cancelled:
        return Icons.cancel_outlined;
    }
  }

  @override
  Widget build(BuildContext context) {
    final statusColor = _statusColor(order.status);

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: AppColors.border,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Container(
                  width: 46,
                  height: 46,
                  decoration: BoxDecoration(
                    color: statusColor.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(13),
                  ),
                  child: Icon(
                    _statusIcon(order.status),
                    color: statusColor,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        order.id,
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 15,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        dateFormat.format(order.createdAt),
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: statusColor.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    order.status.shortLabel,
                    style: TextStyle(
                      color: statusColor,
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
          ),

          const Divider(height: 1),

          // Pagamento
          Padding(
            padding: const EdgeInsets.fromLTRB(
              16,
              12,
              16,
              4,
            ),
            child: Row(
              children: [
                const Icon(
                  Icons.check_circle,
                  size: 18,
                  color: AppColors.success,
                ),
                const SizedBox(width: 7),
                Expanded(
                  child: Text(
                    order.paymentStatus.label,
                    style: const TextStyle(
                      color: AppColors.success,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                Text(
                  order.paymentMethod,
                  style: const TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),

          // Timeline de status
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: _OrderStatusTimeline(currentStatus: order.status),
          ),
          // Endereço de entrega
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(
                  Icons.location_on_outlined,
                  size: 18,
                  color: AppColors.textSecondary,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    order.fullAddress.replaceAll('\n', ' • '),
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.textSecondary,
                      height: 1.3,
                    ),
                  ),
                ),
              ],
            ),
          ),
          // Produtos
          ...order.items.map(
            (item) => Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: 16,
                vertical: 10,
              ),
              child: Row(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: CachedNetworkImage(
                      imageUrl: item.imageUrl,
                      width: 56,
                      height: 56,
                      fit: BoxFit.cover,
                      errorWidget: (_, __, ___) => Container(
                        width: 56,
                        height: 56,
                        color: AppColors.divider,
                        child: const Icon(
                          Icons.image_outlined,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item.productName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          '${item.color} • ${item.size} • ${item.quantity}x',
                          style: const TextStyle(
                            fontSize: 12,
                            color: AppColors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Text(
                    currency.format(item.total),
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ),

          const Divider(height: 1),

          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Text(
                  '${order.totalItems} ${order.totalItems == 1 ? 'item' : 'itens'}',
                  style: const TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 13,
                  ),
                ),
                const Spacer(),
                const Text(
                  'Total  ',
                  style: TextStyle(
                    color: AppColors.textSecondary,
                  ),
                ),
                Text(
                  currency.format(order.total),
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 17,
                    color: AppColors.primary,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyOrders extends StatelessWidget {
  const _EmptyOrders();

  @override
  Widget build(BuildContext context) {
    return EmptyState(
      icon: Icons.receipt_long_outlined,
      title: 'Nenhum pedido ainda',
      subtitle: 'Quando você fizer uma compra,\nseus pedidos aparecerão aqui.',
      buttonLabel: 'Começar a comprar',
      onButtonPressed: () => context.go('/'),
    );
  }
}

class _OrderStatusTimeline extends StatelessWidget {
  final OrderStatus currentStatus;

  const _OrderStatusTimeline({required this.currentStatus});

  static const _steps = [
    OrderStatus.received,
    OrderStatus.preparing,
    OrderStatus.shipped,
    OrderStatus.delivered,
  ];

  int get _currentIndex {
    if (currentStatus == OrderStatus.cancelled) return -1;
    return _steps.indexOf(currentStatus);
  }

  @override
  Widget build(BuildContext context) {
    if (currentStatus == OrderStatus.cancelled) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.error.withOpacity(0.08),
          borderRadius: BorderRadius.circular(12),
        ),
        child: const Row(
          children: [
            Icon(Icons.cancel_outlined, color: AppColors.error, size: 20),
            SizedBox(width: 8),
            Text(
              'Pedido cancelado',
              style: TextStyle(
                color: AppColors.error,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      );
    }

    final index = _currentIndex;

    return Row(
      children: List.generate(_steps.length * 2 - 1, (i) {
        // Linha entre os pontos
        if (i.isOdd) {
          final stepIndex = i ~/ 2;
          final isDone = stepIndex < index;
          return Expanded(
            child: Container(
              height: 3,
              color: isDone ? AppColors.success : AppColors.border,
            ),
          );
        }

        // Ponto / ícone
        final stepIndex = i ~/ 2;
        final status = _steps[stepIndex];
        final isDone = stepIndex <= index;
        final isCurrent = stepIndex == index;

        return Column(
          children: [
            Container(
              width: isCurrent ? 28 : 22,
              height: isCurrent ? 28 : 22,
              decoration: BoxDecoration(
                color: isDone ? AppColors.success : Colors.white,
                shape: BoxShape.circle,
                border: Border.all(
                  color: isDone ? AppColors.success : AppColors.border,
                  width: 2,
                ),
              ),
              child: isDone
                  ? Icon(
                      isCurrent ? Icons.radio_button_checked : Icons.check,
                      size: isCurrent ? 16 : 14,
                      color: Colors.white,
                    )
                  : null,
            ),
            const SizedBox(height: 4),
            Text(
              status.shortLabel,
              style: TextStyle(
                fontSize: 10,
                fontWeight: isCurrent ? FontWeight.bold : FontWeight.normal,
                color: isDone ? AppColors.success : AppColors.textSecondary,
              ),
            ),
          ],
        );
      }),
    );
  }
}
