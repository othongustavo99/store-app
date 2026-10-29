import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:loja_roupas/features/client/orders/widgets/offline_payment_notice.dart';

void main() {
  for (final scenario in [
    ('PENDING', 'PENDING_PAYMENT', 'aguardando conferência manual'),
    ('APPROVED', 'PAID', 'Pagamento confirmado pela loja.'),
    ('APPROVED', 'PREPARING', 'Pagamento confirmado pela loja.'),
    ('PENDING', 'CANCELED', 'Pedido cancelado.'),
    ('REVIEW', 'PAYMENT_REVIEW', 'Aguarde antes de fazer outro pagamento.'),
    ('REFUNDED', 'REFUNDED', 'Pedido marcado como reembolsado.'),
  ]) {
    testWidgets(
        'mensagem acompanha pagamento ${scenario.$1} e pedido ${scenario.$2}',
        (tester) async {
      await tester.pumpWidget(MaterialApp(
          home: Scaffold(
              body: Center(
                  child: SizedBox(
                      width: 320,
                      child: OfflinePaymentNotice(
                          paymentStatus: scenario.$1,
                          orderStatus: scenario.$2))))));
      expect(find.textContaining(scenario.$3), findsOneWidget);
      if (scenario.$1 != 'PENDING') {
        expect(
            find.textContaining('aguardando conferência manual'), findsNothing);
      }
      expect(tester.takeException(), isNull);
    });
  }
}
