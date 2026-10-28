import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/app_colors.dart';
import '../../../models/cart_item.dart';
import '../../../providers/cart_providers.dart';
import '../widgets/empty_state.dart';

/// Fase 5.2: carrinho responsivo e honesto sobre preços/estoque.
/// A quantidade aqui é uma intenção de compra; o servidor revalida ao finalizar.
class CartScreen extends ConsumerWidget {
  const CartScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = ref.watch(cartProvider);
    final cart = ref.read(cartProvider.notifier);
    final money = NumberFormat.currency(locale: 'pt_BR', symbol: 'R\$');
    final subtotal = items.fold<double>(0, (sum, item) => sum + item.total);
    final count = items.fold<int>(0, (sum, item) => sum + item.quantity);
    final canCheckout = items.every((line) {
      final stock = line.product.getVariant(line.color, line.size)?.stock ?? 0;
      return stock >= line.quantity;
    });

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Text('Meu carrinho${items.isEmpty ? '' : ' ($count)'}'),
        actions: [
          if (items.isNotEmpty)
            TextButton.icon(
              icon: const Icon(Icons.delete_sweep_outlined, size: 18),
              label: const Text('Limpar'),
              onPressed: () async {
                final confirmed = await showDialog<bool>(
                  context: context,
                  builder: (dialogContext) => AlertDialog(
                    title: const Text('Limpar carrinho?'),
                    content: const Text('Todos os produtos serão removidos.'),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.pop(dialogContext, false),
                        child: const Text('Voltar'),
                      ),
                      FilledButton(
                        onPressed: () => Navigator.pop(dialogContext, true),
                        child: const Text('Remover itens'),
                      ),
                    ],
                  ),
                );
                if (confirmed == true) cart.clear();
              },
            ),
        ],
      ),
      body: items.isEmpty
          ? const _EmptyCart()
          : Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 1140),
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    final wide = constraints.maxWidth >= 820;
                    final list = ListView.separated(
                      padding: const EdgeInsets.all(16),
                      itemCount: items.length + 1,
                      separatorBuilder: (context, index) => const SizedBox(height: 12),
                      itemBuilder: (context, index) {
                        if (index == items.length) {
                          return const Padding(
                            padding: EdgeInsets.symmetric(vertical: 12),
                            child: Text(
                              'Os preços e a disponibilidade serão confirmados pela loja na finalização. Adicionar ao carrinho não reserva estoque.',
                              style: TextStyle(color: AppColors.textSecondary, height: 1.45),
                            ),
                          );
                        }
                        final item = items[index];
                        return _CartLine(
                          key: ValueKey(item.id),
                          item: item,
                          money: money,
                          onDecrease: () => cart.updateQuantity(item.id, item.quantity - 1),
                          onIncrease: () => cart.updateQuantity(item.id, item.quantity + 1),
                          onRemove: () => cart.removeItem(item.id),
                        );
                      },
                    );
                    final summary = _OrderSummary(
                      subtotal: subtotal,
                      count: count,
                      money: money,
                      canCheckout: canCheckout,
                      onCheckout: () => context.push('/checkout'),
                    );
                    if (wide) {
                      return Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(child: list),
                          SizedBox(
                            width: 340,
                            child: SingleChildScrollView(
                              padding: const EdgeInsets.fromLTRB(0, 16, 16, 16),
                              child: summary,
                            ),
                          ),
                        ],
                      );
                    }
                    return Column(
                      children: [
                        Expanded(child: list),
                        SafeArea(
                          top: false,
                          child: Padding(
                            padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
                            child: summary,
                          ),
                        ),
                      ],
                    );
                  },
                ),
              ),
            ),
    );
  }
}

class _CartLine extends StatelessWidget {
  const _CartLine({
    super.key,
    required this.item,
    required this.money,
    required this.onDecrease,
    required this.onIncrease,
    required this.onRemove,
  });

