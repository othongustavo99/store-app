import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/loja_api.dart';
import '../../../core/theme/app_colors.dart';
import '../../../models/product.dart';
import '../../../providers/auth_providers.dart';
import '../../../providers/category_providers.dart';
import '../../../providers/product_providers.dart';
import '../widgets/empty_state.dart';
import '../widgets/product_card.dart';
import '../widgets/railway_storefront_identity.dart';

/// Vitrine responsiva: 2 colunas em celulares e mais colunas em tablets/desktop.
/// Não altera as regras de publicação, preços, estoque ou autenticação.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final products = ref.watch(productsProvider);
    final featured = ref.watch(featuredProductsProvider);
    final categories = ref.watch(categoriesProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 1200),
            child: RefreshIndicator(
              onRefresh: () async {
                ref.invalidate(productsProvider);
                ref.invalidate(categoriesProvider);
                try {
                  await ref.read(productsProvider.future);
                } catch (_) {
                  // A tela oferece a ação de tentar novamente.
                }
              },
              child: CustomScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                slivers: [
                  SliverAppBar(
                    floating: true,
                    backgroundColor: AppColors.surface,
                    titleSpacing: 16,
                    title: LojaBackend.isRailway
                        ? const RailwayStorefrontIdentity()
                        : const Text('Loja de Roupas'),
                    actions: [
                      IconButton(
                        tooltip: 'Buscar produtos',
                        icon: const Icon(Icons.search_rounded),
                        onPressed: () => context.push('/search'),
                      ),
                      IconButton(
                        tooltip: 'Atendimento',
                        icon: const Icon(Icons.support_agent_outlined),
                        onPressed: () => context.push('/chat'),
                      ),
                      if (LojaBackend.isRailway)
                        IconButton(
                          tooltip: 'Aceitar convite da equipe',
                          icon: const Icon(Icons.group_add_outlined),
                          onPressed: () => context.push('/invite'),
                        ),
                      if (LojaBackend.isRailway)
                        IconButton(
                          tooltip: 'Minha conta',
                          icon: const Icon(Icons.account_circle_outlined),
                          onPressed: () => context.push('/account'),
                        ),
                      IconButton(
                        tooltip: 'Sair da conta',
                        icon: const Icon(Icons.logout_rounded),
                        onPressed: () async {
                          await ref.read(authProvider.notifier).logout();
                          if (context.mounted) context.go('/login');
                        },
                      ),
                      const SizedBox(width: 4),
                    ],
                  ),
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 18, 16, 4),
                      child: Material(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(14),
                        child: InkWell(
                          borderRadius: BorderRadius.circular(14),
                          onTap: () => context.push('/search'),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(color: AppColors.border),
                            ),
                            child: const Row(
                              children: [
                                Icon(Icons.search, color: AppColors.textSecondary),
                                SizedBox(width: 12),
                                Expanded(
                                  child: Text(
                                    'O que você está procurando?',
                                    style: TextStyle(color: AppColors.textSecondary),
                                  ),
                                ),
                                Icon(Icons.arrow_forward_ios_rounded,
                                    size: 14, color: AppColors.textLight),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                  SliverToBoxAdapter(
                    child: LojaBackend.isRailway
                        ? const RailwayStorefrontIdentity(banner: true)
                        : const _LegacyBanner(),
                  ),
                  const SliverToBoxAdapter(
                    child: _SectionHeading(title: 'Explore por categoria'),
                  ),
                  SliverToBoxAdapter(
                    child: SizedBox(
                      height: 116,
                      child: categories.when(
                        loading: () => const Center(child: CircularProgressIndicator()),
                        error: (error, stackTrace) => const Center(
                          child: Text('Categorias indisponíveis no momento.'),
                        ),
                        data: (items) {
                          if (items.isEmpty) {
                            return const Center(child: Text('Novas categorias em breve.'));
                          }
                          return ListView.separated(
                            scrollDirection: Axis.horizontal,
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            itemCount: items.length,
                            separatorBuilder: (context, index) => const SizedBox(width: 12),
                            itemBuilder: (context, index) {
                              final category = items[index];
                              final matching = products.valueOrNull
                                  ?.where((item) => item.categoryId == category.id);
                              final image = matching == null || matching.isEmpty ||
                                      matching.first.images.isEmpty
                                  ? ''
                                  : matching.first.images.first;
                              return Semantics(
                                button: true,
                                label: 'Categoria ${category.name}',
                                child: InkWell(
                                  borderRadius: BorderRadius.circular(14),
                                  onTap: () => context.push('/category/${category.id}'),
                                  child: SizedBox(
                                    width: 86,
                                    child: Column(
                                      children: [
                                        ClipRRect(
                                          borderRadius: BorderRadius.circular(16),
                                          child: SizedBox(
                                            height: 76,
                                            width: 76,
                                            child: image.isNotEmpty
                                                ? CachedNetworkImage(
                                                    imageUrl: image,
                                                    fit: BoxFit.cover,
                                                    memCacheWidth: 240,
                                                    errorWidget: (context, error, stackTrace) =>
                                                        _CategoryFallback(icon: category.icon),
                                                  )
                                                : _CategoryFallback(icon: category.icon),
                                          ),
                                        ),
                                        const SizedBox(height: 6),
                                        Text(category.name,
                                            maxLines: 1,
                                            textAlign: TextAlign.center,
                                            overflow: TextOverflow.ellipsis,
                                            style: const TextStyle(fontSize: 12,
                                                fontWeight: FontWeight.w600)),
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
                  ...products.when(
                    loading: () => [
                      const SliverToBoxAdapter(
                        child: _SectionHeading(title: 'Nossos produtos'),
                      ),
                      const SliverToBoxAdapter(child: _LoadingProducts()),
                    ],
                    error: (error, stackTrace) => [
                      SliverFillRemaining(
                        hasScrollBody: false,
                        child: EmptyState(
                          icon: Icons.wifi_off_outlined,
                          title: 'Não foi possível carregar a vitrine',
                          subtitle: 'Verifique sua conexão e tente novamente.',
                          buttonLabel: 'Tentar novamente',
                          onButtonPressed: () => ref.invalidate(productsProvider),
                        ),
                      ),
                    ],
                    data: (all) => [
                      if (featured.isNotEmpty) ...[
                        const SliverToBoxAdapter(
                          child: _SectionHeading(title: 'Seleção da loja',
                              subtitle: 'Escolhas especiais para você'),
                        ),
                        _ProductGrid(products: featured),
                      ],
                      const SliverToBoxAdapter(
                        child: _SectionHeading(title: 'Todos os produtos',
                            subtitle: 'Explore a coleção completa'),
                      ),
                      if (all.isEmpty)
                        const SliverFillRemaining(
                          hasScrollBody: false,
                          child: EmptyState(
                            icon: Icons.storefront_outlined,
                            title: 'Estamos preparando a vitrine',
                            subtitle: 'Novos produtos serão publicados em breve.',
                          ),
                        )
                      else
                        _ProductGrid(products: all),
                    ],
                  ),
                  const SliverToBoxAdapter(child: SizedBox(height: 28)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ProductGrid extends StatelessWidget {
  const _ProductGrid({required this.products});
  final List<Product> products;

  @override
  Widget build(BuildContext context) => SliverPadding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        sliver: SliverGrid(
          delegate: SliverChildBuilderDelegate(
            (context, index) => ProductCard(product: products[index]),
            childCount: products.length,
          ),
          gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
            maxCrossAxisExtent: 235,
            mainAxisExtent: 318,
            mainAxisSpacing: 14,
            crossAxisSpacing: 14,
          ),
        ),
      );
}

class _SectionHeading extends StatelessWidget {
  const _SectionHeading({required this.title, this.subtitle});
  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 22, 16, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleLarge),
            if (subtitle != null)
              Padding(
                padding: const EdgeInsets.only(top: 3),
                child: Text(subtitle!,
                    style: Theme.of(context).textTheme.bodyMedium),
              ),
          ],
        ),
      );
}

class _CategoryFallback extends StatelessWidget {
  const _CategoryFallback({required this.icon});
  final String icon;

  @override
  Widget build(BuildContext context) => ColoredBox(
        color: AppColors.divider,
        child: Center(child: Text(icon, style: const TextStyle(fontSize: 28))),
      );
}

class _LoadingProducts extends StatelessWidget {
  const _LoadingProducts();

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: LayoutBuilder(
          builder: (context, constraints) {
            final columns = constraints.maxWidth >= 900 ? 4 :
                constraints.maxWidth >= 600 ? 3 : 2;
            return Row(
              children: List.generate(columns, (index) => Expanded(
                child: Container(
                  height: 250,
                  margin: EdgeInsets.only(right: index == columns - 1 ? 0 : 12),
                  decoration: BoxDecoration(
                    color: AppColors.divider,
                    borderRadius: BorderRadius.circular(18),
                  ),
                ),
              )),
            );
          },
        ),
      );
}

class _LegacyBanner extends StatelessWidget {
  const _LegacyBanner();

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.all(16),
        child: Material(
          borderRadius: BorderRadius.circular(18),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: () => context.push('/discounted'),
            child: Container(
              height: 164,
              padding: const EdgeInsets.all(24),
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: [AppColors.primary, AppColors.accent],
                ),
              ),
              child: const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text('Coleção em destaque',
                      style: TextStyle(color: Colors.white70, fontSize: 14)),
                  SizedBox(height: 8),
                  Text('Descubra nossas ofertas',
                      style: TextStyle(color: Colors.white, fontSize: 24,
                          fontWeight: FontWeight.w800)),
                  SizedBox(height: 12),
                  Row(mainAxisSize: MainAxisSize.min, children: [
                    Text('Explorar promoções',
                        style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
                    SizedBox(width: 6),
                    Icon(Icons.arrow_forward, color: Colors.white, size: 17),
                  ]),
                ],
              ),
            ),
          ),
        ),
      );
}
