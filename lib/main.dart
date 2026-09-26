import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/services.dart';
import 'app.dart';
import 'providers/product_providers.dart';


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

  try {
    await Firebase.initializeApp();
  } catch (e) {
    debugPrint('Erro ao inicializar Firebase: $e');
  }

  // ============================================================
  // RIVERPOD
  // ============================================================

  final container = ProviderContainer();

  // O seed não deve impedir o aplicativo de abrir.
  try {
    await container.read(productsActionsProvider).seedIfEmpty();
  } catch (e) {
    debugPrint('Erro ao carregar produtos iniciais: $e');
  }

  // ============================================================
  // APLICATIVO
  // ============================================================

  runApp(
    UncontrolledProviderScope(
      container: container,
      child: const LojaRoupasApp(),
    ),
  );
}
