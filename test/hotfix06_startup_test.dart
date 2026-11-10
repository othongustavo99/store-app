import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:loja_roupas/app.dart';
import 'package:loja_roupas/features/client/home/home_screen.dart';
import 'package:loja_roupas/features/client/widgets/demo_store_banner.dart';
import 'package:loja_roupas/providers/auth_providers.dart';
import 'package:loja_roupas/providers/cart_providers.dart';
import 'package:loja_roupas/providers/category_providers.dart';
import 'package:loja_roupas/providers/product_providers.dart';
import 'package:loja_roupas/providers/store_profile_providers.dart';
import 'package:loja_roupas/data/repositories/cart_repository.dart';
import 'package:loja_roupas/models/category.dart';
import 'package:loja_roupas/models/product.dart';
import 'helpers/stage03_fixtures.dart';

class SessionFixture extends AuthNotifier {
  SessionFixture() : super(null);
  void restoreAsClient() {
    state = const AuthState(isLoggedIn: true, name: 'Cliente de teste');
  }
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  testWidgets(
      'vitrine permanece visível depois da marca e da sessão carregarem',
      (tester) async {
    tester.view.physicalSize = const Size(390, 850);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final profile = Completer<Map<String, dynamic>>();
    final session = SessionFixture();
    final container = ProviderContainer(overrides: [
      authProvider.overrideWith((ref) => session),
      productsProvider.overrideWith((ref) => Stream.value(<Product>[])),
      categoriesProvider.overrideWith((ref) => Stream.value(<Category>[])),
      storeProfileProvider.overrideWith((ref) => profile.future),
      storeProfileEventsProvider
          .overrideWith((ref) => const Stream<int>.empty()),
      isDemoStoreProvider.overrideWith((ref) async => false),
      cartRepositoryProvider.overrideWithValue(
          CartRepository(loadProductsByIds: (_) async => [])),
    ]);
    addTearDown(container.dispose);
    await tester.pumpWidget(UncontrolledProviderScope(
        container: container, child: const LojaRoupasApp()));
    await tester.pump();
    expect(find.byType(HomeScreen), findsOneWidget);
    expect(
        find.text('Qual peça combina com você?').hitTestable(), findsOneWidget);
    profile.complete({
      'displayName': 'Loja de teste',
      'primaryColor': '#145B55',
      'secondaryColor': '#E9BB76'
    });
    await tester.pumpAndSettle();
    expect(
        find.text('Qual peça combina com você?').hitTestable(), findsOneWidget);
    session.restoreAsClient();
    await tester.pumpAndSettle();
    expect(
        find.text('Qual peça combina com você?').hitTestable(), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  for (final layout in [
    (390.0, 850.0, 1.0),
    (320.0, 800.0, 1.3),
    (1200.0, 900.0, 1.0)
  ]) {
    for (final failed in [false, true]) {
      testWidgets(
          'vitrine ${failed ? 'com erro' : 'vazia'} preserva layout em ${layout.$1}px',
          (tester) async {
        tester.view.physicalSize = Size(layout.$1, layout.$2);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await tester.runAsync(seedPreviewImages);
        await tester.pumpWidget(previewApp(const HomeScreen(),
            products: [], homeError: failed, textScale: layout.$3));
        await tester.pumpAndSettle();
        final message = failed
            ? 'Não foi possível carregar a vitrine'
            : 'Estamos preparando a vitrine';
        await tester.ensureVisible(find.text(message));
        await tester.pumpAndSettle();
        expect(find.text(message).hitTestable(), findsOneWidget);
        if (failed) {
          await tester.ensureVisible(find.text('Tentar novamente'));
          await tester.pumpAndSettle();
          expect(find.text('Tentar novamente').hitTestable(), findsOneWidget);
        }
        expect(tester.takeException(), isNull);
        if (layout.$1 == 390) {
          await savePreview(tester,
              failed ? 'hotfix06-vitrine-erro' : 'hotfix06-vitrine-vazia');
        }
      });
    }
  }

  testWidgets(
      'tentar novamente recupera a vitrine depois de falha sem apagar o cabeçalho',
      (tester) async {
    var attempts = 0;
    await tester.runAsync(seedPreviewImages);
    await tester.pumpWidget(ProviderScope(overrides: [
      productsProvider.overrideWith((ref) {
        attempts++;
        return attempts == 1
            ? Stream<List<Product>>.error(StateError('Falha de rede simulada'))
            : Stream.value(previewProducts);
      }),
      categoriesProvider.overrideWith((ref) => Stream.value(<Category>[])),
      storeProfileProvider
          .overrideWith((ref) async => {'displayName': 'Loja de teste'}),
      storeProfileEventsProvider
          .overrideWith((ref) => const Stream<int>.empty()),
    ], child: const MaterialApp(home: HomeScreen())));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Tentar novamente'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Tentar novamente'));
    await tester.pumpAndSettle();
    expect(attempts, 2);
    expect(find.text('Não foi possível carregar a vitrine'), findsNothing);
    expect(find.text('Seleção da loja'), findsOneWidget);
    expect(find.byType(HomeScreen), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
