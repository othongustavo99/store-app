import 'package:loja_roupas/router/app_back_button.dart';
import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/constants/app_constants.dart';
import '../../../core/network/loja_api.dart';
import '../../../providers/store_profile_providers.dart';
import '../../../providers/favorites_providers.dart';
import '../../../core/utils/product_presentation.dart';
import '../widgets/empty_state.dart';
import '../widgets/product_media_gallery.dart';
import '../widgets/product_purchase_bar.dart';
import '../../../core/theme/app_colors.dart';
import '../../../data/services/media_upload_service.dart';
import '../../../data/services/shipping_service.dart';
import '../../../models/product.dart';
import '../../../models/review.dart';
import '../../../providers/auth_providers.dart';
import '../../../providers/cart_providers.dart';
import '../../../providers/product_providers.dart';
import '../../../providers/review_providers.dart';
import '../widgets/product_card.dart';

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

  // Frete
  final _cepController = TextEditingController();
  List<ShippingOption> _shippingOptions = [];
  bool _loadingShipping = false;
  String? _shippingError;
  String? _shippingCity;

  @override
  void dispose() {
    _cepController.dispose();
    super.dispose();
  }

  Future<void> _calcShipping(double price) async {
    setState(() {
      _loadingShipping = true;
      _shippingError = null;
      _shippingOptions = [];
      _shippingCity = null;
    });

    try {
      final service = ShippingService();
      final data = await service.fetchCep(_cepController.text);
      if (data == null) {
        setState(() {
          _shippingError = 'CEP inválido';
          _loadingShipping = false;
        });
        return;
      }
      final uf = data['uf'] as String? ?? '';
      final city = data['localidade'] as String? ?? '';
      final options = service.calculate(uf, price);

      setState(() {
        _shippingCity = '$city/$uf';
        _shippingOptions = options;
        _loadingShipping = false;
      });
    } catch (_) {
      setState(() {
        _shippingError = 'Erro ao calcular frete';
        _loadingShipping = false;
      });
    }
  }

  void _openGallery(List<String> images, int initial) {
    if (images.isEmpty) return;
    Navigator.of(context).push(MaterialPageRoute<void>(
        builder: (_) => _ProductGallery(images: images, initial: initial)));
  }

  Future<void> _shareProduct(Product product, NumberFormat currency) async {
    var name = ref.read(storeNameProvider);
    try {
      final profile = await ref.read(storeProfileProvider.future);
      final configured = profile['displayName']?.toString().trim() ?? '';
      if (configured.isNotEmpty) name = configured;
    } catch (_) {/* A marca já carregada permanece disponível. */}
    if (!mounted) return;
    final text = productShareText(product,
        storeName: name,
        formattedPrice: currency.format(product.price),
        color: selectedColor,
        size: selectedSize,
        publicBaseUrl:
            const String.fromEnvironment('LOJA_PUBLIC_STOREFRONT_URL'));
    final box = context.findRenderObject() as RenderBox?;
    await SharePlus.instance.share(ShareParams(
        text: text,
        subject: product.name,
        sharePositionOrigin:
            box == null ? null : box.localToGlobal(Offset.zero) & box.size));
  }

  Future<void> _openWhatsApp(Product product) async {
    final msg = Uri.encodeComponent(
      'Olá! Tenho interesse em ${product.name}. Cor: ${selectedColor ?? '-'}, tamanho: ${selectedSize ?? '-'}.',
    );
    var phone = AppConstants.whatsappNumber;
    if (LojaBackend.isRailway) {
      try {
        final profile = await ref.read(storeProfileProvider.future);
        phone = profile['supportPhone']?.toString() ?? '';
      } catch (_) {
        phone = '';
      }
    }
    if (phone.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('WhatsApp ainda não configurado pela loja.')));
      }
      return;
    }
    final digits = phone.replaceAll(RegExp(r'\D'), '');
    final normalizedPhone =
        digits.length == 10 || digits.length == 11 ? '55$digits' : digits;
    final uri = Uri.parse('https://wa.me/$normalizedPhone?text=$msg');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Não foi possível abrir o WhatsApp')),
      );
    }
  }

  void _addProduct(Product product, {required bool buyNow}) {
    if (selectedColor == null || selectedSize == null) return;
    final before = ref.read(cartItemCountProvider);
    ref.read(cartProvider.notifier).addItem(
        product: product,
        color: selectedColor!,
        size: selectedSize!,
        quantity: quantity);
    final added = ref.read(cartItemCountProvider) - before;
    if (buyNow) {
      context.push('/checkout');
      return;
    }
    final messenger = ScaffoldMessenger.of(context)..hideCurrentSnackBar();
    messenger.showSnackBar(SnackBar(
        content: Text(added > 0
            ? '$added ${added == 1 ? 'item adicionado' : 'itens adicionados'} ao carrinho.'
            : 'Você já adicionou o máximo disponível desta combinação.'),
        action: SnackBarAction(
            label: 'Ver carrinho', onPressed: () => context.go('/cart'))));
  }

  @override
  Widget build(BuildContext context) {
    final collection = ref.watch(productsProvider);
    final all = collection.valueOrNull ?? const <Product>[];
    final asyncProduct = LojaBackend.isRailway
        ? ref.watch(railwayProductByIdProvider(widget.productId))
        : collection.whenData((items) =>
            items.where((item) => item.id == widget.productId).firstOrNull);
    final currency = NumberFormat.currency(locale: 'pt_BR', symbol: 'R\$');
    return asyncProduct.when(
      loading: () => Scaffold(
          appBar: AppBar(leading: const AppBackButton()),
          body: const Center(child: CircularProgressIndicator())),
      error: (_, __) => Scaffold(
          appBar: AppBar(leading: const AppBackButton()),
          body: EmptyState(
              icon: Icons.wifi_off_outlined,
              title: 'Não foi possível abrir esta peça',
              subtitle: 'Verifique a conexão e tente novamente.',
              buttonLabel: 'Tentar novamente',
              onButtonPressed: () {
                if (LojaBackend.isRailway) {
                  ref.invalidate(railwayProductByIdProvider(widget.productId));
                } else {
                  ref.invalidate(productsProvider);
                }
              })),
      data: (product) {
        if (product == null) {
          return Scaffold(
              appBar: AppBar(leading: const AppBackButton()),
              body: EmptyState(
                  icon: Icons.checkroom_outlined,
                  title: 'Esta peça não está disponível',
                  subtitle: 'Confira outras opções da coleção.',
                  buttonLabel: 'Explorar coleção',
                  onButtonPressed: () => context.go('/search')));
        }
        // Produtos da mesma categoria (exceto o atual), máx. 8
        final similar = all
            .where(
                (p) => p.categoryId == product.categoryId && p.id != product.id)
            .take(8)
            .toList();

        final colors = product.availableColors;
        final sizes = product.availableSizes;

        // Prioriza uma combinação realmente disponível e mantém a quantidade
        // dentro do estoque apresentado pelo catálogo.
        final inStock =
            product.variants.where((variant) => variant.stock > 0).toList();
        if (selectedColor == null || !colors.contains(selectedColor)) {
          selectedColor = inStock.isNotEmpty
              ? inStock.first.color
              : (colors.isEmpty ? null : colors.first);
        }
        final validSizes = product.variants
            .where((variant) =>
                variant.color == selectedColor && variant.stock > 0)
            .map((variant) => variant.size)
            .toList();
        if (!validSizes.contains(selectedSize)) {
          selectedSize = validSizes.isEmpty ? null : validSizes.first;
        }
        final currentVariant =
            product.getVariant(selectedColor ?? '', selectedSize ?? '');
        final isAvailable =
            currentVariant != null && currentVariant.isAvailable;
        final purchaseLimit = (currentVariant?.stock ?? 0)
            .clamp(0, AppConstants.maxQuantityPerVariant)
            .toInt();
        if (currentVariant != null &&
            currentVariant.stock > 0 &&
            quantity > purchaseLimit) {
          quantity = purchaseLimit;
        }

        final galleryImages =
            productImagesForSelection(product, selectedColor, selectedSize);

        return Scaffold(
          backgroundColor: AppColors.background,
          bottomNavigationBar: ProductPurchaseBar(
            selection:
                '${selectedColor ?? ''} · ${selectedSize ?? 'Sem tamanho disponível'} · $quantity un.',
            total: currency.format(product.price * quantity),
            available: isAvailable,
            onAdd: () => _addProduct(product, buyNow: false),
            onBuy: () => _addProduct(product, buyNow: true),
          ),
          body: Column(
            children: [
              Expanded(
                child: CustomScrollView(
                  slivers: [
                    SliverAppBar(
                      expandedHeight: MediaQuery.sizeOf(context).width >= 900
                          ? 440
                          : MediaQuery.sizeOf(context).width < 360
                              ? 300
                              : 350,
                      pinned: true,
                      backgroundColor: Colors.white,
                      leading: const AppBackButton(fallbackLocation: '/'),
                      actions: [
                        IconButton.filledTonal(
                            tooltip: ref
                                    .watch(favoriteIdsProvider)
                                    .contains(product.id)
                                ? 'Remover dos favoritos'
                                : 'Adicionar aos favoritos',
                            onPressed: () => ref
                                .read(favoriteIdsProvider.notifier)
                                .toggle(product.id),
                            icon: Icon(ref
                                    .watch(favoriteIdsProvider)
                                    .contains(product.id)
                                ? Icons.favorite
                                : Icons.favorite_border)),
                        const SizedBox(width: 6),
                        IconButton.filledTonal(
                            tooltip: 'Compartilhar',
                            icon: const Icon(Icons.share_outlined),
                            onPressed: () => _shareProduct(product, currency)),
                        const SizedBox(width: 6),
                        IconButton.filledTonal(
                            tooltip: 'Ver carrinho',
                            onPressed: () => context.go('/cart'),
                            icon: Badge(
                                isLabelVisible:
                                    ref.watch(cartItemCountProvider) > 0,
                                label:
                                    Text('${ref.watch(cartItemCountProvider)}'),
                                child:
                                    const Icon(Icons.shopping_bag_outlined))),
                        const SizedBox(width: 12),
                      ],
                      flexibleSpace: FlexibleSpaceBar(
                          background: ProductMediaGallery(
                              key: ValueKey(
                                  '${product.id}:$selectedColor:$selectedSize:${galleryImages.join('|')}'),
                              images: galleryImages,
                              onOpen: (index) =>
                                  _openGallery(galleryImages, index))),
                    ),
                    SliverToBoxAdapter(
                      child: Center(
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 920),
                          child: Padding(
                            padding: const EdgeInsets.all(20),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                // ========== NOME ==========
                                Text(
                                  product.name,
                                  style: const TextStyle(
                                    fontSize: 22,
                                    fontWeight: FontWeight.bold,
                                    color: AppColors.textPrimary,
                                  ),
                                ),
                                const SizedBox(height: 8),

                                // ========== PREÇO ==========
                                Wrap(
                                  spacing: 12,
                                  runSpacing: 6,
                                  crossAxisAlignment: WrapCrossAlignment.center,
                                  children: [
                                    Text(
                                      currency.format(product.price),
                                      style: TextStyle(
                                        fontSize: 24,
                                        fontWeight: FontWeight.bold,
                                        color: Theme.of(context)
                                            .colorScheme
                                            .primary,
                                      ),
                                    ),
                                    if (product.oldPrice != null &&
                                        product.oldPrice! > product.price) ...[
                                      const SizedBox(width: 12),
                                      Text(
                                        currency.format(product.oldPrice),
                                        style: const TextStyle(
                                          fontSize: 16,
                                          color: AppColors.textLight,
                                          decoration:
                                              TextDecoration.lineThrough,
                                        ),
                                      ),
                                    ],
                                  ],
                                ),

                                const SizedBox(height: 10),
                                Text(
                                  'Subtotal para $quantity ${quantity == 1 ? 'unidade' : 'unidades'}: '
                                  '${currency.format(product.price * quantity)}',
                                  style: const TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.textPrimary,
                                  ),
                                ),
                                const SizedBox(height: 6),
                                const Text(
                                  'Formas de pagamento e eventuais parcelas são confirmadas na finalização.',
                                  style: TextStyle(
                                      fontSize: 13,
                                      color: AppColors.textSecondary),
                                ),
                                const SizedBox(height: 22),

                                // ========== COR ==========
                                const Text(
                                  'Cor',
                                  style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                const SizedBox(height: 12),
                                Wrap(
                                    spacing: 8,
                                    runSpacing: 8,
                                    children: colors.map((color) {
                                      final stocked = product.variants.any(
                                          (variant) =>
                                              variant.color == color &&
                                              variant.stock > 0);
                                      return ChoiceChip(
                                          label: Text(stocked
                                              ? color
                                              : '$color · esgotado'),
                                          selected: selectedColor == color,
                                          onSelected: (_) => setState(() {
                                                selectedColor = color;
                                                quantity = 1;
                                                final valid = product.variants
                                                    .where((variant) =>
                                                        variant.color ==
                                                            color &&
                                                        variant.stock > 0)
                                                    .map((variant) =>
                                                        variant.size)
                                                    .toList();
                                                if (!valid
                                                    .contains(selectedSize)) {
                                                  selectedSize =
                                                      valid.firstOrNull;
                                                }
                                              }));
                                    }).toList()),
                                const SizedBox(height: 24),

                                // ========== TAMANHO ==========
                                const Text(
                                  'Tamanho',
                                  style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                const SizedBox(height: 12),
                                Wrap(
                                    spacing: 8,
                                    runSpacing: 8,
                                    children: sizes.map((size) {
                                      final stock = product
                                              .getVariant(
                                                  selectedColor ?? '', size)
                                              ?.stock ??
                                          0;
                                      return Tooltip(
                                          message: stock > 0
                                              ? 'Tamanho $size disponível'
                                              : 'Tamanho $size indisponível nesta cor',
                                          child: ChoiceChip(
                                              label: Text(size),
                                              selected: selectedSize == size,
                                              onSelected: stock > 0
                                                  ? (_) => setState(() {
                                                        selectedSize = size;
                                                        quantity = 1;
                                                      })
                                                  : null));
                                    }).toList()),
                                const SizedBox(height: 16),
                                if (currentVariant != null)
                                  Text(
                                    currentVariant.stock > 0
                                        ? currentVariant.stock <= 3
                                            ? 'Últimas ${currentVariant.stock} unidades nesta combinação.'
                                            : 'Disponível nesta combinação'
                                        : 'Esgotado nesta combinação',
                                    style: TextStyle(
                                      fontSize: 13,
                                      color: currentVariant.stock > 0
                                          ? Colors.green.shade800
                                          : AppColors.error,
                                    ),
                                  ),
                                const SizedBox(height: 24),

                                // ========== QUANTIDADE ==========
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
                                              quantity < purchaseLimit)
                                          ? () => setState(() => quantity++)
                                          : null,
                                    ),
                                  ],
                                ),

                                // No Railway, a cotação real vem da API no checkout.
                                // Não exibir a tabela local de frete do modo legado.
                                if (LojaBackend.isRailway) ...[
                                  const SizedBox(height: 24),
                                  Card(
                                    child: Padding(
                                      padding: const EdgeInsets.all(14),
                                      child: Row(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Icon(Icons.local_shipping_outlined,
                                              color: Theme.of(context)
                                                  .colorScheme
                                                  .primary),
                                          const SizedBox(width: 12),
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment:
                                                  CrossAxisAlignment.start,
                                              children: const [
                                                Text('Entrega e retirada',
                                                    style: TextStyle(
                                                        fontWeight:
                                                            FontWeight.w700)),
                                                SizedBox(height: 4),
                                                Text(
                                                    'Consulte as opções, prazos e valores na finalização.',
                                                    style: TextStyle(
                                                        color: AppColors
                                                            .textSecondary)),
                                              ],
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ] else ...[
                                  // ========== CÁLCULO DE FRETE ==========
                                  const SizedBox(height: 28),
                                  const Text(
                                    'Calcular frete',
                                    style: TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  const SizedBox(height: 12),
                                  Row(
                                    children: [
                                      Expanded(
                                        child: TextField(
                                          controller: _cepController,
                                          keyboardType: TextInputType.number,
                                          decoration: InputDecoration(
                                            hintText: '00000-000',
                                            border: OutlineInputBorder(
                                              borderRadius:
                                                  BorderRadius.circular(10),
                                            ),
                                            contentPadding:
                                                const EdgeInsets.symmetric(
                                              horizontal: 14,
                                              vertical: 12,
                                            ),
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 10),
                                      SizedBox(
                                        height: 48,
                                        child: ElevatedButton(
                                          onPressed: _loadingShipping
                                              ? null
                                              : () => _calcShipping(
                                                    product.price * quantity,
                                                  ),
                                          style: ElevatedButton.styleFrom(
                                            backgroundColor: Theme.of(context)
                                                .colorScheme
                                                .primary,
                                          ),
                                          child: _loadingShipping
                                              ? const SizedBox(
                                                  width: 20,
                                                  height: 20,
                                                  child:
                                                      CircularProgressIndicator(
                                                    strokeWidth: 2,
                                                    color: Colors.white,
                                                  ),
                                                )
                                              : const Text('Calcular'),
                                        ),
                                      ),
                                    ],
                                  ),
                                  if (_shippingError != null) ...[
                                    const SizedBox(height: 8),
                                    Text(
                                      _shippingError!,
                                      style: const TextStyle(
                                        color: AppColors.error,
                                        fontSize: 13,
                                      ),
                                    ),
                                  ],
                                  if (_shippingCity != null) ...[
                                    const SizedBox(height: 8),
                                    Text(
                                      'Entrega para $_shippingCity',
                                      style: const TextStyle(
                                        fontSize: 13,
                                        color: AppColors.textSecondary,
                                      ),
                                    ),
                                  ],
                                  if (_shippingOptions.isNotEmpty) ...[
                                    const SizedBox(height: 12),
                                    ..._shippingOptions.map((o) {
                                      return Container(
                                        margin:
                                            const EdgeInsets.only(bottom: 8),
                                        padding: const EdgeInsets.all(12),
                                        decoration: BoxDecoration(
                                          border: Border.all(
                                              color: AppColors.border),
                                          borderRadius:
                                              BorderRadius.circular(10),
                                        ),
                                        child: Row(
                                          children: [
                                            const Icon(
                                              Icons.local_shipping_outlined,
                                              size: 20,
                                            ),
                                            const SizedBox(width: 10),
                                            Expanded(
                                              child: Text(
                                                '${o.name} — ${o.days} dia(s)',
                                                style: const TextStyle(
                                                  fontWeight: FontWeight.w500,
                                                ),
                                              ),
                                            ),
                                            Text(
                                              o.price == 0
                                                  ? 'Grátis'
                                                  : currency.format(o.price),
                                              style: TextStyle(
                                                fontWeight: FontWeight.bold,
                                                color: o.price == 0
                                                    ? AppColors.success
                                                    : Theme.of(context)
                                                        .colorScheme
                                                        .primary,
                                              ),
                                            ),
                                          ],
                                        ),
                                      );
                                    }),
                                  ],
                                ],

                                const SizedBox(height: 16),
                                ExpansionTile(
                                    tilePadding: EdgeInsets.zero,
                                    title: const Text('Sobre esta peça'),
                                    children: [
                                      Padding(
                                          padding:
                                              const EdgeInsets.only(bottom: 16),
                                          child: Align(
                                              alignment: Alignment.centerLeft,
                                              child: Text(
                                                  product.description
                                                          .trim()
                                                          .isEmpty
                                                      ? 'Consulte a loja para mais detalhes sobre esta peça.'
                                                      : product.description,
                                                  style: const TextStyle(
                                                      height: 1.5))))
                                    ]),
                                Wrap(spacing: 8, children: [
                                  TextButton.icon(
                                      onPressed: () => _openWhatsApp(product),
                                      icon: const Icon(Icons.chat_outlined),
                                      label: const Text('WhatsApp da loja')),
                                  TextButton.icon(
                                      onPressed: () => context.push('/chat'),
                                      icon: const Icon(Icons.support_agent),
                                      label: const Text('Atendimento')),
                                ]),
                                // ========== AVALIAÇÕES ==========
                                const SizedBox(height: 28),
                                _SizeGuide(guide: product.sizeGuide),
                                _ReviewsSection(
                                  productId: product.id,
                                  productName: product.name,
                                ),

                                // ========== ITENS SEMELHANTES ==========
                                if (similar.isNotEmpty) ...[
                                  const SizedBox(height: 28),
                                  const Align(
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
                                  const SizedBox(height: 12),
                                  SizedBox(
                                    height: 318 +
                                        ((MediaQuery.textScalerOf(context)
                                                            .scale(14) /
                                                        14 -
                                                    1) *
                                                80)
                                            .clamp(0, 120),
                                    child: ListView.separated(
                                      scrollDirection: Axis.horizontal,
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
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

// =============================================================================
// Botão de quantidade
// =============================================================================

class _QuantityButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onTap;

  const _QuantityButton({required this.icon, this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: onTap != null
          ? Theme.of(context).colorScheme.primary.withValues(alpha: 0.1)
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
            color: onTap != null
                ? Theme.of(context).colorScheme.primary
                : AppColors.textLight,
            size: 20,
          ),
        ),
      ),
    );
  }
}

// =============================================================================
// Seção de avaliações (fotos e vídeos)
// =============================================================================

class _ReviewsSection extends ConsumerStatefulWidget {
  final String productId;
  final String productName;

  const _ReviewsSection({
    required this.productId,
    required this.productName,
  });

  @override
  ConsumerState<_ReviewsSection> createState() => _ReviewsSectionState();
}

class _ReviewsSectionState extends ConsumerState<_ReviewsSection> {
  final _commentCtrl = TextEditingController();
  double _rating = 5;
  final List<File> _pickedFiles = [];
  bool _sending = false;

  @override
  void dispose() {
    _commentCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickMedia() async {
    final picker = ImagePicker();
    final files = await picker.pickMultipleMedia();
    if (files.isEmpty) return;
    setState(() {
      _pickedFiles.addAll(files.map((x) => File(x.path)));
    });
  }

  Future<void> _submit() async {
    final auth = ref.read(authProvider);
    if (!auth.isLoggedIn) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Faça login para avaliar')),
      );
      return;
    }
    if (_commentCtrl.text.trim().isEmpty) return;

    setState(() => _sending = true);
    try {
      final upload = MediaUploadService();
      final urls = <String>[];
      if (!LojaBackend.isRailway) {
        for (final f in _pickedFiles) {
          final lower = f.path.toLowerCase();
          final isVideo = lower.endsWith('.mp4') ||
              lower.endsWith('.mov') ||
              lower.endsWith('.avi');
          final url = isVideo
              ? await upload.uploadVideo(f, widget.productId)
              : await upload.uploadImage(f, widget.productId);
          urls.add(url);
        }
      }

      final review = Review(
        id: '',
        productId: widget.productId,
        userId: auth.email ?? '',
        userName: auth.name,
        userPhoto: auth.photoUrl,
        rating: _rating,
        comment: _commentCtrl.text.trim(),
        mediaUrls: urls,
        createdAt: DateTime.now(),
      );
      await ref.read(reviewRepositoryProvider).add(review);
      ref.invalidate(productReviewsProvider(widget.productId));

      _commentCtrl.clear();
      _pickedFiles.clear();
      _rating = 5;
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Avaliação enviada!')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erro: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(productReviewsProvider(widget.productId));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Avaliações',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 12),

        // Estrelas
        Row(
          children: List.generate(5, (i) {
            return IconButton(
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(),
              icon: Icon(
                i < _rating ? Icons.star : Icons.star_border,
                color: Colors.amber,
              ),
              onPressed: () => setState(() => _rating = i + 1.0),
            );
          }),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _commentCtrl,
          maxLines: 3,
          decoration: InputDecoration(
            hintText: 'Escreva sua avaliação...',
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
            ),
          ),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            if (!LojaBackend.isRailway)
              TextButton.icon(
                onPressed: _pickMedia,
                icon: const Icon(Icons.photo_library_outlined),
                label: Text(
                  _pickedFiles.isEmpty
                      ? 'Foto/Vídeo'
                      : '${_pickedFiles.length} arquivo(s)',
                ),
              ),
            const Spacer(),
            ElevatedButton(
              onPressed: _sending ? null : _submit,
              style: ElevatedButton.styleFrom(
                backgroundColor: Theme.of(context).colorScheme.primary,
              ),
              child: _sending
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text('Enviar'),
            ),
          ],
        ),
        const Divider(height: 32),

        // Lista de avaliações
        async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Text(
            'Erro ao carregar avaliações.\n$e',
            style: const TextStyle(color: AppColors.error, fontSize: 13),
          ),
          data: (list) {
            if (list.isEmpty) {
              return const Text(
                'Nenhuma avaliação ainda. Seja o primeiro!',
                style: TextStyle(color: AppColors.textSecondary),
              );
            }
            return Column(
              children: list.map((r) {
                return Card(
                  margin: const EdgeInsets.only(bottom: 12),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            CircleAvatar(
                              radius: 16,
                              backgroundImage: r.userPhoto != null
                                  ? NetworkImage(r.userPhoto!)
                                  : null,
                              child: r.userPhoto == null
                                  ? Text(
                                      r.userName.isNotEmpty
                                          ? r.userName[0].toUpperCase()
                                          : '?',
                                    )
                                  : null,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                r.userName,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            Row(
                              children: List.generate(
                                5,
                                (i) => Icon(
                                  i < r.rating ? Icons.star : Icons.star_border,
                                  size: 14,
                                  color: Colors.amber,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(r.comment),
                        if (r.mediaUrls.isNotEmpty) ...[
                          const SizedBox(height: 8),
                          SizedBox(
                            height: 80,
                            child: ListView.separated(
                              scrollDirection: Axis.horizontal,
                              itemCount: r.mediaUrls.length,
                              separatorBuilder: (_, __) =>
                                  const SizedBox(width: 8),
                              itemBuilder: (_, i) {
                                final url = r.mediaUrls[i];
                                final isVideo = url.contains('/video/');
                                return ClipRRect(
                                  borderRadius: BorderRadius.circular(8),
                                  child: isVideo
                                      ? Container(
                                          width: 80,
                                          color: Colors.black87,
                                          child: const Icon(
                                            Icons.play_circle,
                                            color: Colors.white,
                                          ),
                                        )
                                      : CachedNetworkImage(
                                          imageUrl: url,
                                          width: 80,
                                          height: 80,
                                          fit: BoxFit.cover,
                                        ),
                                );
                              },
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                );
              }).toList(),
            );
          },
        ),
      ],
    );
  }
}

/// Medidas indicativas: não apresenta números inventados para a peça da loja.
class _SizeGuide extends StatelessWidget {
  const _SizeGuide({required this.guide});
  final String guide;
  @override
  Widget build(BuildContext context) => ExpansionTile(
        leading: Icon(Icons.straighten_outlined),
        title: Text('Guia de tamanhos e medidas'),
        children: [
          Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
              child: Text(guide.trim().isEmpty
                  ? 'A loja ainda não cadastrou as medidas desta peça. Pergunte pelo WhatsApp antes de comprar.'
                  : guide))
        ],
      );
}

class _ProductGallery extends StatefulWidget {
  const _ProductGallery({required this.images, required this.initial});
  final List<String> images;
  final int initial;
  @override
  State<_ProductGallery> createState() => _ProductGalleryState();
}

class _ProductGalleryState extends State<_ProductGallery> {
  late final PageController _controller;
  late int _current;
  @override
  void initState() {
    super.initState();
    _current = widget.initial;
    _controller = PageController(initialPage: widget.initial);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: Colors.black,
        appBar: AppBar(
            backgroundColor: Colors.black,
            foregroundColor: Colors.white,
            title: Text('${_current + 1} de ${widget.images.length}')),
        body: PageView.builder(
            controller: _controller,
            itemCount: widget.images.length,
            onPageChanged: (i) => setState(() => _current = i),
            itemBuilder: (ctx, i) => InteractiveViewer(
                minScale: 1,
                maxScale: 5,
                child: Center(
                    child: CachedNetworkImage(
                        imageUrl: widget.images[i],
                        fit: BoxFit.contain,
                        placeholder: (_, __) =>
                            const CircularProgressIndicator(),
                        errorWidget: (_, __, ___) => const Icon(
                            Icons.broken_image,
                            color: Colors.white))))),
      );
}
