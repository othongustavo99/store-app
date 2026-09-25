import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/app_colors.dart';
import '../../../models/product.dart';
import '../../../providers/product_providers.dart';

class AdminProductsScreen extends ConsumerStatefulWidget {
  const AdminProductsScreen({super.key});

  @override
  ConsumerState<AdminProductsScreen> createState() =>
      _AdminProductsScreenState();
}

class _AdminProductsScreenState extends ConsumerState<AdminProductsScreen> {
  final ImagePicker _picker = ImagePicker();

  // ------------------------------------------------------------
  // FILTROS
  // ------------------------------------------------------------

  String _statusFilter = 'todos';
  String _categoryFilter = 'todos';

  // ------------------------------------------------------------
  // CÂMERA / GALERIA / VÍDEO
  // ------------------------------------------------------------

  Future<XFile?> _takePhoto() async {
    return _picker.pickImage(
      source: ImageSource.camera,
      imageQuality: 85,
    );
  }

  Future<XFile?> _pickPhoto() async {
    return _picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 85,
    );
  }

  Future<List<XFile>> _pickMultiplePhotos() async {
    return _picker.pickMultiImage(
      imageQuality: 85,
    );
  }

  Future<XFile?> _pickVideo() async {
    return _picker.pickVideo(
      source: ImageSource.gallery,
    );
  }

  // ------------------------------------------------------------
  // BUILD
  // ------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final asyncProducts = ref.watch(productsProvider);

    final currency = NumberFormat.currency(
      locale: 'pt_BR',
      symbol: r'R$',
    );

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Produtos'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            tooltip: 'Adicionar produto',
            onPressed: () => _showAddProductDialog(
              context,
              ref,
            ),
          ),
        ],
      ),
      body: asyncProducts.when(
        loading: () => const Center(
          child: CircularProgressIndicator(),
        ),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Erro ao carregar produtos.\n$e',
              textAlign: TextAlign.center,
            ),
          ),
        ),
        data: (products) {
          if (products.isEmpty) {
            return _emptyProducts();
          }

          final filteredProducts = _filterProducts(products);

          return Column(
            children: [
              const SizedBox(height: 12),

              // ------------------------------------------------
              // PRIMEIRA ROW
              // TODOS / PROMOÇÃO / ESGOTADOS
              // ------------------------------------------------

              _statusFilters(),

              const SizedBox(height: 8),

              // ------------------------------------------------
              // SEGUNDA ROW
              // CATEGORIAS
              // ------------------------------------------------

              _categoryFilters(),

              const SizedBox(height: 12),

              Expanded(
                child: filteredProducts.isEmpty
                    ? const Center(
                        child: Text(
                          'Nenhum produto encontrado.',
                          style: TextStyle(
                            color: AppColors.textSecondary,
                          ),
                        ),
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(
                          16,
                          0,
                          16,
                          24,
                        ),
                        itemCount: filteredProducts.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 12),
                        itemBuilder: (context, index) {
                          final product = filteredProducts[index];

                          return _ProductTile(
                            product: product,
                            currency: currency,
                            onEdit: () => _showEditProductDialog(
                              context,
                              ref,
                              product,
                            ),
                            onDelete: () async {
                              await ref
                                  .read(
                                    productsActionsProvider,
                                  )
                                  .deleteProduct(
                                    product.id,
                                  );

                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                    content: Text(
                                      'Produto removido',
                                    ),
                                    backgroundColor: AppColors.success,
                                    behavior: SnackBarBehavior.floating,
                                  ),
                                );
                              }
                            },
                          );
                        },
                      ),
              ),
            ],
          );
        },
      ),
    );
  }

  // ------------------------------------------------------------
  // PRODUTOS VAZIOS
  // ------------------------------------------------------------

  Widget _emptyProducts() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 90,
              height: 90,
              decoration: BoxDecoration(
                color: AppColors.primary.withOpacity(0.08),
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.inventory_2_outlined,
                size: 42,
                color: AppColors.primary.withOpacity(0.6),
              ),
            ),
            const SizedBox(height: 20),
            const Text(
              'Nenhum produto cadastrado',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Toque no + para adicionar o\nprimeiro produto da loja',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: AppColors.textSecondary,
                height: 1.4,
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ------------------------------------------------------------
  // FILTROS
  // ------------------------------------------------------------

  List<Product> _filterProducts(
    List<Product> products,
  ) {
    var result = products;

    // -----------------------------
    // STATUS
    // -----------------------------

    if (_statusFilter == 'promocao') {
      result = result
          .where(
            (product) => product.oldPrice != null,
          )
          .toList();
    }

    if (_statusFilter == 'esgotados') {
      result = result
          .where(
            (product) => product.totalStock <= 0,
          )
          .toList();
    }

    // -----------------------------
    // CATEGORIA
    // -----------------------------

    if (_categoryFilter != 'todos') {
      result = result
          .where(
            (product) => product.categoryId == _categoryFilter,
          )
          .toList();
    }

    return result;
  }

  Widget _statusFilters() {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(
        horizontal: 16,
      ),
      child: Row(
        children: [
          _filterButton(
            label: 'Todos',
            value: 'todos',
          ),
          _filterButton(
            label: 'Em promoção',
            value: 'promocao',
          ),
          _filterButton(
            label: 'Esgotados',
            value: 'esgotados',
          ),
        ],
      ),
    );
  }

  Widget _categoryFilters() {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(
        horizontal: 16,
      ),
      child: Row(
        children: [
          _categoryButton(
            label: 'Todas',
            value: 'todos',
          ),
          _categoryButton(
            label: 'Camisetas',
            value: 'cat_camisetas',
          ),
          _categoryButton(
            label: 'Calças',
            value: 'cat_calcas',
          ),
          _categoryButton(
            label: 'Tênis',
            value: 'cat_tenis',
          ),
        ],
      ),
    );
  }

  Widget _filterButton({
    required String label,
    required String value,
  }) {
    final selected = _statusFilter == value;

    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ChoiceChip(
        label: Text(label),
        selected: selected,
        onSelected: (_) {
          setState(() {
            _statusFilter = value;
          });
        },
      ),
    );
  }

  Widget _categoryButton({
    required String label,
    required String value,
  }) {
    final selected = _categoryFilter == value;

    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ChoiceChip(
        label: Text(label),
        selected: selected,
        onSelected: (_) {
          setState(() {
            _categoryFilter = value;
          });
        },
      ),
    );
  }

  // ------------------------------------------------------------
  // ADICIONAR PRODUTO
  // ------------------------------------------------------------

  void _showAddProductDialog(
    BuildContext context,
    WidgetRef ref,
  ) {
    final nameController = TextEditingController();

    final descriptionController = TextEditingController();

    final priceController = TextEditingController();

    final stockController = TextEditingController(text: '10');

    String selectedCategory = 'cat_camisetas';

    final Set<String> selectedColors = {
      'Preto',
      'Branco',
    };

    File? mainImage;

    final List<File> additionalImages = [];

    final List<File> videos = [];

    showDialog(
      context: context,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (
            context,
            setDialogState,
          ) {
            return AlertDialog(
              title: const Text(
                'Adicionar produto',
              ),
              content: SizedBox(
                width: 500,
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // -------------------------
                      // NOME
                      // -------------------------

                      TextField(
                        controller: nameController,
                        decoration: const InputDecoration(
                          labelText: 'Nome do produto',
                          prefixIcon: Icon(
                            Icons.shopping_bag_outlined,
                          ),
                        ),
                      ),

                      const SizedBox(height: 12),

                      // -------------------------
                      // DESCRIÇÃO
                      // -------------------------

                      TextField(
                        controller: descriptionController,
                        maxLines: 5,
                        decoration: const InputDecoration(
                          labelText: 'Descrição',
                          hintText: 'Descreva o produto...',
                          alignLabelWithHint: true,
                          prefixIcon: Icon(
                            Icons.description_outlined,
                          ),
                        ),
                      ),

                      const SizedBox(height: 12),

                      // -------------------------
                      // CATEGORIA
                      // -------------------------

                      DropdownButtonFormField<String>(
                        value: selectedCategory,
                        decoration: const InputDecoration(
                          labelText: 'Categoria',
                          prefixIcon: Icon(
                            Icons.category_outlined,
                          ),
                        ),
                        items: const [
                          DropdownMenuItem(
                            value: 'cat_camisetas',
                            child: Text('Camisetas'),
                          ),
                          DropdownMenuItem(
                            value: 'cat_calcas',
                            child: Text('Calças'),
                          ),
                          DropdownMenuItem(
                            value: 'cat_tenis',
                            child: Text('Tênis'),
                          ),
                        ],
                        onChanged: (value) {
                          if (value == null) {
                            return;
                          }

                          setDialogState(() {
                            selectedCategory = value;
                          });
                        },
                      ),

                      const SizedBox(height: 12),

                      // -------------------------
                      // PREÇO
                      // -------------------------

                      TextField(
                        controller: priceController,
                        decoration: const InputDecoration(
                          labelText: 'Preço (ex: 99.90)',
                          prefixIcon: Icon(
                            Icons.attach_money,
                          ),
                        ),
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                      ),

                      const SizedBox(height: 12),

                      // -------------------------
                      // ESTOQUE
                      // -------------------------

                      TextField(
                        controller: stockController,
                        decoration: const InputDecoration(
                          labelText: 'Estoque inicial',
                          prefixIcon: Icon(
                            Icons.inventory_2_outlined,
                          ),
                        ),
                        keyboardType: TextInputType.number,
                      ),

                      const SizedBox(height: 20),

                      // -------------------------
                      // CORES
                      // -------------------------

                      const Text(
                        'Cores disponíveis',
                        style: TextStyle(
                          fontWeight: FontWeight.w600,
                        ),
                      ),

                      const SizedBox(height: 8),

                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          'Preto',
                          'Branco',
                          'Azul',
                          'Vermelho',
                          'Verde',
                          'Amarelo',
                          'Cinza',
                          'Rosa',
                        ].map(
                          (color) {
                            return FilterChip(
                              label: Text(color),
                              selected: selectedColors.contains(
                                color,
                              ),
                              onSelected: (value) {
                                setDialogState(() {
                                  if (value) {
                                    selectedColors.add(color);
                                  } else {
                                    selectedColors.remove(color);
                                  }
                                });
                              },
                            );
                          },
                        ).toList(),
                      ),

                      const SizedBox(height: 20),

                      // -------------------------
                      // FOTOS
                      // -------------------------

                      const Text(
                        'Fotos do produto',
                        style: TextStyle(
                          fontWeight: FontWeight.w600,
                        ),
                      ),

                      const SizedBox(height: 8),

                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          OutlinedButton.icon(
                            icon: const Icon(
                              Icons.camera_alt_outlined,
                            ),
                            label: const Text(
                              'Tirar foto',
                            ),
                            onPressed: () async {
                              final file = await _takePhoto();

                              if (file == null) {
                                return;
                              }

                              setDialogState(() {
                                mainImage = File(file.path);
                              });
                            },
                          ),
                          OutlinedButton.icon(
                            icon: const Icon(
                              Icons.photo_library_outlined,
                            ),
                            label: const Text(
                              'Galeria',
                            ),
                            onPressed: () async {
                              final file = await _pickPhoto();

                              if (file == null) {
                                return;
                              }

                              setDialogState(() {
                                mainImage = File(file.path);
                              });
                            },
                          ),
                          OutlinedButton.icon(
                            icon: const Icon(
                              Icons.collections_outlined,
                            ),
                            label: const Text(
                              'Mais imagens',
                            ),
                            onPressed: () async {
                              final files = await _pickMultiplePhotos();

                              if (files.isEmpty) {
                                return;
                              }

                              setDialogState(() {
                                additionalImages.addAll(
                                  files.map(
                                    (file) => File(file.path),
                                  ),
                                );
                              });
                            },
                          ),
                        ],
                      ),

                      const SizedBox(height: 12),

                      if (mainImage != null)
                        ClipRRect(
                          borderRadius: BorderRadius.circular(
                            12,
                          ),
                          child: Image.file(
                            mainImage!,
                            width: double.infinity,
                            height: 180,
                            fit: BoxFit.cover,
                          ),
                        ),

                      if (additionalImages.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        SizedBox(
                          height: 80,
                          child: ListView.separated(
                            scrollDirection: Axis.horizontal,
                            itemCount: additionalImages.length,
                            separatorBuilder: (_, __) => const SizedBox(
                              width: 8,
                            ),
                            itemBuilder: (_, index) {
                              return ClipRRect(
                                borderRadius: BorderRadius.circular(
                                  8,
                                ),
                                child: Image.file(
                                  additionalImages[index],
                                  width: 80,
                                  height: 80,
                                  fit: BoxFit.cover,
                                ),
                              );
                            },
                          ),
                        ),
                      ],

                      const SizedBox(height: 20),

                      // -------------------------
                      // VÍDEO
                      // -------------------------

                      const Text(
                        'Vídeo demonstrativo',
                        style: TextStyle(
                          fontWeight: FontWeight.w600,
                        ),
                      ),

                      const SizedBox(height: 8),

                      OutlinedButton.icon(
                        icon: const Icon(
                          Icons.video_library_outlined,
                        ),
                        label: const Text(
                          'Escolher vídeo',
                        ),
                        onPressed: () async {
                          final file = await _pickVideo();

                          if (file == null) {
                            return;
                          }

                          setDialogState(() {
                            videos.add(
                              File(file.path),
                            );
                          });
                        },
                      ),

                      if (videos.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(
                            top: 8,
                          ),
                          child: Text(
                            '${videos.length} vídeo(s) selecionado(s)',
                            style: const TextStyle(
                              color: AppColors.textSecondary,
                            ),
                          ),
                        ),

                      const SizedBox(height: 8),

                      const Text(
                        'As fotos e vídeos selecionados '
                        'ficarão prontos para o upload no '
                        'Firebase Storage na próxima etapa.',
                        style: TextStyle(
                          fontSize: 12,
                          color: AppColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () {
                    Navigator.pop(
                      dialogContext,
                    );
                  },
                  child: const Text('Cancelar'),
                ),
                ElevatedButton(
                  onPressed: () async {
                    final name = nameController.text.trim();

                    final description = descriptionController.text.trim();

                    final price = double.tryParse(
                          priceController.text.replaceAll(
                            ',',
                            '.',
                          ),
                        ) ??
                        0;

                    final stock = int.tryParse(
                          stockController.text,
                        ) ??
                        10;

                    if (name.isEmpty) {
                      _showError(
                        context,
                        'Informe o nome do produto.',
                      );
                      return;
                    }

                    if (description.isEmpty) {
                      _showError(
                        context,
                        'Informe a descrição do produto.',
                      );
                      return;
                    }

                    if (price <= 0) {
                      _showError(
                        context,
                        'Informe um preço válido.',
                      );
                      return;
                    }

                    if (selectedColors.isEmpty) {
                      _showError(
                        context,
                        'Selecione pelo menos uma cor.',
                      );
                      return;
                    }

                    // --------------------------------
                    // POR ENQUANTO:
                    // A imagem do produto ainda precisa
                    // ser enviada para o Firebase Storage.
                    //
                    // Não vamos salvar File local no
                    // Firestore.
                    // --------------------------------

                    final newProduct = Product(
                      id: '',
                      name: name,
                      description: description,
                      price: price,
                      categoryId: selectedCategory,

                      // TEMPORÁRIO:
                      // até implementarmos o upload
                      // para Firebase Storage.
                      images: const [],

                      variants: selectedColors.map(
                        (color) {
                          return ProductVariant(
                            color: color,
                            size: 'M',
                            stock: stock,
                          );
                        },
                      ).toList(),

                      isFeatured: false,
                      isNew: true,
                      createdAt: DateTime.now(),
                    );

                    await ref
                        .read(
                          productsActionsProvider,
                        )
                        .addProduct(
                          newProduct,
                        );

                    if (dialogContext.mounted) {
                      Navigator.pop(
                        dialogContext,
                      );
                    }

                    if (context.mounted) {
                      ScaffoldMessenger.of(
                        context,
                      ).showSnackBar(
                        const SnackBar(
                          content: Text(
                            'Produto adicionado!',
                          ),
                          backgroundColor: AppColors.success,
                          behavior: SnackBarBehavior.floating,
                        ),
                      );
                    }
                  },
                  child: const Text('Adicionar'),
                ),
              ],
            );
          },
        );
      },
    );
  }

  // ------------------------------------------------------------
  // EDITAR PRODUTO
  // ------------------------------------------------------------

  void _showEditProductDialog(
    BuildContext context,
    WidgetRef ref,
    Product product,
  ) {
    final priceController = TextEditingController(
      text: product.price.toStringAsFixed(2),
    );

    final hasDiscount = product.oldPrice != null;

    final currentDiscountPercent = hasDiscount
        ? (((product.oldPrice! - product.price) / product.oldPrice!) * 100)
            .round()
        : 0;

    final discountController = TextEditingController(
      text: hasDiscount ? '$currentDiscountPercent' : '',
    );

    final stockControllers = {
      for (final v in product.variants)
        '${v.color}|${v.size}': TextEditingController(
          text: '${v.stock}',
        ),
    };

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(24),
        ),
      ),
      builder: (context) {
        return Padding(
          padding: EdgeInsets.fromLTRB(
            20,
            16,
            20,
            20 + MediaQuery.of(context).viewInsets.bottom,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: Colors.grey.shade300,
                      borderRadius: BorderRadius.circular(
                        2,
                      ),
                    ),
                  ),
                ),
                const SizedBox(
                  height: 16,
                ),
                Text(
                  product.name,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Editar preço, desconto e estoque',
                  style: TextStyle(
                    color: AppColors.textSecondary,
                  ),
                ),
                const SizedBox(
                  height: 20,
                ),
                TextField(
                  controller: priceController,
                  decoration: const InputDecoration(
                    labelText: r'Preço (R$)',
                    prefixIcon: Icon(
                      Icons.attach_money,
                    ),
                  ),
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                ),
                const SizedBox(
                  height: 20,
                ),
                const Text(
                  'Desconto',
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(
                  height: 8,
                ),
                if (hasDiscount)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    margin: const EdgeInsets.only(
                      bottom: 12,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.secondary.withOpacity(
                        0.08,
                      ),
                      borderRadius: BorderRadius.circular(
                        12,
                      ),
                      border: Border.all(
                        color: AppColors.secondary.withOpacity(
                          0.3,
                        ),
                      ),
                    ),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.local_offer,
                          color: AppColors.secondary,
                          size: 20,
                        ),
                        const SizedBox(
                          width: 8,
                        ),
                        Expanded(
                          child: Text(
                            'Desconto ativo: '
                            '$currentDiscountPercent% off\n'
                            'De R\$ '
                            '${product.oldPrice!.toStringAsFixed(2)} '
                            'por R\$ '
                            '${product.price.toStringAsFixed(2)}',
                            style: const TextStyle(
                              fontSize: 13,
                              color: AppColors.textPrimary,
                              height: 1.3,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: discountController,
                        decoration: const InputDecoration(
                          labelText: 'Desconto %',
                          hintText: 'Ex: 20',
                          suffixText: '%',
                          isDense: true,
                        ),
                        keyboardType: TextInputType.number,
                      ),
                    ),
                    const SizedBox(
                      width: 10,
                    ),
                    ElevatedButton(
                      onPressed: () async {
                        final percent = double.tryParse(
                              discountController.text.replaceAll(
                                ',',
                                '.',
                              ),
                            ) ??
                            0;

                        if (percent <= 0 || percent >= 100) {
                          ScaffoldMessenger.of(
                            context,
                          ).showSnackBar(
                            const SnackBar(
                              content: Text(
                                'Informe um desconto entre 1 e 99%',
                              ),
                              backgroundColor: AppColors.error,
                              behavior: SnackBarBehavior.floating,
                            ),
                          );

                          return;
                        }

                        final ok = await ref
                            .read(
                              productsActionsProvider,
                            )
                            .applyDiscount(
                              product.id,
                              percent,
                            );

                        if (context.mounted) {
                          Navigator.pop(
                            context,
                          );

                          ScaffoldMessenger.of(
                            context,
                          ).showSnackBar(
                            SnackBar(
                              content: Text(
                                ok
                                    ? 'Desconto de ${percent.round()}% aplicado!'
                                    : 'Não foi possível aplicar o desconto',
                              ),
                              backgroundColor:
                                  ok ? AppColors.success : AppColors.error,
                              behavior: SnackBarBehavior.floating,
                            ),
                          );
                        }
                      },
                      child: const Text(
                        'Aplicar',
                      ),
                    ),
                  ],
                ),
                if (hasDiscount) ...[
                  const SizedBox(
                    height: 8,
                  ),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: () async {
                        await ref
                            .read(
                              productsActionsProvider,
                            )
                            .removeDiscount(
                              product.id,
                            );

                        if (context.mounted) {
                          Navigator.pop(
                            context,
                          );

                          ScaffoldMessenger.of(
                            context,
                          ).showSnackBar(
                            const SnackBar(
                              content: Text(
                                'Desconto removido',
                              ),
                              backgroundColor: AppColors.success,
                              behavior: SnackBarBehavior.floating,
                            ),
                          );
                        }
                      },
                      icon: const Icon(
                        Icons.close,
                        size: 18,
                      ),
                      label: const Text(
                        'Remover desconto',
                      ),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.error,
                      ),
                    ),
                  ),
                ],
                const SizedBox(
                  height: 20,
                ),
                const Text(
                  'Estoque por variação',
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(
                  height: 12,
                ),
                ...product.variants.map(
                  (v) {
                    final key = '${v.color}|${v.size}';

                    return Padding(
                      padding: const EdgeInsets.only(
                        bottom: 10,
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              '${v.color} • ${v.size}',
                              style: const TextStyle(
                                fontSize: 14,
                              ),
                            ),
                          ),
                          SizedBox(
                            width: 90,
                            child: TextField(
                              controller: stockControllers[key],
                              textAlign: TextAlign.center,
                              decoration: const InputDecoration(
                                labelText: 'Qtd',
                                isDense: true,
                              ),
                              keyboardType: TextInputType.number,
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
                const SizedBox(
                  height: 20,
                ),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton(
                    onPressed: () async {
                      final newPrice = double.tryParse(
                            priceController.text.replaceAll(
                              ',',
                              '.',
                            ),
                          ) ??
                          product.price;

                      final actions = ref.read(
                        productsActionsProvider,
                      );

                      await actions.updatePrice(
                        product.id,
                        newPrice,
                      );

                      for (final v in product.variants) {
                        final key = '${v.color}|${v.size}';

                        final stock = int.tryParse(
                              stockControllers[key]?.text ?? '',
                            ) ??
                            v.stock;

                        await actions.updateVariantStock(
                          product.id,
                          v.color,
                          v.size,
                          stock,
                        );
                      }

                      if (context.mounted) {
                        Navigator.pop(
                          context,
                        );

                        ScaffoldMessenger.of(
                          context,
                        ).showSnackBar(
                          const SnackBar(
                            content: Text(
                              'Produto atualizado!',
                            ),
                            backgroundColor: AppColors.success,
                            behavior: SnackBarBehavior.floating,
                          ),
                        );
                      }
                    },
                    child: const Text(
                      'Salvar alterações',
                    ),
                  ),
                ),
                const SizedBox(
                  height: 8,
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  // ------------------------------------------------------------
  // ERRO
  // ------------------------------------------------------------

  void _showError(
    BuildContext context,
    String message,
  ) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: AppColors.error,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }
}

// =================================================================
// PRODUTO NA LISTA
// =================================================================

class _ProductTile extends StatelessWidget {
  final Product product;
  final NumberFormat currency;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  const _ProductTile({
    required this.product,
    required this.currency,
    required this.onEdit,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: AppColors.border,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: CachedNetworkImage(
                imageUrl: product.images.isNotEmpty ? product.images.first : '',
                width: 70,
                height: 70,
                fit: BoxFit.cover,
                errorWidget: (_, __, ___) => Container(
                  width: 70,
                  height: 70,
                  color: AppColors.divider,
                  child: const Icon(
                    Icons.image,
                  ),
                ),
              ),
            ),
            const SizedBox(
              width: 12,
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    product.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(
                    height: 4,
                  ),
                  Text(
                    currency.format(
                      product.price,
                    ),
                    style: const TextStyle(
                      color: AppColors.primary,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(
                    height: 2,
                  ),
                  Text(
                    'Estoque: '
                    '${product.totalStock}',
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
            IconButton(
              icon: const Icon(
                Icons.edit_outlined,
              ),
              tooltip: 'Editar',
              onPressed: onEdit,
            ),
            IconButton(
              icon: const Icon(
                Icons.delete_outline,
                color: AppColors.error,
              ),
              tooltip: 'Remover',
              onPressed: onDelete,
            ),
          ],
        ),
      ),
    );
  }
}
