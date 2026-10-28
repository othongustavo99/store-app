import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:loja_roupas/features/client/widgets/empty_state.dart';

void main() {
  testWidgets('Estado vazio exibe conteúdo e executa a ação', (tester) async {
    var pressed = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: EmptyState(
            icon: Icons.shopping_bag_outlined,
            title: 'Nenhum produto',
            subtitle: 'Os produtos aparecerão aqui.',
            buttonLabel: 'Tentar novamente',
            onButtonPressed: () => pressed = true,
          ),
        ),
      ),
    );

    expect(find.text('Nenhum produto'), findsOneWidget);
    expect(find.text('Os produtos aparecerão aqui.'), findsOneWidget);
    await tester.tap(find.text('Tentar novamente'));
    expect(pressed, isTrue);
  });
}
