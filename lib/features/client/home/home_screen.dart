import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/network/loja_api.dart';
import '../../../models/product.dart';
import '../../../providers/category_providers.dart';
import '../../../providers/product_providers.dart';
import '../widgets/empty_state.dart';
import '../widgets/product_card.dart';
import '../widgets/railway_storefront_identity.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final products = ref.watch(productsProvider);
    final categories = ref.watch(categoriesProvider);
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
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
              } catch (_) {/* A tela oferece nova tentativa. */}
            },
            child: CustomScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                slivers: [
                  SliverAppBar(
                      floating: true,
                      titleSpacing: 16,
                      title: const RailwayStorefrontIdentity(),
                      actions: [
                        IconButton(
                            tooltip: 'Buscar produtos',
                            icon: const Icon(Icons.search),
                            onPressed: () => context.push('/search')),
                        const SizedBox(width: 8)
                      ]),
                  SliverToBoxAdapter(
                      child: Padding(
                          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                          child: Semantics(
                              button: true,
                              label: 'Buscar peças na coleção',
                              child: Material(
                                  color: scheme.surface,
                                  borderRadius: BorderRadius.circular(16),
                                  child: InkWell(
                                      onTap: () => context.push('/search'),
                                      borderRadius: BorderRadius.circular(16),
                                      child: Container(
                                          padding: const EdgeInsets.all(16),
                                          decoration: BoxDecoration(
                                              border: Border.all(
                                                  color: scheme.outlineVariant),
                                              borderRadius:
                                                  BorderRadius.circular(16)),
                                          child: Row(children: [
                                            Icon(Icons.search,
                                                color: scheme.onSurfaceVariant),
                                            const SizedBox(width: 12),
                                            Expanded(
                                                child: Text(
                                                    'Qual peça combina com você?',
                                                    style: TextStyle(
                                                        color: scheme
                                                            .onSurfaceVariant))),
                                            const Icon(Icons.tune, size: 20)
                                          ]))))))),
                  const SliverToBoxAdapter(
                      child: RailwayStorefrontIdentity(banner: true)),
                  const SliverToBoxAdapter(
                      child: _SectionHeading(title: 'Explore por categoria')),
                  SliverToBoxAdapter(
                      child: SizedBox(
                          height: 112,
                          child: categories.when(
                            loading: () => const Center(
                                child: CircularProgressIndicator()),
                            error: (_, __) => Center(
                                child: TextButton(
                                    onPressed: () =>
                                        ref.invalidate(categoriesProvider),
                                    child: const Text(
                                        'Carregar categorias novamente'))),
                            data: (items) => items.isEmpty
                                ? const Center(
                                    child: Text('Novas categorias em breve.'))
                                : ListView.separated(
                                    scrollDirection: Axis.horizontal,
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 16),
                                    itemCount: items.length,
                                    separatorBuilder: (_, __) =>
                                        const SizedBox(width: 12),
                                    itemBuilder: (context, index) {
                                      final category = items[index];
                                      final matches = products.valueOrNull
                                          ?.where((product) =>
                                              product.categoryId ==
                                                  category.id &&
                                              product.images.isNotEmpty);
                                      final image =
                                          category.imageUrl.trim().isNotEmpty
                                              ? category.imageUrl
                                              : matches?.isNotEmpty == true
                                                  ? matches!.first.images.first
                                                  : '';
                                      Widget fallback() => ColoredBox(
                                          color: scheme.surfaceContainerLow,
                                          child: Center(
                                              child: Text(category.icon,
                                                  style: const TextStyle(
                                                      fontSize: 26))));
                                      return Semantics(
                                          button: true,
                                          label: 'Categoria ${category.name}',
                                          child: InkWell(
                                              onTap: () => context.push(
                                                  '/category/${category.id}'),
                                              borderRadius:
                                                  BorderRadius.circular(16),
                                              child: SizedBox(
                                                  width: 88,
                                                  child: Column(children: [
                                                    ClipRRect(
                                                        borderRadius:
                                                            BorderRadius
                                                                .circular(20),
                                                        child: SizedBox(
                                                            width: 72,
                                                            height: 72,
                                                            child: image.isEmpty
                                                                ? fallback()
                                                                : CachedNetworkImage(
                                                                    imageUrl:
                                                                        image,
                                                                    fit: BoxFit
                                                                        .cover,
                                                                    memCacheWidth:
                                                                        240,
                                                                    errorWidget: (_,
                                                                            __,
                                                                            ___) =>
                                                                        fallback()))),
                                                    const SizedBox(height: 8),
                                                    Text(category.name,
                                                        maxLines: 1,
                                                        overflow: TextOverflow
                                                            .ellipsis,
                                                        style: const TextStyle(
                                                            fontSize: 12,
                                                            fontWeight:
                                                                FontWeight
                                                                    .w600)),
                                                  ]))));
                                    }),
                          ))),
                  ...products.when(
                    loading: () => [
                      const SliverToBoxAdapter(
                          child:
                              _SectionHeading(title: 'Preparando a coleção')),
                      SliverToBoxAdapter(
                          child: Padding(
                              padding: const EdgeInsets.all(16),
                              child: Row(children: [
                                for (var index = 0; index < 2; index++)
                                  Expanded(
                                      child: Container(
                                          height: 240,
                                          margin: EdgeInsets.only(
                                              right: index == 0 ? 12 : 0),
                                          decoration: BoxDecoration(
                                              color: scheme.surfaceContainerLow,
                                              borderRadius:
                                                  BorderRadius.circular(18)))),
                              ])))
                    ],
                    error: (_, __) => [
                      SliverFillRemaining(
                          hasScrollBody: false,
                          child: EmptyState(
                              icon: Icons.wifi_off_outlined,
                              title: 'Não foi possível carregar a vitrine',
                              subtitle:
                                  'Verifique a conexão e tente novamente.',
                              buttonLabel: 'Tentar novamente',
                              onButtonPressed: () =>
                                  ref.invalidate(productsProvider)))
                    ],
                    data: (all) {
                      if (all.isEmpty) {
                        return [
                          const SliverFillRemaining(
                              hasScrollBody: false,
                              child: EmptyState(
                                  icon: Icons.storefront_outlined,
                                  title: 'Estamos preparando a vitrine',
                                  subtitle:
                                      'Novas peças serão publicadas em breve.'))
                        ];
                      }
                      final used = <String>{};
                      List<Product> select(
                          bool Function(Product) predicate, int limit) {
                        final result = all
                            .where((item) =>
                                !used.contains(item.id) && predicate(item))
                            .take(limit)
                            .toList();
                        used.addAll(result.map((item) => item.id));
                        return result;
                      }

                      final featured = select((item) => item.isFeatured, 8);
                      final offers = select(
                          (item) =>
                              item.oldPrice != null &&
                              item.oldPrice! > item.price,
                          6);
                      final newest = select((item) => item.isNew, 6);
                      final other = all
                          .where((item) => !used.contains(item.id))
                          .take(12)
                          .toList();
                      return [
                        if (featured.isNotEmpty) ...[
                          SliverToBoxAdapter(
                              child: _SectionHeading(
                                  title: 'Seleção da loja',
                                  subtitle: 'Peças que merecem sua atenção',
                                  onMore: () => context.push(
                                      LojaBackend.isRailway
                                          ? '/search?featured=true'
                                          : '/search'))),
                          SliverToBoxAdapter(
                              child: _HorizontalProducts(products: featured)),
                        ],
                        if (offers.isNotEmpty) ...[
                          SliverToBoxAdapter(
                              child: _SectionHeading(
                                  title: 'Bons achados',
                                  subtitle: 'Peças com preços especiais',
                                  onMore: () => context.push('/discounted'))),
                          SliverToBoxAdapter(
                              child: _HorizontalProducts(products: offers)),
                        ],
                        if (newest.isNotEmpty) ...[
                          SliverToBoxAdapter(
                              child: _SectionHeading(
                                  title: 'Acabaram de chegar',
                                  subtitle:
                                      'Novidades para renovar suas escolhas',
                                  onMore: () => context.push(
                                      LojaBackend.isRailway
                                          ? '/search?new=true'
                                          : '/search'))),
                          SliverToBoxAdapter(
                              child: _HorizontalProducts(products: newest)),
                        ],
                        if (other.isNotEmpty) ...[
                          SliverToBoxAdapter(
                              child: _SectionHeading(
                                  title: 'Mais para explorar',
                                  onMore: () => context.push('/search'))),
                          _ProductGrid(products: other),
                        ],
                      ];
                    },
                  ),
                  SliverToBoxAdapter(
                      child: Padding(
                          padding: const EdgeInsets.fromLTRB(16, 24, 16, 24),
                          child: OutlinedButton.icon(
                              onPressed: () => context.push('/search'),
                              icon: const Icon(Icons.grid_view_rounded),
                              label:
                                  const Text('Explorar catálogo completo')))),
                ])),
      ))),
    );
  }
}

