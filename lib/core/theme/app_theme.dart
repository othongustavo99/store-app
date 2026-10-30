import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'app_colors.dart';

class AppTheme {
  static Color onColor(Color color) =>
      color.computeLuminance() > 0.179 ? Colors.black : Colors.white;
  static ThemeData get light =>
      build(primary: AppColors.primary, secondary: AppColors.secondary);
  static ThemeData build({required Color primary, required Color secondary}) {
    final generated = ColorScheme.fromSeed(
        seedColor: primary,
        secondary: secondary,
        brightness: Brightness.light,
        surface: AppColors.surface);
    // Cores muito claras recebem uma variação legível nos controles sobre branco.
    final buttonColor = (primary.computeLuminance() + .05) <= 1.05 / 4.5
        ? primary
        : generated.primary;
    final scheme = generated.copyWith(
        primary: buttonColor,
        onPrimary: onColor(buttonColor),
        secondary: secondary,
        onSecondary: onColor(secondary));
    const radius = 16.0;
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: const Color(0xFFF8F9FA),
      appBarTheme: AppBarTheme(
          backgroundColor: scheme.surface,
          foregroundColor: scheme.onSurface,
          elevation: 0,
          scrolledUnderElevation: 0,
          centerTitle: false,
          systemOverlayStyle: const SystemUiOverlayStyle(
              statusBarColor: Colors.transparent,
              statusBarIconBrightness: Brightness.dark,
              statusBarBrightness: Brightness.light),
          titleTextStyle: TextStyle(
              fontSize: 19,
              fontWeight: FontWeight.w700,
              color: scheme.onSurface)),
      cardTheme: CardThemeData(
          color: scheme.surface,
          surfaceTintColor: Colors.transparent,
          elevation: 0,
          margin: EdgeInsets.zero,
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(radius),
              side: BorderSide(color: scheme.outlineVariant))),
      dividerTheme: DividerThemeData(color: scheme.outlineVariant),
      elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
              backgroundColor: scheme.primary,
              foregroundColor: scheme.onPrimary,
              minimumSize: const Size(48, 48),
              elevation: 0,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14)))),
      filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
              backgroundColor: scheme.primary,
              foregroundColor: scheme.onPrimary,
              minimumSize: const Size(48, 48),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14)))),
      outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
              foregroundColor: scheme.primary,
              side: BorderSide(color: scheme.outlineVariant),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14)))),
      inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: scheme.surface,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
          focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide(color: scheme.primary, width: 1.7))),
      navigationBarTheme: NavigationBarThemeData(
          height: 70,
          backgroundColor: scheme.surface,
          indicatorColor: scheme.primaryContainer),
      navigationRailTheme: NavigationRailThemeData(
          backgroundColor: scheme.surface,
          indicatorColor: scheme.primaryContainer,
          selectedIconTheme: IconThemeData(color: scheme.primary)),
      snackBarTheme: SnackBarThemeData(
          behavior: SnackBarBehavior.floating,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
      textTheme: TextTheme(
          headlineSmall: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w800,
              color: scheme.onSurface),
          titleLarge: TextStyle(
              fontSize: 21,
              fontWeight: FontWeight.w800,
              color: scheme.onSurface),
          titleMedium: TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w700,
              color: scheme.onSurface),
          bodyLarge: TextStyle(fontSize: 16, color: scheme.onSurface),
          bodyMedium: TextStyle(fontSize: 14, color: scheme.onSurfaceVariant)),
    );
  }
}
