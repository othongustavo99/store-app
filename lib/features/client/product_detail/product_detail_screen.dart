import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../widgets/product_card.dart';
import '../../../core/theme/app_colors.dart';
import '../../../models/product.dart';
import '../../../providers/product_providers.dart';
import '../../../providers/cart_providers.dart';

class ProductDetailScreen extends ConsumerStatefulWidget {
  final String productId;

  const ProductDetailScreen({super.key, required this.productId});

  @override
  ConsumerState<ProductDetailScreen> createState() =>
      _ProductDetailScreenState();
}

class _ProductDetailScreenState extends ConsumerState<ProductDetailScreen> {
  String? selectedColor;
  String? selectedSize;
  int quantity = 1;
  int currentImageIndex = 0;

  @override
  Widget build(BuildContext context) {
    final asyncProducts = ref.watch(productsProvider);
    final currency = NumberFormat.currency(locale: 'pt_BR', symbol: 'R\$');

    return asyncProducts.when(
      loading: () => const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      ),
      error: (e, _) => Scaffold(
        appBar: AppBar(),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Erro ao carregar produto.\n$e',
              textAlign: TextAlign.center,
            ),
          ),
        ),
      ),
      data: (all) {
        Product? product;
        try {
          product = all.firstWhere((p) => p.id == widget.productId);
        } catch (_) {
          product = null;
        }

        if (product == null) {
          return Scaffold(
            appBar: AppBar(
              leading: IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: () => context.pop(),
              ),
            ),
            body: const Center(child: Text('Produto não encontrado')),
          );
        }

        // Produtos da mesma categoria (exceto o atual), máx. 8
        final similar = all
            .where((p) =>
                p.categoryId == product!.categoryId && p.id != product.id)
            .take(8)
            .toList();

        final colors = product.availableColors;
        final sizes = product.availableSizes;

        if (selectedColor == null && colors.isNotEmpty) {
          selectedColor = colors.first;
        }
        if (selectedSize == null && sizes.isNotEmpty) {
          selectedSize = sizes.first;
        }

        final currentVariant =
            product.getVariant(selectedColor ?? '', selectedSize ?? '');
        final isAvailable =
            currentVariant != null && currentVariant.isAvailable;

        return Scaffold(
          backgroundColor: AppColors.background,
          body: Column(
            children: [
              Expanded(
                child: CustomScrollView(
                  slivers: [
                    SliverAppBar(
                      expandedHeight: 380,
                      pinned: true,
                      backgroundColor: Colors.white,
                      leading: IconButton(
                        icon: const Icon(Icons.arrow_back),
                        onPressed: () => context.pop(),
                      ),
                      flexibleSpace: FlexibleSpaceBar(
                        background: Stack(
                          children: [
                            PageView.builder(
                              itemCount: product.images.isEmpty
                                  ? 1
                                  : product.images.length,
                              onPageChanged: (index) {
                                setState(() => currentImageIndex = index);
                              },
                              itemBuilder: (context, index) {
                                final url = product!.images.isNotEmpty
                                    ? product.images[index]
                                    : '';
                                return CachedNetworkImage(
                                  imageUrl: url,
                                  fit: BoxFit.cover,
                                  width: double.infinity,
                                  placeholder: (_, __) => Container(
                                    color: AppColors.divider,
                                    child: const Center(
                                      child: CircularProgressIndicator(),
                                    ),
                                  ),
                                  errorWidget: (_, __, ___) => Container(
                                    color: AppColors.divider,
                                    child: const Icon(
                                      Icons.image_not_supported,
                                      size: 60,
                                    ),
                                  ),
                                );
                              },
                            ),
                            if (product.images.length > 1)
                              Positioned(
                                bottom: 16,
                                left: 0,
                                right: 0,
                                child: Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: List.generate(
                                    product.images.length,
                                    (index) => Container(
                                      width: 8,
                                      height: 8,
                                      margin: const EdgeInsets.symmetric(
                                        horizontal: 4,
                                      ),
                                      decoration: BoxDecoration(
                                        shape: BoxShape.circle,
                                        color: currentImageIndex == index
                                            ? AppColors.primary
                                            : Colors.white.withOpacity(0.6),
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                    SliverToBoxAdapter(
                      child: Container(
                        color: Colors.white,
                        padding: const EdgeInsets.all(20),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              product.name,
                              style: const TextStyle(
                                fontSize: 22,
                                fontWeight: FontWeight.bold,
                                color: AppColors.textPrimary,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                Text(
                                  currency.format(product.price),
                                  style: const TextStyle(
                                    fontSize: 24,
                                    fontWeight: FontWeight.bold,
                                    color: AppColors.primary,
                                  ),
                                ),
                                if (product.oldPrice != null) ...[
                                  const SizedBox(width: 12),
                                  Text(
                                    currency.format(product.oldPrice),
                                    style: const TextStyle(
                                      fontSize: 16,
                                      color: AppColors.textLight,
                                      decoration: TextDecoration.lineThrough,
                                    ),
                                  ),
                                ],
                              ],
                            ),
                            const SizedBox(height: 20),
                            const Text(
                              'Descrição',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              product.description,
                              style: const TextStyle(
                                fontSize: 14,
                                color: AppColors.textSecondary,
                                height: 1.5,
                              ),
                            ),
                            const SizedBox(height: 24),
                            const Text(
                              'Cor',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            const SizedBox(height: 12),
                            Wrap(
                              spacing: 10,
                              runSpacing: 10,
                              children: colors.map((color) {
                                final isSelected = selectedColor == color;
                                return GestureDetector(
                                  onTap: () {
                                    setState(() {
                                      selectedColor = color;
                                      final availableSizesForColor = product!
                                          .variants
                                          .where((v) =>
                                              v.color == color && v.stock > 0)
                                          .map((v) => v.size)
                                          .toList();
                                      if (!availableSizesForColor
                                          .contains(selectedSize)) {
                                        selectedSize =
                                            availableSizesForColor.isNotEmpty
                                                ? availableSizesForColor.first
                                                : null;
                                      }
                                    });
                                  },
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 16,
                                      vertical: 10,
                                    ),
                                    decoration: BoxDecoration(
                                      color: isSelected
                                          ? AppColors.primary
                                          : Colors.white,
                                      borderRadius: BorderRadius.circular(10),
                                      border: Border.all(
                                        color: isSelected
                                            ? AppColors.primary
                                            : AppColors.border,
                                      ),
                                    ),
                                    child: Text(
                                      color,
                                      style: TextStyle(
                                        color: isSelected
                                            ? Colors.white
                                            : AppColors.textPrimary,
                                        fontWeight: FontWeight.w500,
                                      ),
                                    ),
                                  ),
                                );
                              }).toList(),
                            ),
                            const SizedBox(height: 24),
                            const Text(
                              'Tamanho',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            const SizedBox(height: 12),
                            Wrap(
                              spacing: 10,
                              runSpacing: 10,
                              children: sizes.map((size) {
                                final variant = product!
                                    .getVariant(selectedColor ?? '', size);
                                final hasStock =
                                    variant != null && variant.stock > 0;
                                final isSelected = selectedSize == size;

                                return GestureDetector(
                                  onTap: hasStock
                                      ? () =>
                                          setState(() => selectedSize = size)
                                      : null,
                                  child: Container(
                                    width: 52,
                                    height: 52,
                                    alignment: Alignment.center,
                                    decoration: BoxDecoration(
                                      color: isSelected
                                          ? AppColors.primary
                                          : hasStock
                                              ? Colors.white
                                              : AppColors.divider,
                                      borderRadius: BorderRadius.circular(10),
                                      border: Border.all(
                                        color: isSelected
                                            ? AppColors.primary
                                            : hasStock
                                                ? AppColors.border
                                                : Colors.transparent,
                                      ),
                                    ),
                                    child: Text(
                                      size,
                                      style: TextStyle(
                                        color: isSelected
                                            ? Colors.white
                                            : hasStock
                                                ? AppColors.textPrimary
                                                : AppColors.textLight,
                                        fontWeight: FontWeight.w600,
                                        decoration: hasStock
                                            ? null
                                            : TextDecoration.lineThrough,
                                      ),
                                    ),
                                  ),
                                );
                              }).toList(),
                            ),
                            const SizedBox(height: 16),
                            if (currentVariant != null)
                              Text(
                                currentVariant.stock > 0
                                    ? 'Estoque: ${currentVariant.stock} unidades'
                                    : 'Esgotado nesta combinação',
                                style: TextStyle(
                                  fontSize: 13,
                                  color: currentVariant.stock > 0
                                      ? AppColors.success
                                      : AppColors.error,
                                ),
                              ),
                            const SizedBox(height: 24),
                            const Text(
                              'Quantidade',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            const SizedBox(height: 12),
                            Row(
                              children: [
                                _QuantityButton(
                                  icon: Icons.remove,
                                  onTap: quantity > 1
                                      ? () => setState(() => quantity--)
                                      : null,
                                ),
                                Container(
                                  width: 60,
                                  alignment: Alignment.center,
                                  child: Text(
                                    '$quantity',
                                    style: const TextStyle(
                                      fontSize: 18,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ),
                                _QuantityButton(
                                  icon: Icons.add,
                                  onTap: (currentVariant != null &&
                                          quantity < currentVariant.stock)
                                      ? () => setState(() => quantity++)
                                      : null,
                                ),
                              ],
                            ),
                            const SizedBox(height: 40),

                            // ========== ITENS SEMELHANTES ==========
                            if (similar.isNotEmpty) ...[
                              const SizedBox(height: 8),
                              const Padding(
                                padding: EdgeInsets.symmetric(horizontal: 16),
                                child: Align(
                                  alignment: Alignment.centerLeft,
                                  child: Text(
                                    'Itens semelhantes',
                                    style: TextStyle(
                                      fontSize: 18,
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.textPrimary,
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 12),
                              SizedBox(
                                height: 260,
                                child: ListView.separated(
                                  scrollDirection: Axis.horizontal,
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 16),
                                  itemCount: similar.length,
                                  separatorBuilder: (_, __) =>
                                      const SizedBox(width: 12),
                                  itemBuilder: (context, index) {
                                    final item = similar[index];
                                    return SizedBox(
                                      width: 160,
                                      child: ProductCard(product: item),
                                    );
                                  },
                                ),
                              ),
                              const SizedBox(height: 24),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.06),
                      blurRadius: 10,
                      offset: const Offset(0, -4),
                    ),
                  ],
                ),
                child: SafeArea(
                  child: Row(
                    children: [
                      Expanded(
                        child: SizedBox(
                          height: 54,
                          child: OutlinedButton(
                            onPressed: isAvailable
                                ? () {
                                    ref.read(cartProvider.notifier).addItem(
                                          product: product!,
                                          color: selectedColor!,
                                          size: selectedSize!,
                                          quantity: quantity,
                                        );

                                    final messenger =
                                        ScaffoldMessenger.of(context);
                                    messenger.clearSnackBars();

                                    messenger.showSnackBar(
                                      SnackBar(
                                        content: const Text(
                                            'Produto adicionado ao carrinho!'),
                                        duration: const Duration(seconds: 2),
                                        backgroundColor: AppColors.success,
                                        behavior: SnackBarBehavior.floating,
                                        margin: const EdgeInsets.fromLTRB(
                                            16, 0, 16, 90),
                                        dismissDirection: DismissDirection.down,
                                        action: SnackBarAction(
                                          label: 'Ver carrinho',
                                          textColor: Colors.white,
                                          onPressed: () {
                                            messenger.hideCurrentSnackBar();
                                            context.go('/cart');
                                          },
                                        ),
                                      ),
                                    );

// Garante que some em 2 segundos (mesmo com o botão de ação)
                                    Future.delayed(const Duration(seconds: 2),
                                        () {
                                      messenger.hideCurrentSnackBar();
                                    });
                                  }
                                : null,
                            child: const Text(
                              'Carrinho',
                              textAlign: TextAlign.center,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: SizedBox(
                          height: 54,
                          child: ElevatedButton(
                            onPressed: isAvailable
                                ? () {
                                    ref.read(cartProvider.notifier).addItem(
                                          product: product!,
                                          color: selectedColor!,
                                          size: selectedSize!,
                                          quantity: quantity,
                                        );

                                    context.push('/checkout');
                                  }
                                : null,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.primary,
                            ),
                            child: Text(
                              isAvailable ? 'Comprar agora' : 'Indisponível',
                              textAlign: TextAlign.center,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _QuantityButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onTap;

  const _QuantityButton({required this.icon, this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: onTap != null
          ? AppColors.primary.withOpacity(0.1)
          : AppColors.divider,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: SizedBox(
          width: 42,
          height: 42,
          child: Icon(
            icon,
            color: onTap != null ? AppColors.primary : AppColors.textLight,
            size: 20,
          ),
        ),
      ),
    );
  }
}
