import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_colors.dart';
import '../../../providers/product_providers.dart';
import '../widgets/product_card.dart';

class DiscountedProductsScreen extends ConsumerWidget {
  const DiscountedProductsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncProducts = ref.watch(productsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Ofertas com desconto'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
      ),
      body: asyncProducts.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Erro: $e')),
        data: (products) {
          final discounted = products
              .where((p) => p.oldPrice != null && p.oldPrice! > p.price)
              .toList();

          if (discounted.isEmpty) {
            return const Center(
              child: Text('Nenhum produto com desconto no momento.'),
            );
          }

          return GridView.builder(
            padding: const EdgeInsets.all(16),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              childAspectRatio: 0.65,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
            ),
            itemCount: discounted.length,
            itemBuilder: (_, i) => ProductCard(product: discounted[i]),
          );
        },
      ),
    );
  }
}