  final CartItem item;
  final NumberFormat money;
  final VoidCallback onDecrease;
  final VoidCallback onIncrease;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final available = item.product.getVariant(item.color, item.size)?.stock ?? 0;
    final atLimit = item.quantity >= available;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: SizedBox(
                width: 90,
                height: 110,
                child: item.product.images.isEmpty
                    ? const ColoredBox(
                        color: AppColors.divider,
                        child: Icon(Icons.image_outlined, color: AppColors.textLight),
                      )
                    : CachedNetworkImage(
                        imageUrl: item.product.images.first,
                        fit: BoxFit.cover,
                        memCacheWidth: 240,
                        errorWidget: (context, url, error) => const ColoredBox(
                          color: AppColors.divider,
                          child: Icon(Icons.image_not_supported_outlined),
                        ),
                      ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item.product.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 3),
                  Text('${item.color} · ${item.size}',
                      style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                  const SizedBox(height: 8),
                  Text(money.format(item.total),
                      style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800, fontSize: 16)),
                  const SizedBox(height: 10),
                  Wrap(
                    crossAxisAlignment: WrapCrossAlignment.center,
                    spacing: 8,
                    runSpacing: 6,
                    children: [
                      IconButton.outlined(
                        tooltip: 'Diminuir quantidade',
                        visualDensity: VisualDensity.compact,
                        onPressed: onDecrease,
                        icon: const Icon(Icons.remove, size: 18),
                      ),
                      Semantics(
                        label: '${item.quantity} unidades',
                        child: Text('${item.quantity}', style: const TextStyle(fontWeight: FontWeight.bold)),
                      ),
                      IconButton.outlined(
                        tooltip: atLimit ? 'Limite de estoque atingido' : 'Aumentar quantidade',
                        visualDensity: VisualDensity.compact,
                        onPressed: atLimit ? null : onIncrease,
                        icon: const Icon(Icons.add, size: 18),
                      ),
                      IconButton(
                        tooltip: 'Remover produto',
                        visualDensity: VisualDensity.compact,
                        onPressed: onRemove,
                        icon: const Icon(Icons.delete_outline, color: AppColors.error),
                      ),
                    ],
                  ),
                  if (available <= 0)
                    const Text('Produto indisponível; remova-o antes de comprar.',
                        style: TextStyle(color: AppColors.error, fontSize: 12)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OrderSummary extends StatelessWidget {
  const _OrderSummary({required this.subtotal, required this.count, required this.money,
    required this.canCheckout, required this.onCheckout});
  final double subtotal;
  final int count;
  final NumberFormat money;
  final bool canCheckout;
  final VoidCallback onCheckout;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Resumo', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 14),
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              Text('$count ${count == 1 ? 'item' : 'itens'}'),
              Text(money.format(subtotal), style: const TextStyle(fontWeight: FontWeight.w700)),
            ]),
            const SizedBox(height: 10),
            const Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              Text('Entrega'), Text('A calcular no checkout', style: TextStyle(fontSize: 12)),
            ]),
            const Divider(height: 26),
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              const Text('Subtotal dos produtos', style: TextStyle(fontWeight: FontWeight.w700)),
              Text(money.format(subtotal), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
            ]),
            const SizedBox(height: 14),
            FilledButton.icon(
              onPressed: canCheckout ? onCheckout : null,
              icon: const Icon(Icons.arrow_forward),
              label: const Text('Continuar para o checkout'),
            ),
            const SizedBox(height: 8),
            const Text('O valor final pode incluir frete e será validado pelo servidor.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
          ],
        ),
      ),
    );
  }
}

class _EmptyCart extends StatelessWidget {
  const _EmptyCart();

  @override
  Widget build(BuildContext context) => EmptyState(
        icon: Icons.shopping_bag_outlined,
        title: 'Seu carrinho está vazio',
        subtitle: 'Explore os produtos da loja e escolha suas peças favoritas.',
        buttonLabel: 'Explorar produtos',
        onButtonPressed: () => context.go('/'),
      );
}
