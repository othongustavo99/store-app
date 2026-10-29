import 'package:loja_roupas/router/app_back_button.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_colors.dart';
import '../../../providers/category_providers.dart';
import '../../../providers/product_providers.dart';
import '../widgets/empty_state.dart';

/// Categorias em grade fluida, preservando os links e o catálogo atual.
class CategoriesTabScreen extends ConsumerWidget {
  const CategoriesTabScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncCategories = ref.watch(categoriesProvider);
    final products = ref.watch(productsProvider).valueOrNull ?? [];

    return Scaffold(
      appBar: AppBar(leading: const AppBackButton(tabRoot: true), title: const Text('Categorias')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1200),
          child: asyncCategories.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, stackTrace) => EmptyState(
              icon: Icons.wifi_off_outlined,
              title: 'Categorias indisponíveis',
              subtitle: 'Não conseguimos carregar as categorias agora.',
              buttonLabel: 'Tentar novamente',
              onButtonPressed: () => ref.invalidate(categoriesProvider),
            ),
            data: (categories) {
              if (categories.isEmpty) {
                return const EmptyState(
                  icon: Icons.category_outlined,
                  title: 'Novas categorias em breve',
                  subtitle: 'Estamos organizando os produtos da loja.',
                );
              }
              return GridView.builder(
                padding: const EdgeInsets.all(16),
                gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                  maxCrossAxisExtent: 390,
                  mainAxisExtent: 104,
                  mainAxisSpacing: 12,
                  crossAxisSpacing: 12,
                ),
                itemCount: categories.length,
                itemBuilder: (context, index) {
                  final category = categories[index];
                  final matching = products.where(
                    (product) => product.categoryId == category.id &&
                        product.images.isNotEmpty,
                  );
                  final imageUrl = matching.isEmpty ? '' : matching.first.images.first;
                  return Material(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(16),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(16),
                      onTap: () => context.push('/category/${category.id}'),
                      child: Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: AppColors.border),
                        ),
                        child: Row(
                          children: [
                            ClipRRect(
                              borderRadius: BorderRadius.circular(12),
                              child: SizedBox(
                                width: 76,
                                height: 76,
                                child: imageUrl.isNotEmpty
                                    ? CachedNetworkImage(
                                        imageUrl: imageUrl,
                                        fit: BoxFit.cover,
                                        memCacheWidth: 240,
                                        errorWidget: (context, error, stackTrace) =>
                                            _FallbackCategory(icon: category.icon),
                                      )
                                    : _FallbackCategory(icon: category.icon),
                              ),
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Text(
                                category.name,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.textPrimary,
                                ),
                              ),
                            ),
                            const Icon(Icons.chevron_right,
                                color: AppColors.textSecondary),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              );
            },
          ),
        ),
      ),
    );
  }
}

class _FallbackCategory extends StatelessWidget {
  const _FallbackCategory({required this.icon});
  final String icon;

  @override
  Widget build(BuildContext context) => ColoredBox(
        color: AppColors.divider,
        child: Center(child: Text(icon, style: const TextStyle(fontSize: 30))),
      );
}
