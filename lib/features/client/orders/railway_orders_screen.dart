import 'widgets/order_receiving_info.dart';
import 'package:loja_roupas/router/app_back_button.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import '../../../core/network/loja_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:go_router/go_router.dart';
import '../../support/railway_order_timeline_dialog.dart';
import '../../../data/repositories/railway_order_repository.dart';
import '../../support/railway_after_sales_dialogs.dart';
import '../widgets/empty_state.dart';
import 'widgets/offline_payment_notice.dart';

class RailwayOrdersScreen extends ConsumerStatefulWidget {
  const RailwayOrdersScreen({super.key, this.repository, this.changes});
  final RailwayOrderRepository? repository;
  final Stream<int>? changes;
  @override
  ConsumerState<RailwayOrdersScreen> createState() =>
      _RailwayOrdersScreenState();
}

class _RailwayOrdersScreenState extends ConsumerState<RailwayOrdersScreen>
    with WidgetsBindingObserver {
  late final _repo = widget.repository ?? RailwayOrderRepository();
  late Future<List<Map<String, dynamic>>> _orders;
  StreamSubscription<int>? _changes;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _reload();
    _changes = (widget.changes ?? LojaApi.instance.orderChanges(admin: false))
        .listen((_) {
      if (mounted) setState(_reload);
    }, onError: (Object _) {/* A atualização manual continua disponível. */});
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _changes?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && mounted) setState(_reload);
  }

  void _reload() {
    _orders = _repo.myOrders();
  }

  Future<void> _refresh() async {
    setState(_reload);
    try {
      await _orders;
    } catch (_) {/* O erro é apresentado pelo FutureBuilder. */}
  }

  final _money = NumberFormat.currency(locale: 'pt_BR', symbol: 'R\$');

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
            leading: const AppBackButton(fallbackLocation: '/profile'),
            title: const Text('Meus pedidos'),
            actions: [
              IconButton(
                  tooltip: 'Atualizar pedidos',
                  onPressed: () {
                    _refresh();
                  },
                  icon: const Icon(Icons.refresh))
            ]),
        body: FutureBuilder<List<Map<String, dynamic>>>(
            future: _orders,
            builder: (context, snapshot) {
              if (snapshot.connectionState != ConnectionState.done) {
                return const Center(
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                  CircularProgressIndicator(),
                  SizedBox(height: 14),
                  Text('Carregando seus pedidos…')
                ]));
              }
              if (snapshot.hasError) {
                return EmptyState(
                  icon: Icons.wifi_off_outlined,
                  title: 'Pedidos indisponíveis',
                  subtitle:
                      'Não foi possível consultar os pedidos agora. Verifique sua conexão.',
                  buttonLabel: 'Tentar novamente',
                  onButtonPressed: () {
                    setState(_reload);
                  },
                );
              }
              final orders = snapshot.data ?? [];
              if (orders.isEmpty) {
                return EmptyState(
                  icon: Icons.receipt_long_outlined,
                  title: 'Você ainda não fez pedidos',
                  subtitle:
                      'Quando sua primeira compra for registrada, ela aparecerá aqui.',
                  buttonLabel: 'Explorar produtos',
                  onButtonPressed: () => context.go('/'),
                );
              }
              return RefreshIndicator(
                  onRefresh: _refresh,
                  child: ListView.builder(
                    physics: const AlwaysScrollableScrollPhysics(),
                    itemCount: orders.length,
                    itemBuilder: (context, index) {
                      final order = orders[index];
                      final status =
                          order['status']?.toString() ?? 'PENDING_PAYMENT';
                      final isDemo = order['isDemo'] == true;
                      final total =
                          (int.tryParse(order['totalCents'].toString()) ?? 0) /
                              100;
                      final checkoutUrl = order['checkoutUrl']?.toString();
                      final cases =
                          (order['afterSalesRequests'] as List? ?? const [])
                              .whereType<Map<String, dynamic>>()
                              .toList();
                      final active = cases.any((c) =>
                          activeAfterSalesStatuses.contains(c['status']));
                      return Card(
                          margin: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 6),
                          child: Padding(
                              padding: const EdgeInsets.all(12),
                              child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                        'Pedido #${order['id'].toString().length > 8 ? order['id'].toString().substring(0, 8) : order['id']}',
                                        style: Theme.of(context)
                                            .textTheme
                                            .titleMedium),
                                    const SizedBox(height: 5),
                                    if (orderDate(order['createdAt'])
                                        .isNotEmpty)
                                      Text(orderDate(order['createdAt']),
                                          style: Theme.of(context)
                                              .textTheme
                                              .bodySmall),
                                    if (isDemo)
                                      const Text(
                                          'PEDIDO FICTÍCIO · sem cobrança real',
                                          style: TextStyle(
                                              color: Colors.deepOrange,
                                              fontWeight: FontWeight.w700)),
                                    if (order['paymentProvider'] == 'offline')
                                      OfflinePaymentNotice(
                                        paymentStatus: order['paymentStatus']
                                                ?.toString() ??
                                            'PENDING',
                                        orderStatus: status,
                                      ),
                                    Chip(
                                        avatar:
                                            Icon(_statusIcon(status), size: 18),
                                        label: Text(unpaidPickupLabel(order) ??
                                            orderStatusLabel(status,
                                                delivery:
                                                    order['fulfillment'] ==
                                                        'DELIVERY',
                                                local: isLocalDelivery(order))),
                                        visualDensity: VisualDensity.compact),
                                    Text(
                                        'Total: ${_money.format(total)}  •  ${order['fulfillment'] == 'DELIVERY' ? 'Entrega' : 'Retirada na loja'}'),
                                    if ((int.tryParse(
                                                '${order['discountCents']}') ??
                                            0) >
                                        0)
                                      Text(
                                          'Cupom ${order['couponCode'] ?? ''}: desconto de ${_money.format((int.tryParse('${order['discountCents']}') ?? 0) / 100)}'),
                                    OrderReceivingInfo(order: order),
                                    if (order['fulfillment'] == 'DELIVERY' &&
                                        !isLocalDelivery(order)) ...[
                                      Text(
                                          'Transportadora: ${order['shippingCarrier'] ?? 'A definir'}'),
                                      if (order['shipment'] is Map &&
                                          (order['shipment']
                                                  as Map)['trackingCode'] !=
                                              null)
                                        Text(
                                            'Rastreio: ${(order['shipment'] as Map)['trackingCode']} (informado pela loja)'),
                                    ],
                                    for (final line
                                        in (order['items'] as List? ??
                                            const []))
                                      Text(
                                          '${line['quantity']}× ${line['name']} · ${(line['attributes'] as Map?)?['color'] ?? ''} · ${(line['attributes'] as Map?)?['size'] ?? ''}',
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis),
                                    Wrap(spacing: 8, children: [
                                      TextButton.icon(
                                          onPressed: () =>
                                              showRailwayOrderTimeline(context,
                                                  orderId:
                                                      order['id'].toString(),
                                                  admin: false),
                                          icon: const Icon(Icons.timeline),
                                          label: const Text('Acompanhar')),
                                      TextButton.icon(
                                          onPressed: () =>
                                              context.push('/support'),
                                          icon: const Icon(
                                              Icons.support_agent_outlined),
                                          label:
                                              const Text('Preciso de ajuda')),
                                    ]),
                                    if (cases.isNotEmpty)
                                      for (final ticket in cases.take(2))
                                        Padding(
                                            padding: const EdgeInsets.symmetric(
                                                vertical: 3),
                                            child: Text(
                                                'Pós-venda: ${afterSalesStatusNames[ticket['status']] ?? ticket['status']}'
                                                ' • ${afterSalesTypes[ticket['type']] ?? ticket['type']}',
                                                style: Theme.of(context)
                                                    .textTheme
                                                    .bodySmall)),
                                    if (cases.isNotEmpty &&
                                        cases.first['staffNotes'] != null &&
                                        cases.first['staffNotes']
                                            .toString()
                                            .trim()
                                            .isNotEmpty)
                                      Text(
                                          'Resposta da loja: ${cases.first['staffNotes']}',
                                          style: Theme.of(context)
                                              .textTheme
                                              .bodySmall),
                                    if (!active &&
                                        availableAfterSalesTypes(status)
                                            .isNotEmpty)
                                      OutlinedButton.icon(
                                          onPressed: () async {
                                            final created =
                                                await showCreateAfterSalesRequest(
                                                    context,
                                                    orderId:
                                                        order['id'].toString(),
                                                    orderStatus: status);
                                            if (created && mounted) {
                                              await _refresh();
                                            }
                                          },
                                          icon: const Icon(
                                              Icons.assignment_outlined),
                                          label: const Text(
                                              'Cancelamento / pós-venda')),
                                    if (!isDemo &&
                                        order['paymentProvider'] != 'offline' &&
                                        status == 'PENDING_PAYMENT' &&
                                        !active)
                                      TextButton.icon(
                                          onPressed: () async {
                                            try {
                                              final url = checkoutUrl ??
                                                  await _repo.retryCheckout(
                                                      order['id'].toString());
                                              final uri = Uri.tryParse(url);
                                              if (uri == null ||
                                                  uri.scheme != 'https' ||
                                                  !uri.hasAuthority ||
                                                  uri.userInfo.isNotEmpty) {
                                                throw StateError(
                                                    'Link indisponível');
                                              }
                                              final opened = await launchUrl(
                                                  uri,
                                                  mode: LaunchMode
                                                      .externalApplication);
                                              if (!opened) {
                                                throw StateError(
                                                    'Pagamento não aberto');
                                              }
                                            } catch (_) {
                                              if (context.mounted) {
                                                ScaffoldMessenger.of(context)
                                                    .showSnackBar(SnackBar(
                                                        content: const Text(
                                                            'Seu pedido está salvo. Não foi possível abrir o pagamento; tente novamente.')));
                                              }
                                            }
                                          },
                                          icon: const Icon(Icons.open_in_new),
                                          label:
                                              const Text('Retomar pagamento')),
                                    if (order['refundOperation'] is Map) ...[
                                      Text(
                                          order['refundOperation']['status'] ==
                                                  'CONFIRMED'
                                              ? 'Reembolso integral confirmado pelo Mercado Pago.'
                                              : 'Reembolso em conferência. Aguarde a loja antes de solicitar outra operação.',
                                          style: Theme.of(context)
                                              .textTheme
                                              .bodySmall),
                                    ],
                                    if (status == 'PAYMENT_REVIEW')
                                      const Text(
                                          'Pagamento em análise. Contate a loja; não faça um segundo pagamento.'),
                                  ])));
                    },
                  ));
            }),
      );

  IconData _statusIcon(String status) => switch (status) {
        'PENDING_PAYMENT' => Icons.schedule,
        'PAID' => Icons.verified_outlined,
        'PREPARING' => Icons.inventory_2_outlined,
        'SHIPPED' => Icons.local_shipping_outlined,
        'DELIVERED' => Icons.check_circle_outline,
        'REFUNDED' => Icons.currency_exchange,
        'CANCELED' => Icons.cancel_outlined,
        'PAYMENT_REVIEW' => Icons.info_outline,
        _ => Icons.receipt_long_outlined,
      };
}
