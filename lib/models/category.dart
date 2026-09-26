class Category {
  final String id;
  final String name;
  final String icon;
  final String imageUrl;

  const Category({
    required this.id,
    required this.name,
    required this.icon,
    this.imageUrl = '',
  });

  Category copyWith({
    String? id,
    String? name,
    String? icon,
    String? imageUrl,
  }) {
    return Category(
      id: id ?? this.id,
      name: name ?? this.name,
      icon: icon ?? this.icon,
      imageUrl: imageUrl ?? this.imageUrl,
    );
  }

  Map<String, dynamic> toJson() => {
        'name': name,
        'icon': icon,
        'imageUrl': imageUrl,
      };

  factory Category.fromJson(String id, Map<String, dynamic> json) {
    return Category(
      id: id,
      name: json['name'] as String? ?? '',
      icon: json['icon'] as String? ?? '🏷️',
      imageUrl: json['imageUrl'] as String? ?? '',
    );
  }
}
