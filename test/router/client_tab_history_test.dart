import 'package:flutter_test/flutter_test.dart';
import 'package:loja_roupas/router/client_tab_history.dart';

void main() {
  test('Voltar respeita ordem real das abas e termina na Home', () {
    final history = ClientTabHistory();
    history.visit(1);
    history.visit(3);
    history.visit(4);
    history.visit(1);
    expect(history.back(), 4);
    expect(history.back(), 3);
    expect(history.back(), 1);
    expect(history.back(), 0);
    expect(history.canGoBack, isFalse);
    expect(history.back(), 0);
  });

  test('Tocar em Início encerra o histórico antigo', () {
    final history = ClientTabHistory();
    history.visit(1);
    history.visit(4);
    history.visit(0);
    expect(history.canGoBack, isFalse);
  });

  test('Não cria duplicatas ao tocar novamente na mesma aba', () {
    final history = ClientTabHistory(initialIndex: 2);
    history.visit(2);
    expect(history.back(), 0);
    expect(history.canGoBack, isFalse);
  });

  test('Duplo voltar exige dois toques dentro do intervalo', () {
    final guard = DoubleBackExitGuard();
    final now = DateTime(2026, 10, 29);
    expect(guard.register(now), isFalse);
    expect(guard.register(now.add(const Duration(milliseconds: 1000))), isTrue);
    expect(guard.register(now.add(const Duration(seconds: 4))), isFalse);
    expect(guard.register(now.add(const Duration(seconds: 7))), isFalse);
    guard.reset();
    expect(guard.register(now.add(const Duration(seconds: 8))), isFalse);
  });
}
