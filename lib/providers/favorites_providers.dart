import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../core/network/loja_api.dart';

/// Favoritos do dispositivo, separados por loja. Não envia IDs privados à API.
final favoriteIdsProvider = StateNotifierProvider<FavoritesNotifier, Set<String>>(
  (ref) => FavoritesNotifier(),
);

class FavoritesNotifier extends StateNotifier<Set<String>> {
  FavoritesNotifier() : super({}) { _restore(); }
  String get _key => 'loja_favorites_v1_${LojaBackend.storeSlug.isEmpty ? 'legado' : LojaBackend.storeSlug}';
  Future<void> _restore() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      state = (preferences.getStringList(_key) ?? []).toSet();
    } catch (_) { /* Preferências locais podem ser indisponíveis. */ }
  }
  Future<void> toggle(String id) async {
    if (id.isEmpty) return;
    final updated = Set<String>.of(state);
    if (!updated.add(id)) updated.remove(id);
    state = updated;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setStringList(_key, updated.toList());
    } catch (_) { /* Mantém favoritos até o fechamento da sessão. */ }
  }
}
