import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../router/app_back_button.dart';
import '../../../providers/favorites_providers.dart';
import '../widgets/empty_state.dart';
import '../widgets/product_card.dart';

class FavoritesScreen extends ConsumerWidget {
  const FavoritesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final saved = ref.watch(favoriteIdsProvider);
    final products = ref.watch(favoriteProductsProvider);
    return Scaffold(
      appBar: AppBar(
        leading: const AppBackButton(tabRoot: true),
        title: const Text('Favoritos'),
      ),
      body: products.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => EmptyState(
          icon: Icons.wifi_off_outlined,
          title: 'Não foi possível carregar seus favoritos',
          subtitle:
              'Sua lista foi preservada. Verifique a conexão e tente novamente.',
          buttonLabel: 'Tentar novamente',
          onButtonPressed: () => ref.invalidate(favoriteProductsProvider),
        ),
        data: (items) {
          if (saved.isEmpty) {
            return EmptyState(
              icon: Icons.favorite_border,
              title: 'Guarde suas peças favoritas',
              subtitle:
                  'Toque no coração de um produto para encontrá-lo aqui depois.',
              buttonLabel: 'Explorar produtos',
              onButtonPressed: () => context.go('/'),
            );
          }
          final unavailable = saved.length - items.length;
          return Column(children: [
            if (unavailable > 0)
              Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  items.isEmpty
                      ? 'Os produtos salvos estão indisponíveis no momento. Sua lista foi mantida.'
                      : '$unavailable produto(s) salvo(s) estão indisponíveis no momento.',
                  textAlign: TextAlign.center,
                ),
              ),
            Expanded(
              child: RefreshIndicator(
                onRefresh: () async {
                  ref.invalidate(favoriteProductsProvider);
                  await ref.read(favoriteProductsProvider.future);
                },
                child: GridView.builder(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.all(16),
                  itemCount: items.length,
                  gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                    maxCrossAxisExtent: 235,
                    mainAxisExtent: 318,
                    mainAxisSpacing: 12,
                    crossAxisSpacing: 12,
                  ),
                  itemBuilder: (context, index) =>
                      ProductCard(product: items[index]),
                ),
              ),
            ),
          ]);
        },
      ),
    );
  }
}
