import 'package:flutter/material.dart';

/// Aguarda também a animação de fechamento antes de liberar os controladores
/// que pertencem ao chamador. O resultado de Navigator.push chega antes dela.
Future<T?> showAdminDialog<T>(
    {required BuildContext context,
    required WidgetBuilder builder,
    bool barrierDismissible = true}) async {
  final navigator = Navigator.of(context, rootNavigator: true);
  final route = DialogRoute<T>(
      context: context,
      builder: builder,
      barrierDismissible: barrierDismissible,
      themes: InheritedTheme.capture(from: context, to: navigator.context));
  try {
    return await navigator.push(route);
  } finally {
    await route.completed;
  }
}
