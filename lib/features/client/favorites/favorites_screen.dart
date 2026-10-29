import 'package:loja_roupas/router/app_back_button.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../client/widgets/product_card.dart';
import '../../../providers/favorites_providers.dart';
import '../../../providers/product_providers.dart';

class FavoritesScreen extends ConsumerWidget {
  const FavoritesScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final saved = ref.watch(favoriteIdsProvider);
    final products = ref.watch(productsProvider);
    return Scaffold(
      appBar: AppBar(leading: const AppBackButton(tabRoot: true), title: const Text('Favoritos')),
      body: products.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => Center(child: OutlinedButton(
          onPressed: () => ref.invalidate(productsProvider), child: const Text('Tentar novamente'))),
        data: (catalog) {
          final items = catalog.where((item) => saved.contains(item.id)).toList();
          if (items.isEmpty) {
            return const Center(child: Padding(
            padding: EdgeInsets.all(30), child: Column(mainAxisSize: MainAxisSize.min,
              children: [Icon(Icons.favorite_border, size: 54), SizedBox(height: 16),
                Text('Seus produtos favoritos aparecerão aqui.', textAlign: TextAlign.center)])));
          }
          return LayoutBuilder(builder: (context, size) => GridView.builder(
            padding: const EdgeInsets.all(16), itemCount: items.length,
            gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
              maxCrossAxisExtent: 235, mainAxisExtent: 318, mainAxisSpacing: 12, crossAxisSpacing: 12),
            itemBuilder: (context, i) => ProductCard(product: items[i]),
          ));
        },
      ),
    );
  }
}
