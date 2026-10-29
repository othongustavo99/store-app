import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/network/loja_api.dart';
import '../core/theme/app_theme.dart';
import '../data/repositories/railway_store_profile_repository.dart';

/// O próprio backend define a marca, nunca o APK. Recarrega após publicação
/// do perfil via evento da loja; fallback seguro enquanto a rede não responde.
final storeProfileEventsProvider = StreamProvider<int>((ref) =>
  LojaBackend.isRailway ? LojaApi.instance.catalogChanges() : const Stream<int>.empty());

final storeProfileProvider = FutureProvider<Map<String, dynamic>>((ref) async {
  if (!LojaBackend.isRailway) return const {};
  // O stream é mantido estável para não entrar em ciclo de reconexão a cada evento.
  ref.watch(storeProfileEventsProvider);
  final response = await RailwayStoreProfileRepository().publicProfile();
  return Map<String, dynamic>.from(response['profile'] as Map? ?? {});
});

Color storeHex(dynamic value, Color fallback) {
  final hex = value?.toString() ?? '';
  if (!RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(hex)) return fallback;
  return Color(int.parse(hex.substring(1), radix: 16) | 0xFF000000);
}

final storeThemeProvider = Provider<ThemeData>((ref) {
  final profile = ref.watch(storeProfileProvider).valueOrNull;
  return AppTheme.build(
    primary: storeHex(profile?['primaryColor'], const Color(0xFF1A1A2E)),
    secondary: storeHex(profile?['secondaryColor'], const Color(0xFFE94560)),
  );
});
