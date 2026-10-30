import 'product.dart';

class CatalogPage {
  const CatalogPage(this.products, this.nextCursor);
  final List<Product> products;
  final String? nextCursor;
}

class CatalogFilters {
  const CatalogFilters({this.colors = const [], this.sizes = const []});
  final List<String> colors;
  final List<String> sizes;
}
