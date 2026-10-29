import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:loja_roupas/providers/category_providers.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/network/loja_api.dart';
import '../widgets/railway_paged_catalog_screen.dart';
import '../../../data/mock/mock_categories.dart';
import '../../../providers/product_providers.dart';
import '../widgets/empty_state.dart';
import '../widgets/product_card.dart';

class CategoryScreen extends ConsumerWidget {
  final String categoryId;

  const CategoryScreen({super.key, required this.categoryId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (LojaBackend.isRailway) {
      final categoryName=(ref.watch(categoriesProvider).valueOrNull ?? []).where((e)=>e.id==categoryId).map((e)=>e.name).firstOrNull ?? 'Categoria';
      return RailwayPagedCatalogScreen(title:categoryName,categoryId:categoryId);
    }
    final asyncProducts = ref.watch(productsProvider);

    final category = mockCategories.firstWhere(
      (c) => c.id == categoryId,
      orElse: () => mockCategories.first,
    );

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: Text(category.name)),
      body: asyncProducts.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Erro: $e')),
        data: (all) {
          final products =
              all.where((p) => p.categoryId == categoryId).toList();

          if (products.isEmpty) {
            return EmptyState(
              icon: Icons.inventory_2_outlined,
              title: 'Categoria vazia',
              subtitle:
                  'Ainda não há produtos em ${category.name}.\nVolte em breve!',
              buttonLabel: 'Ver todos os produtos',
              onButtonPressed: () => context.go('/'),
              iconColor: AppColors.warning,
            );
          }

          return GridView.builder(
            padding: const EdgeInsets.all(16),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              mainAxisSpacing: 16,
              crossAxisSpacing: 16,
              childAspectRatio: 0.68,
            ),
            itemCount: products.length,
            itemBuilder: (context, index) {
              return ProductCard(product: products[index]);
            },
          );
        },
      ),
    );
  }
}