class _SectionHeading extends StatelessWidget {
  const _SectionHeading({required this.title, this.subtitle, this.onMore});
  final String title;
  final String? subtitle;
  final VoidCallback? onMore;
  @override
  Widget build(BuildContext context) => Padding(
      padding: const EdgeInsets.fromLTRB(16, 22, 16, 10),
      child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
        Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: Theme.of(context).textTheme.titleLarge),
          if (subtitle != null)
            Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(subtitle!,
                    style: Theme.of(context).textTheme.bodySmall)),
        ])),
        if (onMore != null)
          TextButton(onPressed: onMore, child: const Text('Ver tudo')),
      ]));
}

class _ProductGrid extends StatelessWidget {
  const _ProductGrid({required this.products});
  final List<Product> products;
  @override
  Widget build(BuildContext context) => SliverPadding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      sliver: SliverGrid(
          delegate: SliverChildBuilderDelegate(
              (context, index) => ProductCard(product: products[index]),
              childCount: products.length),
          gridDelegate: SliverGridDelegateWithMaxCrossAxisExtent(
              maxCrossAxisExtent: 235,
              mainAxisExtent: 318 +
                  ((MediaQuery.textScalerOf(context).scale(14) / 14 - 1) * 80)
                      .clamp(0, 120),
              crossAxisSpacing: 14,
              mainAxisSpacing: 14)));
}

class _HorizontalProducts extends StatelessWidget {
  const _HorizontalProducts({required this.products});
  final List<Product> products;
  @override
  Widget build(BuildContext context) => SizedBox(
      height: 318 +
          ((MediaQuery.textScalerOf(context).scale(14) / 14 - 1) * 80)
              .clamp(0, 120),
      child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          itemCount: products.length,
          separatorBuilder: (_, __) => const SizedBox(width: 12),
          itemBuilder: (_, index) => SizedBox(
              width: MediaQuery.sizeOf(context).width < 600 ? 176 : 210,
              child: ProductCard(product: products[index]))));
}
