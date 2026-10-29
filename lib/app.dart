import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/theme/app_theme.dart';
import 'core/network/loja_api.dart';
import 'providers/store_profile_providers.dart';
import 'router/app_router.dart';

class LojaRoupasApp extends ConsumerWidget {
  const LojaRoupasApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);
    final profile = ref.watch(storeProfileProvider).valueOrNull;
    final displayName = profile?['displayName']?.toString();

    return MaterialApp.router(
      title: displayName?.isNotEmpty == true ? displayName! : const String.fromEnvironment('LOJA_APP_NAME', defaultValue: 'Loja'),
      debugShowCheckedModeBanner: false,
      theme: LojaBackend.isRailway ? ref.watch(storeThemeProvider) : AppTheme.light,
      routerConfig: router,
      builder: (context, child) {
        return AnnotatedRegion<SystemUiOverlayStyle>(
          value: const SystemUiOverlayStyle(
            statusBarColor: Colors.transparent,
            statusBarIconBrightness: Brightness.dark,
            statusBarBrightness: Brightness.light,
            systemNavigationBarColor: Colors.white,
            systemNavigationBarIconBrightness: Brightness.dark,
          ),
          child: SafeArea(
            top: false, // status bar transparente “entra” no app
            bottom: true, // barra de navegação continua limitando
            left: false,
            right: false,
            child: child ?? const SizedBox.shrink(),
          ),
        );
      },
    );
  }
}
