import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/services.dart';
import 'package:loja_roupas/providers/category_providers.dart';
import 'core/config/app_environment.dart';
import 'core/network/loja_api.dart';
import 'app.dart';
import 'providers/product_providers.dart';
import 'features/client/widgets/store_connection_gate.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // ============================================================
  // BARRA SUPERIOR DO ANDROID
  // ============================================================
  // Deixa a barra de notificações/status transparente
  // e coloca os ícones em preto.
  //
  // A barra inferior continua branca com ícones pretos.
  // ============================================================

  await SystemChrome.setEnabledSystemUIMode(
    SystemUiMode.edgeToEdge,
  );

  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      // Barra superior transparente
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.dark,
      statusBarBrightness: Brightness.light,

      // Barra inferior
      systemNavigationBarColor: Colors.white,
      systemNavigationBarIconBrightness: Brightness.dark,
      systemNavigationBarDividerColor: Colors.transparent,
    ),
  );

  // ============================================================
  // FIREBASE
  // ============================================================

  // Railway usa a API própria e não exige Firebase inicializado.
  // No modo legado, o comportamento de inicialização é mantido.
  if (!LojaBackend.isRailway) {
    try {
      await Firebase.initializeApp();
    } catch (e) {
      debugPrint('Erro ao inicializar Firebase: $e');
    }
  }

  // ============================================================
  // RIVERPOD
  // ============================================================

  final container = ProviderContainer();

  // Nunca escreve produtos de exemplo automaticamente em produção.
  // Para testes locais: flutter run --dart-define=ENABLE_DEMO_SEED=true
  if (!LojaBackend.isRailway && AppEnvironment.enableDemoSeed) {
    try {
      await container.read(productsActionsProvider).seedIfEmpty();
      await container.read(categoryRepositoryProvider).seedIfEmpty();
    } catch (e) {
      debugPrint('Falha ao carregar dados de demonstração: $e');
    }
  }

  // ============================================================
  // APLICATIVO
  // ============================================================

  runApp(
    UncontrolledProviderScope(
      container: container,
      child: const StoreConnectionGate(child: LojaRoupasApp()),
    ),
  );
}
