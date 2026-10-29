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
import '../../../data/repositories/railway_store_profile_repository.dart';
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
  int currentImageIndex = 0;

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
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) =>
      _ProductGallery(images: images, initial: initial)));
  }

  Future<void> _shareProduct(Product product, NumberFormat currency) async {
    final text = '''
${product.name}
${currency.format(product.price)}

${product.description}

Confira na ${AppConstants.storeName}!
''';
    await SharePlus.instance.share(ShareParams(text: text, subject: product.name));
  }

  Future<void> _openWhatsApp(Product product) async {
    final msg = Uri.encodeComponent(
      'Olá! Tenho interesse no produto: ${product.name}',
    );
    var phone = AppConstants.whatsappNumber;
    if (LojaBackend.isRailway) {
      try {
        final data = await RailwayStoreProfileRepository().publicProfile();
        phone = (data['profile'] as Map?)?['supportPhone']?.toString() ?? '';
      } catch (_) { phone = ''; }
    }
    if (phone.isEmpty) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('WhatsApp ainda não configurado pela loja.')));
      return;
    }
    final normalizedPhone = phone.startsWith('55') ? phone : '55$phone';
    final uri = Uri.parse('https://wa.me/$normalizedPhone?text=$msg');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Não foi possível abrir o WhatsApp')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final asyncProducts = ref.watch(productsProvider);
    final remoteProduct = LojaBackend.isRailway
      ? ref.watch(railwayProductByIdProvider(widget.productId)) : null;
    final currency = NumberFormat.currency(locale: 'pt_BR', symbol: 'R\$');

    return asyncProducts.when(
      loading: () => Scaffold(
        appBar: AppBar(leading: const AppBackButton()),
        body: Center(child: CircularProgressIndicator()),
      ),
      error: (e, _) => Scaffold(
        appBar: AppBar(leading: const AppBackButton()),
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

        if (LojaBackend.isRailway) {
          if (remoteProduct?.isLoading == true) {
            return Scaffold(appBar:AppBar(leading: const AppBackButton()),body:const Center(child:CircularProgressIndicator()));
          }
          if (remoteProduct?.hasError == true) {
            return Scaffold(appBar:AppBar(leading: const AppBackButton()),body:Center(child:Text('Erro ao abrir produto: ${remoteProduct!.error}')));
          }
          product = remoteProduct?.valueOrNull ?? product;
        }
        if (product == null) {
          return Scaffold(
            appBar: AppBar(
              leading: const AppBackButton(fallbackLocation: '/'),
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

        // Prioriza uma combinação realmente disponível e mantém a quantidade
        // dentro do estoque apresentado pelo catálogo.
        final inStock = product.variants.where((variant) => variant.stock > 0).toList();
        if (selectedColor == null || !colors.contains(selectedColor)) {
          selectedColor = inStock.isNotEmpty
              ? inStock.first.color
              : (colors.isEmpty ? null : colors.first);
        }
        final validSizes = product.variants
            .where((variant) => variant.color == selectedColor && variant.stock > 0)
            .map((variant) => variant.size).toList();
        if (!validSizes.contains(selectedSize)) {
          selectedSize = validSizes.isEmpty ? null : validSizes.first;
        }
        final currentVariant =
            product.getVariant(selectedColor ?? '', selectedSize ?? '');
        final isAvailable = currentVariant != null && currentVariant.isAvailable;
        if (currentVariant != null && currentVariant.stock > 0 && quantity > currentVariant.stock) {
          quantity = currentVariant.stock;
        }

        final galleryImages = product.images;

        return Scaffold(
          backgroundColor: AppColors.background,
          body: Column(
            children: [
              Expanded(
                child: CustomScrollView(
                  slivers: [
                    SliverAppBar(
                      expandedHeight: MediaQuery.sizeOf(context).width >= 900 ? 470 : 340,
                      pinned: true,
                      backgroundColor: Colors.white,
                      leading: const AppBackButton(fallbackLocation: '/'),
                      actions: [
                        IconButton(
                          icon: const Icon(Icons.share_outlined),
                          tooltip: 'Compartilhar',
                          onPressed: () => _shareProduct(product!, currency),
                        ),
                      ],
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
                                return GestureDetector(
                                  onTap: () => _openGallery(galleryImages, index),
                                  child: CachedNetworkImage(
                                  imageUrl: url,
                                  fit: BoxFit.contain,
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
                                      color: AppColors.textLight,
                                    ),
                                  ),
                                ));
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
                                            ? Theme.of(context).colorScheme.primary
                                            : Colors.white.withValues(alpha: 0.6),
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
                      child: Center(
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 920),
                          child: Container(
                        color: Colors.white,
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
                            Row(
                              children: [
                                Text(
                                  currency.format(product.price),
                                  style: TextStyle(
                                    fontSize: 24,
                                    fontWeight: FontWeight.bold,
                                    color: Theme.of(context).colorScheme.primary,
                                  ),
                                ),
                                if (product.oldPrice != null && product.oldPrice! > product.price) ...[
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
                              style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
                            ),
                            const SizedBox(height: 22),

                            // ========== DESCRIÇÃO ==========
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
                              spacing: 10,
                              runSpacing: 10,
                              children: colors.map((color) {
                                final isSelected = selectedColor == color;
                                return GestureDetector(
                                  onTap: () {
                                    setState(() {
                                      selectedColor = color;
                                      quantity = 1;
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
                                          ? Theme.of(context).colorScheme.primary
                                          : Colors.white,
                                      borderRadius: BorderRadius.circular(10),
                                      border: Border.all(
                                        color: isSelected
                                            ? Theme.of(context).colorScheme.primary
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
                                          setState(() {
                                            selectedSize = size;
                                            quantity = 1;
                                          })
                                      : null,
                                  child: Container(
                                    width: 52,
                                    height: 52,
                                    alignment: Alignment.center,
                                    decoration: BoxDecoration(
                                      color: isSelected
                                          ? Theme.of(context).colorScheme.primary
                                          : hasStock
                                              ? Colors.white
                                              : AppColors.divider,
                                      borderRadius: BorderRadius.circular(10),
                                      border: Border.all(
                                        color: isSelected
                                            ? Theme.of(context).colorScheme.primary
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
                                          quantity < currentVariant.stock)
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
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Icon(Icons.local_shipping_outlined, color: Theme.of(context).colorScheme.primary),
                                      const SizedBox(width: 12),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: const [
                                            Text('Entrega e retirada',
                                                style: TextStyle(fontWeight: FontWeight.w700)),
                                            SizedBox(height: 4),
                                            Text('Escolha a modalidade e consulte valores reais de frete no checkout. A disponibilidade depende da loja.',
                                                style: TextStyle(color: AppColors.textSecondary)),
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
                                        borderRadius: BorderRadius.circular(10),
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
                                              product!.price * quantity,
                                            ),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: Theme.of(context).colorScheme.primary,
                                    ),
                                    child: _loadingShipping
                                        ? const SizedBox(
                                            width: 20,
                                            height: 20,
                                            child: CircularProgressIndicator(
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
                                  margin: const EdgeInsets.only(bottom: 8),
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    border: Border.all(color: AppColors.border),
                                    borderRadius: BorderRadius.circular(10),
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
                                              : Theme.of(context).colorScheme.primary,
                                        ),
                                      ),
                                    ],
                                  ),
                                );
                              }),
                            ],

                            ],

                            // ========== AVALIAÇÕES ==========
                            const SizedBox(height: 28),
                            _SizeGuide(guide:product.sizeGuide),
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
                                height: 260,
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

              // ========== BARRA INFERIOR ==========
              Container(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
                decoration: BoxDecoration(
                  color: Colors.white,
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.06),
                      blurRadius: 10,
                      offset: const Offset(0, -4),
                    ),
                  ],
                ),
                child: SafeArea(
                  child: Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 920),
                      child: Row(
                    children: [
                      // WhatsApp
                      IconButton(
                        style: IconButton.styleFrom(
                          backgroundColor:
                              const Color(0xFF25D366).withValues(alpha: 0.15),
                        ),
                        icon: const Icon(
                          Icons.chat,
                          color: Color(0xFF25D366),
                        ),
                        tooltip: 'WhatsApp',
                        onPressed: () => _openWhatsApp(product!),
                      ),
                      // Chat no app
                      IconButton(
                        style: IconButton.styleFrom(
                          backgroundColor: Theme.of(context).colorScheme.primary.withValues(alpha: 0.1),
                        ),
                        icon: Icon(
                          Icons.support_agent,
                          color: Theme.of(context).colorScheme.primary,
                        ),
                        tooltip: 'Chat com a loja',
                        onPressed: () => context.push('/chat'),
                      ),
                      const SizedBox(width: 4),
                      // Carrinho
                      Expanded(
                        child: SizedBox(
                          height: 48,
                          child: OutlinedButton(
                            onPressed: isAvailable
                                ? () {
                                    final before = ref.read(cartProvider).fold<int>(
                                        0, (total, item) => total + item.quantity);
                                    ref.read(cartProvider.notifier).addItem(
                                          product: product!,
                                          color: selectedColor!,
                                          size: selectedSize!,
                                          quantity: quantity,
                                        );

                                    final after = ref.read(cartProvider).fold<int>(
                                        0, (total, item) => total + item.quantity);
                                    if (after == before) {
                                      ScaffoldMessenger.of(context).showSnackBar(
                                        const SnackBar(content: Text('Você já adicionou o máximo disponível desta variante.')),
                                      );
                                      return;
                                    }

                                    final messenger =
                                        ScaffoldMessenger.of(context);
                                    messenger.clearSnackBars();

                                    messenger.showSnackBar(
                                      SnackBar(
                                        content: const Text(
                                          'Produto adicionado ao carrinho!',
                                        ),
                                        duration: const Duration(seconds: 2),
                                        backgroundColor: AppColors.success,
                                        behavior: SnackBarBehavior.floating,
                                        margin: const EdgeInsets.fromLTRB(
                                          16,
                                          0,
                                          16,
                                          90,
                                        ),
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

                                  }
                                : null,
                            child: const Text(
                              'Carrinho',
                              textAlign: TextAlign.center,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      // Comprar agora
                      Expanded(
                        child: SizedBox(
                          height: 48,
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
                              backgroundColor: Theme.of(context).colorScheme.primary,
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
            color: onTap != null ? Theme.of(context).colorScheme.primary : AppColors.textLight,
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
      if (!LojaBackend.isRailway) for (final f in _pickedFiles) {
        final lower = f.path.toLowerCase();
        final isVideo = lower.endsWith('.mp4') ||
            lower.endsWith('.mov') ||
            lower.endsWith('.avi');
        final url = isVideo
            ? await upload.uploadVideo(f, widget.productId)
            : await upload.uploadImage(f, widget.productId);
        urls.add(url);
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
            if (!LojaBackend.isRailway) TextButton.icon(
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
    children: [Padding(padding:const EdgeInsets.fromLTRB(16,4,16,16),child:Text(
      guide.trim().isEmpty
      ? 'A loja ainda não cadastrou as medidas desta peça. Pergunte pelo WhatsApp antes de comprar.'
      : guide))],
  );
}

class _ProductGallery extends StatefulWidget {
  const _ProductGallery({required this.images,required this.initial});
  final List<String> images;
  final int initial;
  @override
  State<_ProductGallery> createState()=>_ProductGalleryState();
}
class _ProductGalleryState extends State<_ProductGallery>{
  late final PageController _controller;
  late int _current;
  @override
  void initState(){super.initState();_current=widget.initial;_controller=PageController(initialPage:widget.initial);}
  @override
  void dispose(){_controller.dispose();super.dispose();}
  @override
  Widget build(BuildContext context)=>Scaffold(
    backgroundColor:Colors.black,
    appBar:AppBar(backgroundColor:Colors.black,foregroundColor:Colors.white,
      title:Text('${_current+1} de ${widget.images.length}')),
    body:PageView.builder(controller:_controller,itemCount:widget.images.length,
      onPageChanged:(i)=>setState(()=>_current=i),itemBuilder:(ctx,i)=>
        InteractiveViewer(minScale:1,maxScale:5,child:Center(child:
          CachedNetworkImage(imageUrl:widget.images[i],fit:BoxFit.contain,
            placeholder:(_,__)=>const CircularProgressIndicator(),
            errorWidget:(_,__,___)=>const Icon(Icons.broken_image,color:Colors.white))))),
  );
}
