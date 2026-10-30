import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

bool unpaidPickupOrder(Map<String, dynamic> order) =>
    order['status'] == 'PENDING_PAYMENT' &&
    order['fulfillment'] == 'PICKUP' &&
    order['paymentProvider'] == 'offline' &&
    order['paymentStatus'] == 'PENDING' &&
    (order['customerContact'] as Map?)?['offlineMethod'] == 'PAY_ON_PICKUP';

bool pickupReservationValid(Map<String, dynamic> order) =>
    DateTime.tryParse('${order['reservationExpiresAt']}')
        ?.isAfter(DateTime.now()) ==
    true;

String? unpaidPickupLabel(Map<String, dynamic> order) {
  if (!unpaidPickupOrder(order) || !pickupReservationValid(order)) return null;
  return switch (order['pickupPreparation']) {
    'PREPARING' => 'Em preparação · pagamento na retirada',
    'READY' => 'Pronto para retirada · pagamento pendente',
    _ => null,
  };
}

bool isLocalDelivery(Map<String, dynamic> order) =>
    order['fulfillment'] == 'DELIVERY' &&
    (order['shippingServiceId']?.toString() == '0' ||
        (order['customerContact'] is Map &&
            (order['customerContact'] as Map)['deliveryMode'] == 'LOCAL'));

String orderStatusLabel(String status,
        {bool delivery = false, bool local = false}) =>
    switch (status) {
      'PENDING_PAYMENT' => 'Aguardando pagamento',
      'PICKUP_PREPARING' => 'Preparação iniciada · pagamento pendente',
      'PICKUP_READY' => 'Pronto para retirada · pagamento pendente',
      'PAID' => 'Pagamento confirmado',
      'PREPARING' => 'Em preparação',
      'SHIPPED' => local
          ? 'Saiu para entrega local'
          : delivery
              ? 'Postado para entrega'
              : 'Pronto para retirada',
      'DELIVERED' => delivery ? 'Entrega concluída' : 'Retirada concluída',
      'CANCELED' => 'Pedido cancelado',
      'REFUNDED' => 'Pedido reembolsado',
      'PAYMENT_REVIEW' => 'Pagamento em análise',
      _ => 'Atualização em análise',
    };

String orderDate(dynamic value) {
  final date = DateTime.tryParse('$value');
  return date == null
      ? ''
      : DateFormat('dd/MM/yyyy · HH:mm').format(date.toLocal());
}

class OrderReceivingInfo extends StatelessWidget {
  const OrderReceivingInfo({super.key, required this.order});
  final Map<String, dynamic> order;
  @override
  Widget build(BuildContext context) {
    final contact =
        Map<String, dynamic>.from(order['customerContact'] as Map? ?? {});
    final delivery = order['fulfillment'] == 'DELIVERY',
        local = isLocalDelivery(order);
    final status = '${order['status']}';
    final address = [
      [contact['street'], contact['number']]
          .where((x) => x != null && '$x'.isNotEmpty)
          .join(', '),
      '${contact['complement'] ?? ''}',
      '${contact['neighborhood'] ?? ''}',
      [contact['city'], contact['state']]
          .where((x) => x != null && '$x'.isNotEmpty)
          .join('/'),
      if (contact['postalCode'] != null) 'CEP ${contact['postalCode']}',
    ].where((s) => s.isNotEmpty).join(' · ');
    return Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(
              delivery
                  ? local
                      ? 'Entrega local pela loja'
                      : 'Entrega por transportadora'
                  : 'Retirada na loja',
              style: const TextStyle(fontWeight: FontWeight.w700)),
          if (delivery && address.isNotEmpty) Text(address),
          if (!delivery && '${contact['pickupAddress'] ?? ''}'.isNotEmpty)
            Text('${contact['pickupAddress']}'),
          if (!delivery && '${contact['pickupHours'] ?? ''}'.isNotEmpty)
            Text('${contact['pickupHours']}'),
          if (unpaidPickupLabel(order) != null) Text(unpaidPickupLabel(order)!),
          if (unpaidPickupLabel(order) != null &&
              order['pickupPreparation'] == 'READY')
            const Text(
                'Confira o horário e pague ao retirar. Seu pagamento ainda não foi confirmado.'),
          if (!delivery &&
              unpaidPickupLabel(order) == null &&
              ['PENDING_PAYMENT', 'PAID', 'PREPARING'].contains(status))
            const Text('Aguarde o aviso de que está pronto antes de buscar.'),
          if (!delivery && status == 'SHIPPED')
            const Text(
                'Seu pedido está pronto. Confira o horário de retirada.'),
          if (local && '${contact['deliveryEstimate'] ?? ''}'.isNotEmpty)
            Text('${contact['deliveryEstimate']}'),
          if (contact['notes'] != null && '${contact['notes']}'.isNotEmpty)
            Text('Observação: ${contact['notes']}'),
        ]));
  }
}
