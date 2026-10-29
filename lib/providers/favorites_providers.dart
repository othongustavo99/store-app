import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../core/network/loja_api.dart';
import '../models/product.dart';
import 'product_providers.dart';
import 'store_profile_providers.dart';

/// Favoritos do dispositivo, separados por loja. Não envia IDs privados à API.
final favoriteIdsProvider =
    StateNotifierProvider<FavoritesNotifier, Set<String>>(
  (ref) => FavoritesNotifier(),
);

class FavoritesNotifier extends StateNotifier<Set<String>> {
  FavoritesNotifier() : super({}) {
    ready = _restore();
  }
  late final Future<void> ready;
  Future<void> _writing = Future<void>.value();
  String get _key =>
      'loja_favorites_v1_${LojaBackend.storeSlug.isEmpty ? 'legado' : LojaBackend.storeSlug}';
  Future<void> _restore() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      if (mounted) state = (preferences.getStringList(_key) ?? []).toSet();
    } catch (_) {/* Preferências locais podem ser indisponíveis. */}
  }

  Future<void> toggle(String id) async {
    if (id.isEmpty) return;
    await ready;
    if (!mounted) return;
    final updated = Set<String>.of(state);
    if (!updated.add(id)) updated.remove(id);
    state = updated;
    _writing = _writing.then((_) async {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setStringList(_key, updated.toList());
    }).catchError((Object _) {
      /* Mantém favoritos até o fechamento da sessão. */
    });
    await _writing;
  }
}

final favoriteProductsProvider =
    FutureProvider.autoDispose<List<Product>>((ref) async {
  final ids = ref.watch(favoriteIdsProvider);
  if (ids.isEmpty) return const [];
  // Reutiliza a assinatura já compartilhada da loja para atualizar disponibilidade.
  if (LojaBackend.isRailway) ref.watch(storeProfileEventsProvider);
  final products = await ref.watch(productRepositoryProvider).getByIds(ids);
  final byId = {for (final product in products) product.id: product};
  return [
    for (final id in ids)
      if (byId[id] != null) byId[id]!
  ];
});
