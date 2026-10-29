import 'package:flutter/material.dart';

/// A confirmação vem do pagamento registrado pela API, nunca do comprovante do cliente.
class OfflinePaymentNotice extends StatelessWidget {
  const OfflinePaymentNotice({
    super.key,
    required this.paymentStatus,
    required this.orderStatus,
  });

  final String paymentStatus;
  final String orderStatus;

  @override
  Widget build(BuildContext context) {
    final String message;
    final IconData icon;
    if (orderStatus == 'REFUNDED' || paymentStatus == 'REFUNDED') {
      message =
          'Pedido marcado como reembolsado. Consulte a loja para conferir a devolução.';
      icon = Icons.currency_exchange;
    } else if (orderStatus == 'CANCELED') {
      message =
          'Pedido cancelado. Se você já pagou, entre em contato com a loja.';
      icon = Icons.cancel_outlined;
    } else if (orderStatus == 'PAYMENT_REVIEW' || paymentStatus == 'REVIEW') {
      message =
          'Pagamento em conferência pela loja. Aguarde antes de fazer outro pagamento.';
      icon = Icons.info_outline;
    } else if (paymentStatus == 'APPROVED') {
      message = 'Pagamento confirmado pela loja.';
      icon = Icons.verified_outlined;
    } else {
      message =
          'Pagamento combinado com a loja — aguardando conferência manual.';
      icon = Icons.schedule;
    }
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(icon, size: 20),
        const SizedBox(width: 8),
        Expanded(
            child: Text(message,
                style: const TextStyle(fontWeight: FontWeight.w600))),
      ]),
    );
  }
}
