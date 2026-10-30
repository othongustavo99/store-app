import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../providers/favorites_providers.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../models/product.dart';

/// Cartão responsivo, com alvo de toque acessível e preço sem overflow.
/// A grade que o contém deve usar altura de 306 a 330 pixels.
class ProductCard extends ConsumerWidget {
  const ProductCard({super.key, required this.product});

  final Product product;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currency = NumberFormat.currency(locale: 'pt_BR', symbol: 'R\$');
    final soldOut = !product.isAvailable;
    final oldPrice = product.oldPrice;
    final discounted = oldPrice != null &&
        oldPrice > 0 &&
        oldPrice > product.price &&
        product.price >= 0;
    final discount =
        discounted ? ((oldPrice - product.price) / oldPrice * 100).round() : 0;
    final isFavorite = ref
        .watch(favoriteIdsProvider.select((ids) => ids.contains(product.id)));
    final imageUrl = product.images.isEmpty ? '' : product.images.first.trim();

    return Semantics(
      button: true,
      label:
          '${product.name}, ${currency.format(product.price)}${soldOut ? ', esgotado' : ''}',
      child: Material(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => context.push('/product/${product.id}'),
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: AppColors.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      if (imageUrl.isNotEmpty)
                        ColorFiltered(
                          colorFilter: soldOut
                              ? const ColorFilter.mode(
                                  Colors.grey, BlendMode.saturation)
                              : const ColorFilter.mode(
                                  Colors.transparent, BlendMode.multiply),
                          child: CachedNetworkImage(
                            imageUrl: imageUrl,
                            fit: BoxFit.cover,
                            memCacheWidth: 600,
                            placeholder: (_, __) => const _ImagePlaceholder(),
                            errorWidget: (_, __, ___) =>
                                const _ImagePlaceholder(),
                          ),
                        )
                      else
                        const _ImagePlaceholder(),
                      Positioned(
                          right: 6,
                          bottom: 6,
                          child: Material(
                            color: Theme.of(context)
                                .colorScheme
                                .surface
                                .withValues(alpha: 0.95),
                            shape: const CircleBorder(),
                            child: IconButton(
                              tooltip: isFavorite
                                  ? 'Remover dos favoritos'
                                  : 'Adicionar aos favoritos',
                              onPressed: () => ref
                                  .read(favoriteIdsProvider.notifier)
                                  .toggle(product.id),
                              icon: Icon(
                                  isFavorite
                                      ? Icons.favorite
                                      : Icons.favorite_border,
                                  color: isFavorite
                                      ? Colors.redAccent
                                      : Theme.of(context).colorScheme.primary),
                            ),
                          )),
                      if (soldOut)
                        const Positioned(
                          left: 10,
                          top: 10,
                          child: _Pill(
                              text: 'Esgotado', color: AppColors.textSecondary),
                        )
                      else ...[
                        if (product.isNew)
                          Positioned(
                            left: 10,
                            top: 10,
                            child: _Pill(
                                text: 'Novidade',
                                color: Theme.of(context).colorScheme.primary),
                          ),
                        if (discounted && discount > 0)
                          Positioned(
                            right: 10,
                            top: 10,
                            child: _Pill(
                                text: '-$discount%',
                                color: Theme.of(context).colorScheme.secondary),
                          ),
                      ],
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 12, 12, 13),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        product.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 14,
                          height: 1.25,
                          fontWeight: FontWeight.w600,
                          color: soldOut
                              ? AppColors.textSecondary
                              : AppColors.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        currency.format(product.price),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w800,
                          color: soldOut
                              ? AppColors.textLight
                              : Theme.of(context).colorScheme.primary,
                        ),
                      ),
                      SizedBox(
                        height: 18,
                        child: discounted
                            ? Text(
                                currency.format(oldPrice),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: AppColors.textSecondary,
                                  decoration: TextDecoration.lineThrough,
                                ),
                              )
                            : const SizedBox.shrink(),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ImagePlaceholder extends StatelessWidget {
  const _ImagePlaceholder();

  @override
  Widget build(BuildContext context) => const ColoredBox(
        color: AppColors.divider,
        child: Center(
          child:
              Icon(Icons.photo_outlined, color: AppColors.textLight, size: 32),
        ),
      );
}

class _Pill extends StatelessWidget {
  const _Pill({required this.text, required this.color});
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(9),
        ),
        child: Text(
          text,
          style: TextStyle(
            fontSize: 11,
            height: 1,
            fontWeight: FontWeight.w700,
            color: AppTheme.onColor(color),
          ),
        ),
      );
}
