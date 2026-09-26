import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:uuid/uuid.dart';

import '../../../core/theme/app_colors.dart';
import '../../../data/services/media_upload_service.dart';
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
  final MediaUploadService _media = MediaUploadService();
  final _uuid = const Uuid();

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

  void _showEditMediaDialog(
    BuildContext context,
    WidgetRef ref,
    Product product,
  ) {
    File? newMainImage;
    final List<File> newGalleryImages = [];
    final List<File> newVideos = [];
    bool isSaving = false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setState) {
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
                    Text(
                      'Mídia – ${product.name}',
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Imagens atuais
                    if (product.images.isNotEmpty) ...[
                      const Text('Imagens atuais:',
                          style: TextStyle(fontWeight: FontWeight.w600)),
                      const SizedBox(height: 8),
                      SizedBox(
                        height: 80,
                        child: ListView.separated(
                          scrollDirection: Axis.horizontal,
                          itemCount: product.images.length,
                          separatorBuilder: (_, __) => const SizedBox(width: 8),
                          itemBuilder: (_, i) => ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: CachedNetworkImage(
                              imageUrl: product.images[i],
                              width: 80,
                              height: 80,
                              fit: BoxFit.cover,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                    ],

                    // Botões de nova mídia
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: () async {
                              final file = await _takePhoto();
                              if (file != null) {
                                setState(() => newMainImage = File(file.path));
                              }
                            },
                            icon: const Icon(Icons.camera_alt),
                            label: const Text('Câmera'),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: () async {
                              final file = await _pickPhoto();
                              if (file != null) {
                                setState(() =>
                                    newGalleryImages.add(File(file.path)));
                              }
                            },
                            icon: const Icon(Icons.photo_library),
                            label: const Text('Galeria'),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed: () async {
                        final file = await _pickVideo();
                        if (file != null) {
                          setState(() => newVideos.add(File(file.path)));
                        }
                      },
                      icon: const Icon(Icons.videocam),
                      label: Text('Adicionar vídeo (${newVideos.length})'),
                    ),

                    if (newMainImage != null || newGalleryImages.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: Text(
                          '${(newMainImage != null ? 1 : 0) + newGalleryImages.length} nova(s) imagem(ns)',
                          style: const TextStyle(color: AppColors.success),
                        ),
                      ),

                    const SizedBox(height: 20),
                    SizedBox(
                      width: double.infinity,
                      height: 48,
                      child: ElevatedButton(
                        onPressed: isSaving
                            ? null
                            : () async {
                                setState(() => isSaving = true);
                                try {
                                  final List<String> imageUrls =
                                      List.from(product.images);
                                  final List<String> videoUrls =
                                      List.from(product.videos);

                                  if (newMainImage != null) {
                                    final url = await _media.uploadImage(
                                      newMainImage!,
                                      product.id,
                                    );
                                    imageUrls.insert(
                                        0, url); // vira a principal
                                  }
                                  for (final f in newGalleryImages) {
                                    final url =
                                        await _media.uploadImage(f, product.id);
                                    imageUrls.add(url);
                                  }
                                  for (final f in newVideos) {
                                    final url =
                                        await _media.uploadVideo(f, product.id);
                                    videoUrls.add(url);
                                  }

                                  await ref
                                      .read(productsActionsProvider)
                                      .updateProduct(
                                        product.copyWith(
                                          images: imageUrls,
                                          videos: videoUrls,
                                        ),
                                      );

                                  if (context.mounted) {
                                    Navigator.pop(context);
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      const SnackBar(
                                        content: Text('Mídia atualizada!'),
                                        backgroundColor: AppColors.success,
                                      ),
                                    );
                                  }
                                } catch (e) {
                                  setState(() => isSaving = false);
                                  _showError(
                                      context, 'Erro ao atualizar mídia: $e');
                                }
                              },
                        child: isSaving
                            ? const SizedBox(
                                width: 22,
                                height: 22,
                                child:
                                    CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Text('Salvar mídia'),
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  Future<XFile?> _pickPhoto() async {
    return _picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 85,
    );
  }

  Future<List<XFile>> _pickMultiplePhotos() async {
    return _picker.pickMultiImage(imageQuality: 85);
  }

  Future<XFile?> _pickVideo() async {
    return _picker.pickVideo(source: ImageSource.gallery);
  }

  // ------------------------------------------------------------
  // BUILD
  // ------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final asyncProducts = ref.watch(productsProvider);
    final currency = NumberFormat.currency(locale: 'pt_BR', symbol: r'R$');

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
            onPressed: () => _showAddProductDialog(context, ref),
          ),
        ],
      ),
      body: asyncProducts.when(
        loading: () => const Center(child: CircularProgressIndicator()),
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
          if (products.isEmpty) return _emptyProducts();

          final filteredProducts = _filterProducts(products);

          return Column(
            children: [
              const SizedBox(height: 12),
              _statusFilters(),
              const SizedBox(height: 8),
              _categoryFilters(),
              const SizedBox(height: 12),
              Expanded(
                child: filteredProducts.isEmpty
                    ? const Center(
                        child: Text(
                          'Nenhum produto encontrado.',
                          style: TextStyle(color: AppColors.textSecondary),
                        ),
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
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
                            onEditMedia: () =>
                                _showEditMediaDialog(context, ref, product),
                            onDelete: () async {
                              await ref
                                  .read(productsActionsProvider)
                                  .deleteProduct(product.id);
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                    content: Text('Produto removido'),
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

  Widget _emptyProducts() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.inventory_2_outlined,
              size: 64, color: AppColors.textLight),
          const SizedBox(height: 16),
          const Text(
            'Nenhum produto cadastrado',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: AppColors.textSecondary,
            ),
          ),
          const SizedBox(height: 8),
          ElevatedButton.icon(
            onPressed: () => _showAddProductDialog(context, ref),
            icon: const Icon(Icons.add),
            label: const Text('Adicionar produto'),
          ),
        ],
      ),
    );
  }

  List<Product> _filterProducts(List<Product> products) {
    var list = products;

    if (_statusFilter == 'promocao') {
      list = list.where((p) => p.oldPrice != null).toList();
    } else if (_statusFilter == 'esgotados') {
      list = list.where((p) => !p.isAvailable).toList();
    }

    if (_categoryFilter != 'todos') {
      list = list.where((p) => p.categoryId == _categoryFilter).toList();
    }

    return list;
  }

  Widget _statusFilters() {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          _filterButton(label: 'Todos', value: 'todos'),
          _filterButton(label: 'Em promoção', value: 'promocao'),
          _filterButton(label: 'Esgotados', value: 'esgotados'),
        ],
      ),
    );
  }

  Widget _categoryFilters() {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          _categoryButton(label: 'Todas', value: 'todos'),
          _categoryButton(label: 'Camisetas', value: 'cat_camisetas'),
          _categoryButton(label: 'Calças', value: 'cat_calcas'),
          _categoryButton(label: 'Tênis', value: 'cat_tenis'),
        ],
      ),
    );
  }

  Widget _filterButton({required String label, required String value}) {
    final selected = _statusFilter == value;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ChoiceChip(
        label: Text(label),
        selected: selected,
        onSelected: (_) => setState(() => _statusFilter = value),
      ),
    );
  }

  Widget _categoryButton({required String label, required String value}) {
    final selected = _categoryFilter == value;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ChoiceChip(
        label: Text(label),
        selected: selected,
        onSelected: (_) => setState(() => _categoryFilter = value),
      ),
    );
  }

  // ------------------------------------------------------------
  // ADICIONAR PRODUTO
  // ------------------------------------------------------------

  void _showAddProductDialog(BuildContext context, WidgetRef ref) {
    final nameController = TextEditingController();
    final descriptionController = TextEditingController();
    final priceController = TextEditingController();
    final stockController = TextEditingController(text: '10');
    final newCategoryController = TextEditingController();

    String selectedCategory = 'cat_camisetas';
    bool showNewCategoryField = false;
    bool isSaving = false;

    final Set<String> selectedColors = {'Preto', 'Branco'};
    File? mainImage;
    final List<File> galleryImages = [];
    final List<File> videos = [];

    final List<Map<String, String>> categories = [
      {'id': 'cat_camisetas', 'name': 'Camisetas'},
      {'id': 'cat_calcas', 'name': 'Calças'},
      {'id': 'cat_tenis', 'name': 'Tênis'},
    ];

    const availableColors = [
      'Preto',
      'Branco',
      'Azul',
      'Vermelho',
      'Verde',
      'Cinza',
      'Bege',
      'Rosa',
    ];

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title: const Text('Adicionar produto'),
              content: SizedBox(
                width: 500,
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      TextField(
                        controller: nameController,
                        decoration: const InputDecoration(
                          labelText: 'Nome do produto',
                          prefixIcon: Icon(Icons.shopping_bag_outlined),
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: descriptionController,
                        maxLines: 4,
                        decoration: const InputDecoration(
                          labelText: 'Descrição',
                          hintText: 'Descreva o produto...',
                          alignLabelWithHint: true,
                          prefixIcon: Icon(Icons.description_outlined),
                        ),
                      ),
                      const SizedBox(height: 12),

                      // CATEGORIA
                      if (!showNewCategoryField)
                        DropdownButtonFormField<String>(
                          value: selectedCategory,
                          decoration: const InputDecoration(
                            labelText: 'Categoria',
                            prefixIcon: Icon(Icons.category_outlined),
                          ),
                          items: [
                            ...categories.map(
                              (c) => DropdownMenuItem(
                                value: c['id'],
                                child: Text(c['name']!),
                              ),
                            ),
                            const DropdownMenuItem(
                              value: '__nova__',
                              child: Text('+ Nova categoria'),
                            ),
                          ],
                          onChanged: (value) {
                            if (value == null) return;
                            if (value == '__nova__') {
                              setDialogState(() => showNewCategoryField = true);
                            } else {
                              setDialogState(() => selectedCategory = value);
                            }
                          },
                        )
                      else
                        Row(
                          children: [
                            Expanded(
                              child: TextField(
                                controller: newCategoryController,
                                decoration: const InputDecoration(
                                  labelText: 'Nome da nova categoria',
                                  prefixIcon: Icon(Icons.add),
                                ),
                                textCapitalization:
                                    TextCapitalization.sentences,
                              ),
                            ),
                            IconButton(
                              icon: const Icon(Icons.check,
                                  color: AppColors.success),
                              onPressed: () {
                                final name = newCategoryController.text.trim();
                                if (name.isEmpty) return;
                                final id =
                                    'cat_${name.toLowerCase().replaceAll(RegExp(r'\s+'), "_")}';
                                setDialogState(() {
                                  categories.add({'id': id, 'name': name});
                                  selectedCategory = id;
                                  showNewCategoryField = false;
                                  newCategoryController.clear();
                                });
                              },
                            ),
                            IconButton(
                              icon: const Icon(Icons.close,
                                  color: AppColors.error),
                              onPressed: () {
                                setDialogState(() {
                                  showNewCategoryField = false;
                                  newCategoryController.clear();
                                });
                              },
                            ),
                          ],
                        ),

                      const SizedBox(height: 12),
                      TextField(
                        controller: priceController,
                        decoration: const InputDecoration(
                          labelText: 'Preço (ex: 99.90)',
                          prefixIcon: Icon(Icons.attach_money),
                        ),
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: stockController,
                        decoration: const InputDecoration(
                          labelText: 'Estoque inicial',
                          prefixIcon: Icon(Icons.inventory_2_outlined),
                        ),
                        keyboardType: TextInputType.number,
                      ),
                      const SizedBox(height: 16),

                      // CORES
                      const Text(
                        'Cores disponíveis',
                        style: TextStyle(fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: availableColors.map((color) {
                          final selected = selectedColors.contains(color);
                          return FilterChip(
                            label: Text(color),
                            selected: selected,
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
                        }).toList(),
                      ),
                      const SizedBox(height: 20),

                      // FOTO PRINCIPAL
                      const Text(
                        'Foto principal (aparece no card)',
                        style: TextStyle(fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'Imagem que o cliente vê na listagem.',
                        style: TextStyle(
                          fontSize: 12,
                          color: AppColors.textSecondary,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          OutlinedButton.icon(
                            icon: const Icon(Icons.camera_alt_outlined),
                            label: const Text('Câmera'),
                            onPressed: isSaving
                                ? null
                                : () async {
                                    final file = await _takePhoto();
                                    if (file == null) return;
                                    setDialogState(
                                      () => mainImage = File(file.path),
                                    );
                                  },
                          ),
                          const SizedBox(width: 8),
                          OutlinedButton.icon(
                            icon: const Icon(Icons.photo_library_outlined),
                            label: const Text('Galeria'),
                            onPressed: isSaving
                                ? null
                                : () async {
                                    final file = await _pickPhoto();
                                    if (file == null) return;
                                    setDialogState(
                                      () => mainImage = File(file.path),
                                    );
                                  },
                          ),
                        ],
                      ),
                      if (mainImage != null) ...[
                        const SizedBox(height: 8),
                        Stack(
                          children: [
                            ClipRRect(
                              borderRadius: BorderRadius.circular(8),
                              child: Image.file(
                                mainImage!,
                                width: 100,
                                height: 100,
                                fit: BoxFit.cover,
                              ),
                            ),
                            Positioned(
                              top: 0,
                              right: 0,
                              child: IconButton(
                                icon: const Icon(Icons.close,
                                    color: Colors.white, size: 18),
                                style: IconButton.styleFrom(
                                  backgroundColor: Colors.black54,
                                  padding: const EdgeInsets.all(4),
                                ),
                                onPressed: isSaving
                                    ? null
                                    : () => setDialogState(
                                          () => mainImage = null,
                                        ),
                              ),
                            ),
                          ],
                        ),
                      ],
                      const SizedBox(height: 20),

                      // GALERIA
                      const Text(
                        'Fotos da galeria (tela de detalhes)',
                        style: TextStyle(fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'O cliente desliza entre essas fotos no detalhe.',
                        style: TextStyle(
                          fontSize: 12,
                          color: AppColors.textSecondary,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          OutlinedButton.icon(
                            icon: const Icon(Icons.camera_alt_outlined),
                            label: const Text('Tirar foto'),
                            onPressed: isSaving
                                ? null
                                : () async {
                                    final file = await _takePhoto();
                                    if (file == null) return;
                                    setDialogState(
                                      () => galleryImages.add(File(file.path)),
                                    );
                                  },
                          ),
                          OutlinedButton.icon(
                            icon: const Icon(Icons.collections_outlined),
                            label: const Text('Várias fotos'),
                            onPressed: isSaving
                                ? null
                                : () async {
                                    final files = await _pickMultiplePhotos();
                                    if (files.isEmpty) return;
                                    setDialogState(() {
                                      galleryImages.addAll(
                                        files.map((f) => File(f.path)),
                                      );
                                    });
                                  },
                          ),
                        ],
                      ),
                      if (galleryImages.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        SizedBox(
                          height: 80,
                          child: ListView.separated(
                            scrollDirection: Axis.horizontal,
                            itemCount: galleryImages.length,
                            separatorBuilder: (_, __) =>
                                const SizedBox(width: 8),
                            itemBuilder: (_, index) {
                              return Stack(
                                children: [
                                  ClipRRect(
                                    borderRadius: BorderRadius.circular(8),
                                    child: Image.file(
                                      galleryImages[index],
                                      width: 80,
                                      height: 80,
                                      fit: BoxFit.cover,
                                    ),
                                  ),
                                  Positioned(
                                    top: 0,
                                    right: 0,
                                    child: GestureDetector(
                                      onTap: isSaving
                                          ? null
                                          : () {
                                              setDialogState(() {
                                                galleryImages.removeAt(index);
                                              });
                                            },
                                      child: Container(
                                        decoration: const BoxDecoration(
                                          color: Colors.black54,
                                          shape: BoxShape.circle,
                                        ),
                                        padding: const EdgeInsets.all(2),
                                        child: const Icon(
                                          Icons.close,
                                          size: 14,
                                          color: Colors.white,
                                        ),
                                      ),
                                    ),
                                  ),
                                ],
                              );
                            },
                          ),
                        ),
                      ],
                      const SizedBox(height: 20),

                      // VÍDEO
                      const Text(
                        'Vídeo demonstrativo (opcional)',
                        style: TextStyle(fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 8),
                      OutlinedButton.icon(
                        icon: const Icon(Icons.video_library_outlined),
                        label: const Text('Escolher vídeo'),
                        onPressed: isSaving
                            ? null
                            : () async {
                                final file = await _pickVideo();
                                if (file == null) return;
                                setDialogState(
                                  () => videos.add(File(file.path)),
                                );
                              },
                      ),
                      if (videos.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Text(
                            '${videos.length} vídeo(s) selecionado(s)',
                            style: const TextStyle(
                              color: AppColors.textSecondary,
                            ),
                          ),
                        ),
                      if (isSaving) ...[
                        const SizedBox(height: 16),
                        const Center(
                          child: Column(
                            children: [
                              CircularProgressIndicator(),
                              SizedBox(height: 8),
                              Text('Enviando mídia e salvando...'),
                            ],
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
              actions: [
                TextButton(
                  onPressed:
                      isSaving ? null : () => Navigator.pop(dialogContext),
                  child: const Text('Cancelar'),
                ),
                ElevatedButton(
                  onPressed: isSaving
                      ? null
                      : () async {
                          final name = nameController.text.trim();
                          final description = descriptionController.text.trim();
                          final price = double.tryParse(
                                priceController.text
                                    .replaceAll(',', '.')
                                    .trim(),
                              ) ??
                              0;
                          final stock =
                              int.tryParse(stockController.text.trim()) ?? 0;

                          if (name.isEmpty) {
                            _showError(context, 'Informe o nome do produto.');
                            return;
                          }
                          if (description.isEmpty) {
                            _showError(context, 'Informe a descrição.');
                            return;
                          }
                          if (price <= 0) {
                            _showError(context, 'Informe um preço válido.');
                            return;
                          }
                          if (selectedColors.isEmpty) {
                            _showError(
                              context,
                              'Selecione pelo menos uma cor.',
                            );
                            return;
                          }

                          setDialogState(() => isSaving = true);

                          try {
                            final productId = _uuid.v4();
                            final List<String> imageUrls = [];
                            final List<String> videoUrls = [];

                            if (mainImage != null) {
                              final url = await _media.uploadImage(
                                  mainImage!, productId);
                              imageUrls.add(url);
                            }

                            for (final file in galleryImages) {
                              final url =
                                  await _media.uploadImage(file, productId);
                              imageUrls.add(url);
                            }

                            for (final file in videos) {
                              final url =
                                  await _media.uploadVideo(file, productId);
                              videoUrls.add(url);
                            }

                            // Permite produto sem foto (opcional)
                            final newProduct = Product(
                              id: productId,
                              name: name,
                              description: description,
                              price: price,
                              categoryId: selectedCategory,
                              images: imageUrls,
                              videos: videoUrls,
                              variants: selectedColors
                                  .map((color) => ProductVariant(
                                        color: color,
                                        size: 'M',
                                        stock: stock,
                                      ))
                                  .toList(),
                              isFeatured: false,
                              isNew: true,
                              createdAt: DateTime.now(),
                            );

                            await ref
                                .read(productsActionsProvider)
                                .addProduct(newProduct);

                            if (dialogContext.mounted)
                              Navigator.pop(dialogContext);
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text('Produto adicionado!'),
                                  backgroundColor: AppColors.success,
                                  behavior: SnackBarBehavior.floating,
                                ),
                              );
                            }
                          } catch (e, st) {
                            debugPrint(
                                'Erro detalhado ao salvar produto: $e\n$st');
                            setDialogState(() => isSaving = false);
                            if (context.mounted) {
                              _showError(context, 'Erro ao salvar produto: $e');
                            }
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
        '${v.color}|${v.size}': TextEditingController(text: '${v.stock}'),
    };

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
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
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
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
                  style: TextStyle(color: AppColors.textSecondary),
                ),
                const SizedBox(height: 20),
                TextField(
                  controller: priceController,
                  decoration: const InputDecoration(
                    labelText: 'Preço',
                    prefixIcon: Icon(Icons.attach_money),
                  ),
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: discountController,
                        decoration: const InputDecoration(
                          labelText: 'Desconto %',
                          prefixIcon: Icon(Icons.percent),
                        ),
                        keyboardType: TextInputType.number,
                      ),
                    ),
                    const SizedBox(width: 12),
                    ElevatedButton(
                      onPressed: () async {
                        final percent = double.tryParse(
                              discountController.text.replaceAll(',', '.'),
                            ) ??
                            0;
                        if (percent <= 0 || percent >= 100) {
                          _showError(context, 'Desconto inválido (1-99).');
                          return;
                        }

                        final ok = await ref
                            .read(productsActionsProvider)
                            .applyDiscount(product.id, percent);

                        if (!context.mounted) return;

                        if (ok) {
                          // Atualiza o campo de preço na tela com o valor já descontado
                          final base = product.oldPrice ?? product.price;
                          final newPrice = double.parse(
                            (base * (1 - percent / 100)).toStringAsFixed(2),
                          );
                          priceController.text = newPrice.toStringAsFixed(2);

                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('Desconto aplicado'),
                              backgroundColor: AppColors.success,
                              behavior: SnackBarBehavior.floating,
                            ),
                          );

                          // Fecha o bottom sheet para forçar o stream do Firestore atualizar a lista
                          Navigator.pop(context);
                        } else {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('Erro ao aplicar desconto'),
                              backgroundColor: AppColors.error,
                              behavior: SnackBarBehavior.floating,
                            ),
                          );
                        }
                      },
                      child: const Text('Aplicar'),
                    ),
                  ],
                ),
                if (hasDiscount) ...[
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: () async {
                        await ref
                            .read(productsActionsProvider)
                            .removeDiscount(product.id);
                        if (context.mounted) {
                          Navigator.pop(context);
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('Desconto removido'),
                              backgroundColor: AppColors.success,
                              behavior: SnackBarBehavior.floating,
                            ),
                          );
                        }
                      },
                      icon: const Icon(Icons.close, size: 18),
                      label: const Text('Remover desconto'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.error,
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 20),
                const Text(
                  'Estoque por variação',
                  style: TextStyle(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 8),
                ...product.variants.map((v) {
                  final key = '${v.color}|${v.size}';
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: TextField(
                      controller: stockControllers[key],
                      decoration: InputDecoration(
                        labelText: '${v.color} / ${v.size}',
                        prefixIcon: const Icon(Icons.inventory_2_outlined),
                      ),
                      keyboardType: TextInputType.number,
                    ),
                  );
                }),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton(
                    onPressed: () async {
                      final newPrice = double.tryParse(
                            priceController.text.replaceAll(',', '.'),
                          ) ??
                          product.price;

                      final actions = ref.read(productsActionsProvider);

                      // Se já existe desconto e o usuário não mexeu no preço de forma intencional,
                      // não chama updatePrice (que apagaria a lógica do oldPrice)
                      final current = await actions.getById(product.id);
                      if (current != null && current.oldPrice != null) {
                        // Mantém o desconto; só atualiza estoque
                      } else {
                        await actions.updatePrice(product.id, newPrice);
                      }

                      for (final v in product.variants) {
                        final key = '${v.color}|${v.size}';
                        final stock =
                            int.tryParse(stockControllers[key]?.text ?? '') ??
                                v.stock;
                        await actions.updateVariantStock(
                            product.id, v.color, v.size, stock);
                      }

                      if (context.mounted) {
                        Navigator.pop(context);
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Produto atualizado!'),
                            backgroundColor: AppColors.success,
                            behavior: SnackBarBehavior.floating,
                          ),
                        );
                      }
                    },
                    child: const Text('Salvar alterações'),
                  ),
                ),
                const SizedBox(height: 8),
              ],
            ),
          ),
        );
      },
    );
  }

  void _showError(BuildContext context, String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: AppColors.error,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }
}

class _ProductTile extends StatelessWidget {
  final Product product;
  final NumberFormat currency;
  final VoidCallback onEdit;
  final VoidCallback onEditMedia;
  final VoidCallback onDelete;

  const _ProductTile({
    required this.product,
    required this.currency,
    required this.onEdit,
    required this.onEditMedia,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
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
                  child: const Icon(Icons.image),
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    product.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    currency.format(product.price),
                    style: const TextStyle(
                      color: AppColors.primary,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Estoque: ${product.totalStock}',
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
            IconButton(
              icon: const Icon(Icons.photo_library_outlined),
              tooltip: 'Alterar fotos/vídeos',
              onPressed: onEditMedia,
            ),
            IconButton(
              icon: const Icon(Icons.edit_outlined),
              tooltip: 'Editar',
              onPressed: onEdit,
            ),
            IconButton(
              icon: const Icon(Icons.delete_outline, color: AppColors.error),
              tooltip: 'Remover',
              onPressed: onDelete,
            ),
          ],
        ),
      ),
    );
  }
}
