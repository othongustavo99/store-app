import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Disponibiliza o histórico das abas para os respectivos AppBars.
class ClientTabBackScope extends InheritedWidget {
  const ClientTabBackScope({
    super.key,
    required this.goBack,
    required super.child,
  });

  final VoidCallback goBack;

  static ClientTabBackScope? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<ClientTabBackScope>();

  @override
  bool updateShouldNotify(ClientTabBackScope oldWidget) =>
      goBack != oldWidget.goBack;
}

/// Volta no histórico real do GoRouter. Quando uma rota é aberta diretamente
/// (sem página anterior), evita a exceção de pop e usa um destino conhecido.
/// Em uma aba principal, utiliza o histórico das abas mantido pelo ClientShell.
class AppBackButton extends StatelessWidget {
  const AppBackButton({
    super.key,
    this.fallbackLocation = '/',
    this.tabRoot = false,
  });

  final String fallbackLocation;
  final bool tabRoot;

  @override
  Widget build(BuildContext context) => IconButton(
        tooltip: 'Voltar',
        icon: const Icon(Icons.arrow_back_rounded),
        onPressed: () {
          final tabScope = tabRoot ? ClientTabBackScope.maybeOf(context) : null;
          if (tabScope != null) {
            tabScope.goBack();
          } else if (context.canPop()) {
            context.pop();
          } else {
            context.go(fallbackLocation);
          }
        },
      );
}

/// Protege o botão físico/gestual quando uma página foi aberta diretamente
/// sem histórico anterior (por link, restauração ou navegação com go()).
/// Com histórico, o pop natural do Navigator continua ativo.
class AppRouteBackGuard extends StatelessWidget {
  const AppRouteBackGuard({
    super.key,
    required this.child,
    this.fallbackLocation = '/',
  });

  final Widget child;
  final String fallbackLocation;

  @override
  Widget build(BuildContext context) => PopScope(
        canPop: context.canPop(),
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop && context.mounted) {
            if (context.canPop()) {
              context.pop();
            } else {
              context.go(fallbackLocation);
            }
          }
        },
        child: child,
      );
}
