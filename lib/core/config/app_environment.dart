import 'package:flutter/foundation.dart';

/// Flags temporárias da fase de migração.
///
/// Recursos de demonstração nunca são habilitados em builds profile/release.
/// Flags apenas evitam operações acidentais pelo cliente: NÃO substituem
/// permissões do Firestore nem autorizações verificadas no servidor.
abstract final class AppEnvironment {
  static const bool enableDemoSeed = kDebugMode &&
      bool.fromEnvironment('ENABLE_DEMO_SEED', defaultValue: false);

  static const bool enableDemoReset = kDebugMode &&
      bool.fromEnvironment('ENABLE_DEMO_RESET', defaultValue: false);

  /// O checkout existente apenas simula pagamento: nunca usá-lo em produção.
  static const bool simulatedCheckoutEnabled = kDebugMode &&
      bool.fromEnvironment('ENABLE_DEMO_CHECKOUT', defaultValue: true);

  static void requireDemoSeed() {
    if (!enableDemoSeed) {
      throw StateError('Carga de dados de demonstração desabilitada.');
    }
  }

  static void requireDemoReset() {
    if (!enableDemoReset) {
      throw StateError('Reset de demonstração desabilitado.');
    }
  }
}
