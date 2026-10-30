import '../../client/orders/widgets/order_receiving_info.dart';
import '../../client/orders/widgets/offline_payment_notice.dart';
import 'package:loja_roupas/router/app_back_button.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import '../../../core/network/loja_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:go_router/go_router.dart';
import '../../support/railway_order_timeline_dialog.dart';
import '../../../data/repositories/railway_order_repository.dart';
import '../../../data/repositories/railway_after_sales_repository.dart';
import '../../support/railway_after_sales_dialogs.dart';
import '../../support/railway_refund_dialog.dart';
import '../shipping/railway_shipment_dialog.dart';

class RailwayAdminOrdersScreen extends ConsumerStatefulWidget {
  const RailwayAdminOrdersScreen(
      {super.key,
      this.repository,
      this.afterSales,
      this.refunds,
      this.changes});
  final RailwayOrderRepository? repository;
  final RailwayAfterSalesRepository? afterSales;
  final RailwayRefundRepository? refunds;
  final Stream<int>? changes;
  @override
  ConsumerState<RailwayAdminOrdersScreen> createState() =>
      _RailwayAdminOrdersScreenState();
}

class _RailwayAdminOrdersScreenState
    extends ConsumerState<RailwayAdminOrdersScreen> {
  late final _repo = widget.repository ?? RailwayOrderRepository();
  late final _afterSales = widget.afterSales ?? RailwayAfterSalesRepository();
  late final _refunds = widget.refunds ?? RailwayRefundRepository();
  final _search = TextEditingController();
  String _filter = 'ALL';
  late Future<List<Map<String, dynamic>>> _items;
  StreamSubscription<int>? _changes;
  String? _busy;
  bool _canReview = false;
  bool _canRefund = false;
  bool _refundsEnabled = false;
  Map<String, Map<String, dynamic>> _refundByCase = {};
  final _money = NumberFormat.currency(locale: 'pt_BR', symbol: 'R\$');
  @override
  void initState() {
    super.initState();
    _fetch();
    _afterSales.canReview().then((value) {
      if (mounted) setState(() => _canReview = value);
    }).catchError((Object _) {/* backend autoriza cada ação */});
    _reloadRefunds();
    _refunds.canRefund().then((value) {
      if (mounted) setState(() => _canRefund = value);
    }).catchError((Object _) {});
    _changes = (widget.changes ?? LojaApi.instance.orderChanges(admin: true))
        .listen((_) {
      if (mounted && _busy == null) setState(_fetch);
    }, onError: (Object _) {/* A atualização manual continua disponível. */});
  }

  @override
  void dispose() {
    _changes?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _fetch() {
    _items = _repo.adminOrders();
  }

  Future<void> _reloadRefunds() async {
    try {
      final r = await _refunds.list();
      final entries = <String, Map<String, dynamic>>{};
      for (final item in (r['refunds'] as List? ?? const [])) {
        if (item is Map) {
          final record = Map<String, dynamic>.from(item);
          entries[record['caseId'].toString()] = record;
        }
      }
      if (mounted) {
        setState(() {
          _refundByCase = entries;
          _refundsEnabled = r['enabled'] == true;
        });
      }
    } catch (_) {/* O backend também valida permissão de todas as operações. */}
  }

  Future<void> _refresh() async {
    setState(_fetch);
    try {
      await Future.wait([_items, _reloadRefunds()]);
    } catch (_) {/* A tela mostra a nova tentativa. */}
  }

  Future<void> _advance(String id, String status) async {
    if (_busy != null || !_canReview) return;
    if (status == 'DELIVERED') {
      final accepted = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
                  title: const Text('Concluir recebimento do pedido?'),
                  content: const Text(
                      'Confirme somente se o cliente já recebeu as peças. Esta ação registra a retirada ou entrega como concluída.'),
                  actions: [
                    TextButton(
                        onPressed: () => Navigator.pop(ctx, false),
                        child: const Text('Voltar')),
                    FilledButton(
                        onPressed: () => Navigator.pop(ctx, true),
                        child: const Text('Cliente recebeu'))
                  ]));
      if (accepted != true || !mounted) return;
    }
    setState(() => _busy = id);
    try {
      await _repo.changeStatus(id, status);
      if (mounted) await _refresh();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _confirmOffline(Map<String, dynamic> order) async {
    if (_busy != null || !_canReview) return;
    final orderId = order['id'].toString();
    final accepted = await showDialog<bool>(
        context: context,
        builder: (dialogContext) => AlertDialog(
                title: const Text('Confirmar pagamento local?'),
                content: Text(
                    'Pedido #${orderId.substring(0, orderId.length < 8 ? orderId.length : 8)} · ${_money.format((int.tryParse('${order['totalCents']}') ?? 0) / 100)}\n\nSó confirme depois de conferir o recebimento fora do aplicativo. '
                    'WhatsApp e comprovantes enviados por clientes não garantem que o dinheiro entrou na conta.'),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(dialogContext, false),
                      child: const Text('Voltar')),
                  FilledButton(
                      onPressed: () => Navigator.pop(dialogContext, true),
                      child: const Text('Conferi o recebimento'))
                ]));
    if (accepted != true || !mounted) return;
    setState(() => _busy = orderId);
    try {
      await _repo.confirmOffline(orderId);
      if (mounted) await _refresh();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _preparePickup(Map<String, dynamic> order, String stage) async {
    if (_busy != null || !_canReview) return;
    if (stage == 'READY') {
      final accepted = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
                  title: const Text('Pedido pronto para retirada?'),
                  content: const Text(
                      'As peças devem estar separadas para o cliente. O pagamento continuará pendente e o estoque reservado.'),
                  actions: [
                    TextButton(
                        onPressed: () => Navigator.pop(ctx, false),
                        child: const Text('Voltar')),
                    FilledButton(
                        onPressed: () => Navigator.pop(ctx, true),
                        child: const Text('Está separado'))
                  ]));
      if (accepted != true || !mounted) return;
    }
    setState(() => _busy = '${order['id']}');
    try {
      await _repo.preparePickup('${order['id']}', stage);
      if (mounted) await _refresh();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  bool _matches(Map<String, dynamic> order) {
    final status = '${order['status']}';
    final unpaid = unpaidPickupOrder(order) && pickupReservationValid(order);
    final stage = order['pickupPreparation'] ?? 'NONE';
    final matches = switch (_filter) {
      'PENDING_PAYMENT' => status == 'PENDING_PAYMENT',
      'TO_PREPARE' => status == 'PAID' || unpaid && stage == 'NONE',
      'PREPARING' => status == 'PREPARING' || unpaid && stage == 'PREPARING',
      'READY' => status == 'SHIPPED' || unpaid && stage == 'READY',
      'COMPLETED' => ['DELIVERED', 'CANCELED', 'REFUNDED'].contains(status),
      _ => true
    };
    final query = _search.text.trim().toLowerCase();
    final contact = order['customerContact'] as Map? ?? {};
    final text = [
      '${order['id']}',
      '${contact['name']}',
      '${contact['phone']}',
      for (final line in order['items'] as List? ?? [])
        '${line['name']} ${line['sku']}'
    ].join(' ').toLowerCase();
    return matches && (query.isEmpty || text.contains(query));
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
            leading: const AppBackButton(fallbackLocation: '/admin'),
            title: const Text('Pedidos da loja'),
            actions: [
              IconButton(
                  onPressed: () {
                    _refresh();
                  },
                  icon: const Icon(Icons.refresh))
            ]),
        body: FutureBuilder<List<Map<String, dynamic>>>(
            future: _items,
            builder: (context, s) {
              if (s.connectionState != ConnectionState.done) {
                return const Center(child: CircularProgressIndicator());
              }
              if (s.hasError) {
                return Center(
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Text('Não foi possível carregar os pedidos.'),
                  TextButton(
                      onPressed: _refresh,
                      child: const Text('Tentar novamente'))
                ]));
              }
              final allOrders = s.data ?? [];
              final orders = allOrders.where(_matches).toList();

              return Column(children: [
                Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(children: [
                      TextField(
                          controller: _search,
                          onChanged: (_) => setState(() {}),
                          decoration: const InputDecoration(
                              labelText: 'Buscar pedido, cliente ou produto',
                              prefixIcon: Icon(Icons.search))),
                      const SizedBox(height: 10),
                      SingleChildScrollView(
                          scrollDirection: Axis.horizontal,
                          child: Row(children: [
                            for (final pair in const {
                              'ALL': 'Todos',
                              'PENDING_PAYMENT': 'Pagamento pendente',
                              'TO_PREPARE': 'A preparar',
                              'PREPARING': 'Em preparo',
                              'READY': 'Retirada / entrega',
                              'COMPLETED': 'Finalizados'
                            }.entries)
                              Padding(
                                  padding: const EdgeInsets.only(right: 8),
                                  child: ChoiceChip(
                                      label: Text(pair.value),
                                      selected: _filter == pair.key,
                                      onSelected: (_) =>
                                          setState(() => _filter = pair.key))),
                          ])),
                      const SizedBox(height: 6),
                      Text(
                          '${orders.length} de ${allOrders.length} ${allOrders.length == 1 ? 'pedido recente' : 'pedidos recentes'} · até 100 por consulta'),
                    ])),
                if (orders.isEmpty)
                  const Expanded(
                      child:
                          Center(child: Text('Nenhum pedido para esta busca.')))
                else
                  Expanded(
                      child: RefreshIndicator(
                          onRefresh: _refresh,
                          child: ListView.builder(
                              physics: const AlwaysScrollableScrollPhysics(),
                              itemCount: orders.length,
                              itemBuilder: (context, i) {
                                final o = orders[i];
                                final status = o['status']?.toString() ?? '';
                                final delivery = o['fulfillment'] == 'DELIVERY';
                                final local = isLocalDelivery(o);
                                final next = switch (status) {
                                  'PAID' => 'PREPARING',
                                  'PREPARING' => 'SHIPPED',
                                  'SHIPPED' => 'DELIVERED',
                                  _ => null
                                };
                                final total =
                                    (int.tryParse(o['totalCents'].toString()) ??
                                            0) /
                                        100;
                                final cases =
                                    (o['afterSalesRequests'] as List? ??
                                            const [])
                                        .whereType<Map<String, dynamic>>()
                                        .toList();
                                final pending = cases.any((c) =>
                                    activeAfterSalesStatuses
                                        .contains(c['status']) &&
                                    (c['type'] == 'CANCEL' ||
                                        c['type'] == 'RETURN' ||
                                        c['type'] == 'REFUND'));
                                return Card(
                                    margin: const EdgeInsets.all(8),
                                    child: Padding(
                                        padding: const EdgeInsets.all(12),
                                        child: Column(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                  'Pedido ${o['id'].toString().substring(0, 8)} • ${_money.format(total)}',
                                                  style: Theme.of(context)
                                                      .textTheme
                                                      .titleMedium),
                                              Text(unpaidPickupLabel(o) ??
                                                  orderStatusLabel(status,
                                                      delivery: delivery,
                                                      local: local)),
                                              OrderReceivingInfo(order: o),
                                              if ((int.tryParse(
                                                          '${o['discountCents']}') ??
                                                      0) >
                                                  0)
                                                Text(
                                                    'Cupom ${o['couponCode'] ?? ''}: - ${_money.format((int.tryParse('${o['discountCents']}') ?? 0) / 100)}'),
                                              if (o['paymentProvider'] ==
                                                  'offline')
                                                OfflinePaymentNotice(
                                                    paymentStatus:
                                                        '${o['paymentStatus'] ?? 'PENDING'}',
                                                    orderStatus: status),
                                              if (o['isDemo'] == true)
                                                const Text(
                                                    'PEDIDO FICTÍCIO · sem cobrança real',
                                                    style: TextStyle(
                                                        color:
                                                            Colors.deepOrange,
                                                        fontWeight:
                                                            FontWeight.bold)),
                                              if (delivery && !local) ...[
                                                Text(
                                                    'Transportadora: ${o['shippingCarrier'] ?? 'A definir'}'),
                                                if (o['customerContact'] is Map)
                                                  Text(
                                                      'Destino: ${(o['customerContact'] as Map)['street'] ?? ''}, '
                                                      '${(o['customerContact'] as Map)['number'] ?? ''} - '
                                                      '${(o['customerContact'] as Map)['city'] ?? ''} / '
                                                      '${(o['customerContact'] as Map)['state'] ?? ''}, '
                                                      'CEP ${(o['customerContact'] as Map)['postalCode'] ?? ''}'),
                                                if (o['shipment'] is Map)
                                                  Text(
                                                      'Rastreio: ${(o['shipment'] as Map)['trackingCode'] ?? ''} '
                                                      '(informado pela loja)'),
                                              ],
                                              if (o['customerContact'] is Map)
                                                Text(
                                                    'Cliente: ${(o['customerContact'] as Map)['name'] ?? 'Não informado'} • '
                                                    '${(o['customerContact'] as Map)['phone'] ?? 'Sem telefone'}'),
                                              for (final line
                                                  in (o['items'] as List? ??
                                                      const []))
                                                Text(
                                                    '${line['quantity']}× ${line['name']}'),
                                              Wrap(spacing: 8, children: [
                                                TextButton.icon(
                                                    onPressed: () =>
                                                        showRailwayOrderTimeline(
                                                            context,
                                                            orderId: o['id']
                                                                .toString(),
                                                            admin: true),
                                                    icon: const Icon(
                                                        Icons.timeline),
                                                    label: const Text(
                                                        'Histórico')),
                                                TextButton.icon(
                                                    onPressed: () => context
                                                        .push('/admin/support'),
                                                    icon: const Icon(Icons
                                                        .support_agent_outlined),
                                                    label: const Text(
                                                        'Atendimentos')),
                                              ]),
                                              if (cases.isNotEmpty)
                                                for (final request
                                                    in cases.take(3))
                                                  Padding(
                                                      padding: const EdgeInsets
                                                          .symmetric(
                                                          vertical: 3),
                                                      child: Column(
                                                          crossAxisAlignment:
                                                              CrossAxisAlignment
                                                                  .start,
                                                          children: [
                                                            Text(
                                                                'Pós-venda: ${afterSalesTypes[request['type']] ?? request['type']}'
                                                                ' • ${afterSalesStatusNames[request['status']] ?? request['status']}'
                                                                '\nMotivo: ${request['reason']}'),
                                                            if (_refundByCase
                                                                .containsKey(
                                                                    request[
                                                                        'id']))
                                                              Text(
                                                                  'Estorno: ${_refundByCase[request['id']]?['status']}',
                                                                  style: Theme.of(
                                                                          context)
                                                                      .textTheme
                                                                      .bodySmall),
                                                            Wrap(
                                                                spacing: 8,
                                                                children: [
                                                                  if (_canReview &&
                                                                      activeAfterSalesStatuses.contains(
                                                                          request[
                                                                              'status']) &&
                                                                      !_refundByCase.containsKey(
                                                                          request[
                                                                              'id']))
                                                                    TextButton(
                                                                        onPressed: _busy !=
                                                                                null
                                                                            ? null
                                                                            : () async {
                                                                                final changed = await showReviewAfterSalesRequest(context, request);
                                                                                if (changed && mounted) {
                                                                                  await _refresh();
                                                                                }
                                                                              },
                                                                        child: const Text(
                                                                            'Analisar')),
                                                                  if (o[
                                                                              'paymentProvider'] ==
                                                                          'mercadopago' &&
                                                                      _canRefund &&
                                                                      _refundsEnabled &&
                                                                      request['status'] ==
                                                                          'MANUAL_ACTION' &&
                                                                      !_refundByCase.containsKey(
                                                                          request[
                                                                              'id']) &&
                                                                      [
                                                                        'PAID',
                                                                        'PREPARING',
                                                                        'SHIPPED',
                                                                        'DELIVERED'
                                                                      ].contains(
                                                                          status) &&
                                                                      o['paymentStatus'] ==
                                                                          'APPROVED')
                                                                    FilledButton.tonalIcon(
                                                                        onPressed: _busy != null
                                                                            ? null
                                                                            : () async {
                                                                                final amount = int.tryParse(o['totalCents'].toString()) ?? 0;
                                                                                final changed = await showRailwayRefundDialog(context, caseId: request['id'].toString(), amountCents: amount);
                                                                                if (changed && mounted) {
                                                                                  await _refresh();
                                                                                }
                                                                              },
                                                                        icon: const Icon(Icons.currency_exchange),
                                                                        label: const Text('Reembolsar integralmente')),
                                                                  if (o['paymentProvider'] ==
                                                                          'mercadopago' &&
                                                                      _canRefund &&
                                                                      _refundByCase.containsKey(
                                                                          request[
                                                                              'id']) &&
                                                                      _refundByCase[request['id']]
                                                                              ?[
                                                                              'status'] !=
                                                                          'CONFIRMED')
                                                                    OutlinedButton.icon(
                                                                        onPressed: _busy != null
                                                                            ? null
                                                                            : () async {
                                                                                final changed = await showRailwayRefundReconcileDialog(context, request['id'].toString());
                                                                                if (changed && mounted) {
                                                                                  await _refresh();
                                                                                }
                                                                              },
                                                                        icon: const Icon(Icons.sync),
                                                                        label: const Text('Conciliar estorno')),
                                                                ]),
                                                          ])),
                                              if (pending)
                                                const Padding(
                                                    padding:
                                                        EdgeInsets.symmetric(
                                                            vertical: 4),
                                                    child: Text(
                                                        'Solicitação de cancelamento/devolução pendente. '
                                                        'Resolva antes de avançar o pedido.')),
                                              if (_canReview &&
                                                  status == 'PENDING_PAYMENT' &&
                                                  o['paymentProvider'] ==
                                                      'offline' &&
                                                  !pending)
                                                FilledButton.tonalIcon(
                                                    onPressed: _busy != null
                                                        ? null
                                                        : () =>
                                                            _confirmOffline(o),
                                                    icon: const Icon(Icons
                                                        .verified_outlined),
                                                    label: const Text(
                                                        'Confirmar recebimento manual')),
                                              if (_canReview &&
                                                  unpaidPickupOrder(o) &&
                                                  pickupReservationValid(o) &&
                                                  !pending &&
                                                  o['pickupPreparation'] !=
                                                      'READY')
                                                OutlinedButton.icon(
                                                    onPressed: _busy != null
                                                        ? null
                                                        : () => _preparePickup(
                                                            o,
                                                            o['pickupPreparation'] ==
                                                                    'PREPARING'
                                                                ? 'READY'
                                                                : 'PREPARING'),
                                                    icon: const Icon(Icons
                                                        .inventory_2_outlined),
                                                    label: Text(o[
                                                                'pickupPreparation'] ==
                                                            'PREPARING'
                                                        ? 'Pronto · pagamento na retirada'
                                                        : 'Preparar · pagamento na retirada')),
                                              if (unpaidPickupOrder(o) &&
                                                  !pickupReservationValid(o))
                                                const Text(
                                                    'Reserva vencida. Atualize o pedido antes de atender.'),
                                              if (status == 'PAYMENT_REVIEW')
                                                const Text(
                                                    'ALERTA: pagamento precisa de revisão manual.'),
                                              if (_canReview &&
                                                  delivery &&
                                                  !local &&
                                                  !pending &&
                                                  status == 'PREPARING')
                                                OutlinedButton.icon(
                                                    onPressed: _busy != null
                                                        ? null
                                                        : () async {
                                                            final changed =
                                                                await showRailwayShipmentDialog(
                                                                    context,
                                                                    orderId: o[
                                                                            'id']
                                                                        .toString(),
                                                                    alreadyShipped:
                                                                        false);
                                                            if (changed &&
                                                                mounted) {
                                                              await _refresh();
                                                            }
                                                          },
                                                    icon: const Icon(Icons
                                                        .local_shipping_outlined),
                                                    label: const Text(
                                                        'Registrar postagem')),
                                              if (_canReview &&
                                                  delivery &&
                                                  !local &&
                                                  !pending &&
                                                  status == 'SHIPPED')
                                                OutlinedButton.icon(
                                                    onPressed: _busy != null
                                                        ? null
                                                        : () async {
                                                            final changed =
                                                                await showRailwayShipmentDialog(
                                                                    context,
                                                                    orderId: o[
                                                                            'id']
                                                                        .toString(),
                                                                    alreadyShipped:
                                                                        true);
                                                            if (changed &&
                                                                mounted) {
                                                              await _refresh();
                                                            }
                                                          },
                                                    icon: const Icon(Icons
                                                        .task_alt_outlined),
                                                    label: const Text(
                                                        'Confirmar entrega')),
                                              if (_canReview &&
                                                  next != null &&
                                                  !pending &&
                                                  (!delivery ||
                                                      local ||
                                                      next == 'PREPARING'))
                                                FilledButton(
                                                    onPressed: _busy != null
                                                        ? null
                                                        : () => _advance(
                                                            o['id'].toString(),
                                                            next),
                                                    child: Text(switch (next) {
                                                      'PREPARING' =>
                                                        'Iniciar preparação',
                                                      'SHIPPED' => local
                                                          ? 'Saiu para entrega local'
                                                          : 'Pronto para retirada',
                                                      _ => 'Concluir pedido'
                                                    })),
                                            ])));
                              }))),
              ]);
            }),
      );
}
