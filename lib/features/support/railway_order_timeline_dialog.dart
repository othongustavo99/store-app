import 'package:flutter/material.dart';
import '../../data/repositories/railway_order_repository.dart';

String _statusLabel(String code, bool delivery) => switch (code) {
  'PENDING_PAYMENT' => 'Pedido criado • aguardando pagamento',
  'PAID' => 'Pagamento confirmado',
  'PREPARING' => 'Separando seu pedido',
  'SHIPPED' => delivery ? 'Postado para entrega (informado pela loja)' : 'Pedido pronto para retirada',
  'DELIVERED' => delivery ? 'Entrega concluída (informada pela loja)' : 'Retirada concluída',
  'PAYMENT_REVIEW' => 'Pagamento em análise',
  'CANCELED' => 'Pedido cancelado',
  'REFUNDED' => 'Pedido reembolsado',
  _ => code,
};

Future<void> showRailwayOrderTimeline(BuildContext context, {
  required String orderId,
  required bool admin,
}) => showDialog<void>(
  context: context,
  builder: (dialogContext) => AlertDialog(
    title: const Text('Acompanhamento do pedido'),
    content: SizedBox(width: 550, child: FutureBuilder<Map<String, dynamic>>(
      future: RailwayOrderRepository().timeline(orderId, admin: admin),
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return snapshot.hasError
              ? Text('Não foi possível carregar o histórico: ${snapshot.error}')
              : const Center(child: CircularProgressIndicator());
        }
        final info = snapshot.data!;
        final order = Map<String, dynamic>.from(info['order'] as Map? ?? {});
        final history = (info['events'] as List? ?? const [])
            .map((e) => Map<String, dynamic>.from(e as Map)).toList();
        return ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: 500),
          child: ListView(children: [
            Text('Modalidade: ${order['fulfillment'] == 'PICKUP' ? 'Retirada na loja' : 'Entrega por transportadora'}'),
            const SizedBox(height: 12),
            for (final event in history)
              ListTile(
                leading: const Icon(Icons.check_circle_outline),
                title: Text(_statusLabel(event['status']?.toString() ?? '', order['fulfillment']=='DELIVERY')),
                subtitle: Text([
                  if ((event['notes']?.toString() ?? '').isNotEmpty)
                    event['notes'].toString(),
                  event['createdAt']?.toString() ?? '',
                ].where((x) => x.isNotEmpty).join('\n')),
              ),
            if (history.isEmpty) const Text('O pedido ainda não possui eventos registrados.'),
            const SizedBox(height: 8),
            const Text('Acompanhamento baseado nos eventos confirmados no servidor. '
                'Não representa localização por GPS ou rastreamento de transportadora.',
                style: TextStyle(fontSize: 12)),
          ]),
        );
      },
    )),
    actions: [TextButton(onPressed: () => Navigator.pop(dialogContext),
        child: const Text('Fechar'))],
  ),
);
