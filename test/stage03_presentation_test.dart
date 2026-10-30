import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:loja_roupas/core/theme/app_theme.dart';
import 'package:loja_roupas/core/utils/product_presentation.dart';
import 'package:loja_roupas/data/repositories/cart_repository.dart';
import 'helpers/stage03_fixtures.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test('galeria prioriza foto da combinação e elimina URLs vazias/duplicadas',
      () {
    final product = previewProducts.first;
    expect(
        productImagesForSelection(product, 'Azul', 'M').first, photo('blue-0'));
    expect(productImagesForSelection(product, 'Areia', 'G').first,
        photo('piece-0'));
    expect(
        productImagesForSelection(product, 'Areia', 'M'), [photo('piece-0')]);
  });
  test(
      'compartilhamento usa a marca e a combinação escolhidas; link público é opcional',
      () {
    final product = previewProducts.first;
    final text = productShareText(product,
        storeName: 'Minha Marca',
        formattedPrice: 'R\$ 89,90',
        color: 'Azul',
        size: 'M');
    expect(text, contains('Confira na Minha Marca!'));
    expect(text, contains('Cor: Azul'));
    expect(text, isNot(contains('Loja de Roupas')));
    expect(text, isNot(contains('http')));
    expect(
        productShareText(product,
            storeName: 'Minha Marca',
            formattedPrice: 'R\$ 89,90',
            publicBaseUrl: 'https://loja.example.invalid/colecao'),
        contains('/colecao/product/${product.id}'));
    expect(
        productShareText(product,
            storeName: 'Minha Marca',
            formattedPrice: 'R\$ 89,90',
            publicBaseUrl: 'http://invalido'),
        isNot(contains('http')));
  });
  test('cores claras de marca preservam contraste de controles e etiquetas',
      () {
    double contrast(Color first, Color second) {
      final high = first.computeLuminance(), low = second.computeLuminance();
      return high > low
          ? (high + .05) / (low + .05)
          : (low + .05) / (high + .05);
    }

    for (final color in [
      Colors.white,
      Colors.yellow,
      const Color(0xFFE9BB76),
      const Color(0xFF145B55),
      Colors.black
    ]) {
      final theme = AppTheme.build(primary: color, secondary: color);
      expect(contrast(theme.colorScheme.primary, theme.colorScheme.onPrimary),
          greaterThanOrEqualTo(4.5));
      expect(
          contrast(color, AppTheme.onColor(color)), greaterThanOrEqualTo(4.5));
    }
  });
  test('carrinho respeita limite de 20 da API ao adicionar, editar e recuperar',
      () async {
    final product = previewProducts.first;
    final repository =
        CartRepository(loadProductsByIds: (_) async => [product]);
    repository.addItem(
        product: product, color: 'Areia', size: 'M', quantity: 99);
    expect(repository.items.single.quantity, 20);
    repository.updateQuantity(repository.items.single.id, 99);
    expect(repository.items.single.quantity, 20);
    await repository.pendingWrite;
    final restored = CartRepository(loadProductsByIds: (_) async => [product]);
    expect((await restored.restore()).single.quantity, 20);
    await restored.pendingWrite;
  });
}
