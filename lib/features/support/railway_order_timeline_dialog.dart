import 'package:flutter/material.dart';
import '../../data/repositories/railway_order_repository.dart';
import '../client/orders/widgets/order_receiving_info.dart';

Future<void> showRailwayOrderTimeline(
  BuildContext context, {
  required String orderId,
  required bool admin,
  RailwayOrderRepository? repository,
}) =>
    showDialog<void>(
        context: context,
        builder: (_) => _TimelineDialog(
            orderId: orderId,
            admin: admin,
            repository: repository ?? RailwayOrderRepository()));

class _TimelineDialog extends StatefulWidget {
  const _TimelineDialog(
      {required this.orderId, required this.admin, required this.repository});
  final String orderId;
  final bool admin;
  final RailwayOrderRepository repository;
  @override
  State<_TimelineDialog> createState() => _TimelineDialogState();
}

class _TimelineDialogState extends State<_TimelineDialog> {
  late Future<Map<String, dynamic>> _timeline;
  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    _timeline = widget.repository.timeline(widget.orderId, admin: widget.admin);
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Acompanhamento do pedido'),
        content: SizedBox(
            width: 550,
            height: MediaQuery.sizeOf(context).height * .58,
            child: FutureBuilder<Map<String, dynamic>>(
                future: _timeline,
                builder: (context, snapshot) {
                  if (snapshot.connectionState != ConnectionState.done) {
                    return const Center(child: CircularProgressIndicator());
                  }
                  if (snapshot.hasError) {
                    return SingleChildScrollView(
                        child: Column(children: [
                      const Text(
                          'Não foi possível carregar o histórico. Verifique sua conexão.'),
                      TextButton(
                          onPressed: () => setState(_reload),
                          child: const Text('Tentar novamente')),
                    ]));
                  }
                  final data = snapshot.data ?? {};
                  final order =
                      Map<String, dynamic>.from(data['order'] as Map? ?? {});
                  final delivery = order['fulfillment'] == 'DELIVERY',
                      local = isLocalDelivery(order);
                  final events = (data['events'] as List? ?? [])
                      .map((e) => Map<String, dynamic>.from(e as Map))
                      .toList();
                  return ListView(children: [
                    Text(
                        orderStatusLabel('${order['status']}',
                            delivery: delivery, local: local),
                        style: Theme.of(context).textTheme.titleMedium),
                    OrderReceivingInfo(order: order),
                    const Divider(),
                    if (events.isEmpty)
                      const Text(
                          'O pedido ainda não possui atualizações registradas.'),
                    for (final event in events)
                      Padding(
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Icon(Icons.check_circle_outline,
                                    size: 22,
                                    color:
                                        Theme.of(context).colorScheme.primary),
                                const SizedBox(width: 12),
                                Expanded(
                                    child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                      Text(
                                          orderStatusLabel('${event['status']}',
                                              delivery: delivery, local: local),
                                          style: const TextStyle(
                                              fontWeight: FontWeight.w600)),
                                      if (orderDate(event['createdAt'])
                                          .isNotEmpty)
                                        Text(orderDate(event['createdAt'])),
                                      if ('${event['notes'] ?? ''}'
                                          .trim()
                                          .isNotEmpty)
                                        Text('${event['notes']}'),
                                    ])),
                              ])),
                    const Divider(),
                    const Text(
                        'Atualizações registradas pela loja e pelo sistema de pagamento. '
                        'Acompanhe aqui; a tela não exibe a localização do entregador.',
                        style: TextStyle(fontSize: 12)),
                  ]);
                })),
        actions: [
          TextButton(
              onPressed: () => setState(_reload),
              child: const Text('Atualizar')),
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Fechar'))
        ],
      );
}
