import '../../models/product.dart';

List<String> productImagesForSelection(
    Product product, String? color, String? size) {
  final variant = product.getVariant(color ?? '', size ?? '');
  final current = variant?.imageUrl?.trim();
  final selected = current?.isNotEmpty == true
      ? current
      : product.variants
          .where((item) =>
              item.color == color && item.imageUrl?.trim().isNotEmpty == true)
          .map((item) => item.imageUrl!)
          .firstOrNull;
  return [if (selected != null) selected, ...product.images]
      .map((url) => url.trim())
      .where((url) => url.isNotEmpty)
      .toSet()
      .toList();
}

String productShareText(
  Product product, {
  required String storeName,
  required String formattedPrice,
  String? color,
  String? size,
  String publicBaseUrl = '',
}) {
  final parts = [
    product.name,
    formattedPrice,
    if (color != null) 'Cor: $color',
    if (size != null) 'Tamanho: $size',
    'Confira na $storeName!'
  ];
  final base = Uri.tryParse(publicBaseUrl);
  if (base != null &&
      base.scheme == 'https' &&
      base.hasAuthority &&
      base.userInfo.isEmpty) {
    parts.add(Uri(
        scheme: base.scheme,
        host: base.host,
        port: base.hasPort ? base.port : null,
        pathSegments: [
          ...base.pathSegments.where((part) => part.isNotEmpty),
          'product',
          product.id
        ]).toString());
  }
  return parts.join('\n');
}
