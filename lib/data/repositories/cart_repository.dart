import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';
import '../../core/network/loja_api.dart';
import '../../models/cart_item.dart';
import '../../models/product.dart';
import 'product_repository.dart';

/// Carrinho privado do dispositivo, separado por loja/backend. Não armazena dados sensíveis.
/// Guarda só IDs e variante; preço e estoque sempre vêm do catálogo atualizado.
class CartRepository {
  CartRepository({
    Future<List<Product>> Function()? loadCatalog,
    Future<List<Product>> Function(Iterable<String> ids)? loadProductsByIds,
  }) : _loadProductsByIds = loadProductsByIds ??
            (loadCatalog != null
                ? ((_) => loadCatalog())
                : ProductRepository().getByIds);
  final Future<List<Product>> Function(Iterable<String> ids) _loadProductsByIds;
  final List<CartItem> _items = [];
  final _uuid = const Uuid();
  bool _edited = false;
  Future<void> _writing = Future<void>.value();
  Future<void> get pendingWrite => _writing;
  String get _key =>
      'cart_v2_${LojaBackend.provider}_${LojaBackend.storeSlug.isEmpty ? "legacy" : LojaBackend.storeSlug}';

  List<CartItem> get items => List.unmodifiable(_items);
  int get itemCount => _items.fold(0, (sum, i) => sum + i.quantity);
  double get subtotal => _items.fold(0.0, (sum, i) => sum + i.total);

  Future<List<CartItem>> restore() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw == null || raw.isEmpty) return items;
    final decoded = jsonDecode(raw);
    if (decoded is! List) return items;
    final entries = decoded.take(100).whereType<Map>().toList();
    final ids =
        entries.map((entry) => entry['productId']).whereType<String>().toSet();
    final products = ids.isEmpty ? <Product>[] : await _loadProductsByIds(ids);
    final byId = {for (final product in products) product.id: product};
    if (_edited) {
      return items; // interação durante a leitura ganha da restauração
    }
    _items.clear();
    for (final entry in entries) {
      final id = entry['productId'];
      final color = entry['color'];
      final size = entry['size'];
      final amount = entry['quantity'];
      if (id is! String ||
          color is! String ||
          size is! String ||
          amount is! int) {
        continue;
      }
      final product = byId[id];
      if (product == null) continue;
      final stock = product.getVariant(color, size)?.stock ?? 0;
      if (stock <= 0 || amount <= 0) continue;
      final qty = amount.clamp(1, stock).toInt();
      final existing = _items.indexWhere(
          (i) => i.product.id == id && i.color == color && i.size == size);
      if (existing >= 0) {
        _items[existing] = _items[existing].copyWith(
            quantity:
                (_items[existing].quantity + qty).clamp(1, stock).toInt());
      } else {
        _items.add(CartItem(
            id: _uuid.v4(),
            product: product,
            color: color,
            size: size,
            quantity: qty));
      }
    }
    save(); // remove itens apagados ou com estoque indisponível
    return items;
  }

  void save() {
    _edited = true;
    final raw = jsonEncode(_items
        .map((i) => {
              'productId': i.product.id,
              'color': i.color,
              'size': i.size,
              'quantity': i.quantity,
            })
        .toList());
    _writing = _writing.then((_) async {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_key, raw);
    }).catchError((Object _) {/* Persistência local indisponível. */});
  }

  void addItem(
      {required Product product,
      required String color,
      required String size,
      int quantity = 1}) {
    final stock = product.getVariant(color, size)?.stock ?? 0;
    if (quantity <= 0 || stock <= 0) return;
    final at = _items.indexWhere((i) =>
        i.product.id == product.id && i.color == color && i.size == size);
    if (at >= 0) {
      final existing = _items[at];
      _items[at] = existing.copyWith(
          product: product,
          quantity: (existing.quantity + quantity).clamp(1, stock).toInt());
    } else {
      _items.add(CartItem(
          id: _uuid.v4(),
          product: product,
          color: color,
          size: size,
          quantity: quantity.clamp(1, stock).toInt()));
    }
    save();
  }

  void updateQuantity(String itemId, int quantity) {
    if (quantity <= 0) {
      removeItem(itemId);
      return;
    }
    final at = _items.indexWhere((i) => i.id == itemId);
    if (at < 0) return;
    final item = _items[at];
    final stock = item.product.getVariant(item.color, item.size)?.stock ?? 0;
    if (stock <= 0) {
      _items.removeAt(at);
    } else {
      _items[at] = item.copyWith(quantity: quantity.clamp(1, stock).toInt());
    }
    save();
  }

  void removeItem(String itemId) {
    _items.removeWhere((i) => i.id == itemId);
    save();
  }

  void clear() {
    _items.clear();
    save();
  }
}
