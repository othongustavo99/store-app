import 'package:flutter_test/flutter_test.dart';
import 'package:loja_roupas/core/utils/order_metrics.dart';
import 'package:loja_roupas/models/order.dart';

Order _order(String id, double amount, String payment, String status) {
  return Order.fromJson(id, {
    'total': amount,
    'paymentStatus': payment,
    'status': status,
  });
}

void main() {
  test('receita considera somente pedidos pagos e não cancelados', () {
    final orders = [
      _order('1', 120, 'approved', 'delivered'),
      _order('2', 70, 'pending', 'received'),
      _order('3', 50, 'rejected', 'received'),
      _order('4', 30, 'approved', 'cancelled'),
      _order('5', 99.90, 'approved', 'shipped'),
    ];
    expect(OrderMetrics.approvedRevenue(orders), closeTo(219.90, 0.0001));
  });

  test('pedido legado sem status de pagamento inicia pendente', () {
    final order = Order.fromJson('legacy', {'total': 100});
    expect(order.paymentStatus, PaymentStatus.pending);
    expect(order.status, OrderStatus.received);
  });
}
