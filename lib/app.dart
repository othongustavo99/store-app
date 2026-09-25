import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/theme/app_theme.dart';
import 'router/app_router.dart';

class LojaRoupasApp extends ConsumerWidget {
  const LojaRoupasApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);

    return MaterialApp.router(
      title: 'Loja de Roupas',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      routerConfig: router,
      builder: (context, child) {
        return SafeArea(
          top: true,
          bottom: true,
          left: false,
          right: false,
          child: child ?? const SizedBox.shrink(),
        );
      },
    );
  }
}
