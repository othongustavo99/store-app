class ProductVariant {
  final String color;
  final String size;
  final int stock;
  final String? imageUrl;

  const ProductVariant({
    required this.color,
    required this.size,
    required this.stock,
    this.imageUrl,
  });

  bool get isAvailable => stock > 0;

  ProductVariant copyWith({
    String? color,
    String? size,
    int? stock,
    String? imageUrl,
  }) {
    return ProductVariant(
      color: color ?? this.color,
      size: size ?? this.size,
      stock: stock ?? this.stock,
      imageUrl: imageUrl ?? this.imageUrl,
    );
  }

  Map<String, dynamic> toJson() => {
        'color': color,
        'size': size,
        'stock': stock,
        'imageUrl': imageUrl,
      };

  factory ProductVariant.fromJson(Map<String, dynamic> json) {
    return ProductVariant(
      color: json['color'] as String? ?? '',
      size: json['size'] as String? ?? '',
      stock: (json['stock'] as num?)?.toInt() ?? 0,
      imageUrl: json['imageUrl'] as String?,
    );
  }
}

class Product {
  final String id;
  final String name;
  final String description;
  final double price;
  final double? oldPrice;
  final String categoryId;
  final List<String> images;
  final List<ProductVariant> variants;
  final bool isFeatured;
  final bool isNew;
  final List<String> videos;
  final DateTime createdAt;

  const Product({
    required this.id,
    required this.name,
    required this.description,
    required this.price,
    this.oldPrice,
    required this.categoryId,
    required this.images,
    this.videos = const [],
    required this.variants,
    this.isFeatured = false,
    this.isNew = false,
    required this.createdAt,
  });

  List<String> get availableColors =>
      variants.map((v) => v.color).toSet().toList();

  List<String> get availableSizes =>
      variants.map((v) => v.size).toSet().toList();

  int get totalStock => variants.fold(0, (sum, v) => sum + v.stock);

  bool get isAvailable => totalStock > 0;

  ProductVariant? getVariant(String color, String size) {
    try {
      return variants.firstWhere((v) => v.color == color && v.size == size);
    } catch (_) {
      return null;
    }
  }

  Product copyWith({
    String? id,
    String? name,
    String? description,
    double? price,
    double? oldPrice,
    bool clearOldPrice = false,
    String? categoryId,
    List<String>? images,
    List<ProductVariant>? variants,
    bool? isFeatured,
    bool? isNew,
    DateTime? createdAt,
  }) {
    return Product(
      id: id ?? this.id,
      name: name ?? this.name,
      description: description ?? this.description,
      price: price ?? this.price,
      oldPrice: clearOldPrice ? null : (oldPrice ?? this.oldPrice),
      categoryId: categoryId ?? this.categoryId,
      images: images ?? this.images,
      variants: variants ?? this.variants,
      isFeatured: isFeatured ?? this.isFeatured,
      isNew: isNew ?? this.isNew,
      createdAt: createdAt ?? this.createdAt,
      videos: videos ?? this.videos,
    );
  }

  Map<String, dynamic> toJson() => {
        'name': name,
        'description': description,
        'price': price,
        'oldPrice': oldPrice,
        'categoryId': categoryId,
        'images': images,
        'variants': variants.map((v) => v.toJson()).toList(),
        'isFeatured': isFeatured,
        'isNew': isNew,
        'createdAt': createdAt.toIso8601String(),
        'videos': videos,
      };

  factory Product.fromJson(String id, Map<String, dynamic> json) {
    return Product(
      id: id,
      name: json['name'] as String? ?? '',
      description: json['description'] as String? ?? '',
      price: (json['price'] as num?)?.toDouble() ?? 0,
      oldPrice: (json['oldPrice'] as num?)?.toDouble(),
      categoryId: json['categoryId'] as String? ?? '',
      videos: (json['videos'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          [],
      images: (json['images'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          [],
      variants: (json['variants'] as List<dynamic>?)
              ?.map((e) => ProductVariant.fromJson(
                    Map<String, dynamic>.from(e as Map),
                  ))
              .toList() ??
          [],
      isFeatured: json['isFeatured'] as bool? ?? false,
      isNew: json['isNew'] as bool? ?? false,
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }
}
