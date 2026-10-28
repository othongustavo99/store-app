import '../../models/order.dart';

/// Indicadores financeiros provisórios. Na fase Railway,
/// os valores serão apurados a partir do backend e de pagamentos conciliados.
abstract final class OrderMetrics {
  static double approvedRevenue(Iterable<Order> orders) {
    return orders
        .where((order) =>
            order.paymentStatus == PaymentStatus.approved &&
            order.status != OrderStatus.cancelled)
        .fold<double>(0, (total, order) => total + order.total);
  }
}
