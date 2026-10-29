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

class RailwayOrdersScreen extends ConsumerStatefulWidget {
  const RailwayOrdersScreen({super.key});
  @override
  ConsumerState<RailwayOrdersScreen> createState() => _RailwayOrdersScreenState();
}
class _RailwayOrdersScreenState extends ConsumerState<RailwayOrdersScreen> {
  final _repo=RailwayOrderRepository();
  late Future<List<Map<String,dynamic>>> _orders;
  StreamSubscription<int>? _changes;
  @override
  void initState() {
    super.initState();
    _reload();
    _changes=LojaApi.instance.orderChanges(admin:false).listen((_) {
      if (mounted) setState(_reload);
    });
  }
  @override
  void dispose() { _changes?.cancel(); super.dispose(); }
  void _reload() { _orders=_repo.myOrders(); }
  Future<void> _refresh() async { setState(_reload); await _orders; }
  final _money=NumberFormat.currency(locale:'pt_BR',symbol:'R\$');

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(leading: const AppBackButton(fallbackLocation: '/profile'), title:const Text('Meus pedidos'),actions:[IconButton(
      tooltip:'Atualizar pedidos',onPressed:() { _refresh(); },icon:const Icon(Icons.refresh))]),
    body:FutureBuilder<List<Map<String,dynamic>>>(future:_orders,builder:(context,snapshot){
      if(snapshot.connectionState!=ConnectionState.done) return const Center(child:Column(mainAxisSize: MainAxisSize.min,children:[CircularProgressIndicator(),SizedBox(height:14),Text('Carregando seus pedidos…')]));
      if(snapshot.hasError) return EmptyState(
        icon: Icons.wifi_off_outlined,
        title: 'Pedidos indisponíveis',
        subtitle: 'Não foi possível consultar os pedidos agora. Verifique sua conexão.',
        buttonLabel: 'Tentar novamente',
        onButtonPressed: () { setState(_reload); },
      );
      final orders=snapshot.data??[];
      if(orders.isEmpty) return EmptyState(
        icon: Icons.receipt_long_outlined,
        title: 'Você ainda não fez pedidos',
        subtitle: 'Quando sua primeira compra for registrada, ela aparecerá aqui.',
        buttonLabel: 'Explorar produtos',
        onButtonPressed: () => context.go('/'),
      );
      return RefreshIndicator(onRefresh:_refresh,child:ListView.builder(
        physics:const AlwaysScrollableScrollPhysics(),itemCount:orders.length,itemBuilder:(context,index){
          final order=orders[index];
          final status=order['status']?.toString()??'PENDING_PAYMENT';
          final isDemo=order['isDemo']==true;
          final total=(int.tryParse(order['totalCents'].toString())??0)/100;
          final checkoutUrl=order['checkoutUrl']?.toString();
          final cases=(order['afterSalesRequests'] as List? ?? const [])
              .whereType<Map<String,dynamic>>().toList();
          final active=cases.any((c)=>activeAfterSalesStatuses.contains(c['status']));
          return Card(margin:const EdgeInsets.symmetric(horizontal:12,vertical:6),child:Padding(
            padding:const EdgeInsets.all(12),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
              Text('Pedido #${order['id'].toString().length > 8 ? order['id'].toString().substring(0,8) : order['id']}',
                  style:Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 5),
              if(isDemo) const Text('PEDIDO FICTÍCIO · sem cobrança real',
                style: TextStyle(color: Colors.deepOrange,fontWeight: FontWeight.w700)),
              if(order['paymentProvider']=='offline') const Text('Pagamento combinado com a loja — aguardando conferência manual.',
                style: TextStyle(fontWeight: FontWeight.w600)),
              Chip(avatar: Icon(_statusIcon(status), size: 18),
                label: Text(_label(status, delivery: order['fulfillment']=='DELIVERY')),
                visualDensity: VisualDensity.compact),
              Text('Total: ${_money.format(total)}  •  ${order['fulfillment']=='DELIVERY'?'Entrega':'Retirada na loja'}'),
              if ((int.tryParse('${order['discountCents']}')??0)>0)
                Text('Cupom ${order['couponCode']??''}: desconto de ${_money.format((int.tryParse('${order['discountCents']}')??0)/100)}'),
              if(order['fulfillment']=='DELIVERY') ...[
                Text('Transportadora: ${order['shippingCarrier'] ?? 'A definir'}'),
                if(order['shipment'] is Map && (order['shipment'] as Map)['trackingCode'] != null)
                  Text('Rastreio: ${(order['shipment'] as Map)['trackingCode']} (informado pela loja)'),
              ],
              for(final line in (order['items'] as List? ?? const []))
                Text('${line['quantity']}× ${line['name']}',maxLines:2,overflow:TextOverflow.ellipsis),
              Wrap(spacing: 8, children: [
                TextButton.icon(onPressed: () => showRailwayOrderTimeline(context,
                    orderId: order['id'].toString(), admin: false),
                    icon: const Icon(Icons.timeline),label: const Text('Acompanhar')),
                TextButton.icon(onPressed: () => context.push('/support'),
                    icon: const Icon(Icons.support_agent_outlined),
                    label: const Text('Preciso de ajuda')),
              ]),
              if(cases.isNotEmpty) for (final ticket in cases.take(2))
                Padding(padding: const EdgeInsets.symmetric(vertical: 3),
                  child: Text('Pós-venda: ${afterSalesStatusNames[ticket['status']] ?? ticket['status']}'
                    ' • ${afterSalesTypes[ticket['type']] ?? ticket['type']}',
                    style: Theme.of(context).textTheme.bodySmall)),
              if(cases.isNotEmpty && cases.first['staffNotes'] != null &&
                  cases.first['staffNotes'].toString().trim().isNotEmpty)
                Text('Resposta da loja: ${cases.first['staffNotes']}',
                    style: Theme.of(context).textTheme.bodySmall),
              if(!active && availableAfterSalesTypes(status).isNotEmpty)
                OutlinedButton.icon(onPressed: () async {
                  final created=await showCreateAfterSalesRequest(context,
                    orderId: order['id'].toString(), orderStatus: status);
                  if(created && mounted) await _refresh();
                }, icon: const Icon(Icons.assignment_outlined),
                  label: const Text('Cancelamento / pós-venda')),
              if(!isDemo && order['paymentProvider'] != 'offline' && status=='PENDING_PAYMENT' && !active) TextButton.icon(
                onPressed:() async {
                  try {
                    final url=checkoutUrl ?? await _repo.retryCheckout(order['id'].toString());
                    final uri=Uri.tryParse(url);
                    if(uri!=null && uri.scheme=='https') {
                      await launchUrl(uri,mode:LaunchMode.externalApplication);
                    }
                  } catch(e) {
                    if(context.mounted) ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content:Text('Pagamento indisponível: $e')));
                  }
                },
                icon:const Icon(Icons.open_in_new),label:const Text('Retomar pagamento')),
              if(order['refundOperation'] is Map) ...[
                Text(order['refundOperation']['status']=='CONFIRMED'
                    ? 'Reembolso integral confirmado pelo Mercado Pago.'
                    : 'Reembolso em conferência. Aguarde a loja antes de solicitar outra operação.',
                  style:Theme.of(context).textTheme.bodySmall),
              ],
              if(status=='PAYMENT_REVIEW') const Text(
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

  String _label(String v, {bool delivery=false}) => switch(v){
    'PENDING_PAYMENT'=>'Aguardando pagamento', 'PAID'=>'Pago',
    'PREPARING'=>'Preparando','SHIPPED'=>delivery?'Envio postado':'Pronto para retirada',
    'DELIVERED'=>delivery?'Entregue':'Concluído','CANCELED'=>'Cancelado',
    'REFUNDED'=>'Reembolsado','PAYMENT_REVIEW'=>'Pagamento em revisão',_=>v,
  };
}
