import 'package:flutter_test/flutter_test.dart';
import 'package:loja_roupas/core/network/loja_api.dart';

void main() {
  test('backend railway deve ser selecionado explicitamente', () {
    expect(() => LojaBackend.validateSelection('railway'), returnsNormally);
  });
  test('firebase legado explícito permanece permitido', () {
    expect(() => LojaBackend.validateSelection('firebase'), returnsNormally);
  });
  test('configuração vazia ou backend desconhecido falha fechado', () {
    for (final backend in ['', 'Railway', 'firebase-prod', 'invalid']) {
      expect(() => LojaBackend.validateSelection(backend), throwsStateError);
    }
  });
}
