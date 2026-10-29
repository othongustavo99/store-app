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
  const RailwayAdminOrdersScreen({super.key});
  @override
  ConsumerState<RailwayAdminOrdersScreen> createState()=>_RailwayAdminOrdersScreenState();
}
class _RailwayAdminOrdersScreenState extends ConsumerState<RailwayAdminOrdersScreen> {
  final _repo=RailwayOrderRepository();
  late Future<List<Map<String,dynamic>>> _items;
  StreamSubscription<int>? _changes;
  String? _busy;
  bool _canReview = false;
  bool _canRefund = false;
  bool _refundsEnabled = false;
  Map<String,Map<String,dynamic>> _refundByCase = {};
  final _money=NumberFormat.currency(locale:'pt_BR',symbol:'R\$');
  @override
  void initState(){
    super.initState(); _fetch();
    RailwayAfterSalesRepository().canReview().then((value) {
      if(mounted) setState(() => _canReview = value);
    }).catchError((Object _) { /* backend autoriza cada ação */ });
    _reloadRefunds();
    RailwayRefundRepository().canRefund().then((value) {
      if(mounted)setState(()=>_canRefund=value);
    }).catchError((Object _) {});
    _changes=LojaApi.instance.orderChanges(admin:true).listen((_) {
      if(mounted)setState(_fetch);
    });
  }
  @override
  void dispose(){_changes?.cancel();super.dispose();}
  void _fetch(){_items=_repo.adminOrders();}
  Future<void> _reloadRefunds() async {
    try {
      final r=await RailwayRefundRepository().list();
      final entries=<String,Map<String,dynamic>>{};
      for(final item in (r['refunds'] as List? ?? const [])) {
        if(item is Map){
          final record=Map<String,dynamic>.from(item);
          entries[record['caseId'].toString()]=record;
        }
      }
      if(mounted)setState((){
        _refundByCase=entries;
        _refundsEnabled=r['enabled']==true;
      });
    }catch(_){/* O backend também valida permissão de todas as operações. */}
  }
  Future<void> _refresh()async{
    setState(_fetch);
    await Future.wait([_items, _reloadRefunds()]);
  }
  Future<void> _advance(String id,String status) async {
    setState(()=>_busy=id);
    try{await _repo.changeStatus(id,status);if(mounted)await _refresh();}
    catch(e){if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text('$e')));}
    finally{if(mounted)setState(()=>_busy=null);}
  }
  Future<void> _confirmOffline(String orderId) async {
    final accepted=await showDialog<bool>(context:context,builder:(dialogContext)=>AlertDialog(
      title:const Text('Confirmar pagamento local?'),
      content:const Text('Só confirme depois de conferir o recebimento fora do aplicativo. '
        'WhatsApp e comprovantes enviados por clientes não garantem que o dinheiro entrou na conta.'),
      actions:[TextButton(onPressed:()=>Navigator.pop(dialogContext,false),child:const Text('Voltar')),
        FilledButton(onPressed:()=>Navigator.pop(dialogContext,true),child:const Text('Conferi o recebimento'))]));
    if(accepted!=true) return;
    setState(()=>_busy=orderId);
    try {await _repo.confirmOffline(orderId); if(mounted)await _refresh();}
    catch(e){if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text('$e')));}
    finally{if(mounted)setState(()=>_busy=null);}
  }
  @override
  Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(leading: const AppBackButton(fallbackLocation: '/admin'), title:const Text('Pedidos da loja'),actions:[IconButton(
      onPressed:() { _refresh(); },icon:const Icon(Icons.refresh))]),
    body:FutureBuilder<List<Map<String,dynamic>>>(future:_items,builder:(context,s){
      if(s.connectionState!=ConnectionState.done)return const Center(child:CircularProgressIndicator());
      if(s.hasError)return Center(child:Text('Erro ao carregar pedidos: ${s.error}'));
      final orders=s.data??[];
      if(orders.isEmpty)return const Center(child:Text('Ainda não há pedidos.'));
      return RefreshIndicator(onRefresh:_refresh,child:ListView.builder(
        physics:const AlwaysScrollableScrollPhysics(),itemCount:orders.length,itemBuilder:(context,i){
          final o=orders[i];final status=o['status']?.toString()??'';
          final delivery=o['fulfillment']=='DELIVERY';
          final next=switch(status){'PAID'=>'PREPARING','PREPARING'=>'SHIPPED','SHIPPED'=>'DELIVERED',_=>null};
          final total=(int.tryParse(o['totalCents'].toString())??0)/100;
          final cases=(o['afterSalesRequests'] as List? ?? const [])
              .whereType<Map<String,dynamic>>().toList();
          final pending=cases.any((c)=>activeAfterSalesStatuses.contains(c['status']) &&
              (c['type']=='CANCEL' || c['type']=='RETURN' || c['type']=='REFUND'));
          return Card(margin:const EdgeInsets.all(8),child:Padding(padding:const EdgeInsets.all(12),child:
            Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
              Text('Pedido ${o['id'].toString().substring(0,8)} • ${_money.format(total)}',
                  style:Theme.of(context).textTheme.titleMedium),
              Text('Status: $status'),
              if ((int.tryParse('${o['discountCents']}')??0)>0)
                Text('Cupom ${o['couponCode']??''}: - ${_money.format((int.tryParse('${o['discountCents']}')??0)/100)}'),
              if(o['paymentProvider']=='offline') const Text('PAGAMENTO LOCAL — conferência e eventual devolução são responsabilidade da loja; não usam Mercado Pago.'),
              if(o['isDemo']==true) const Text('PEDIDO FICTÍCIO · sem cobrança real',
                  style: TextStyle(color: Colors.deepOrange,fontWeight: FontWeight.bold)),
              if(delivery) ...[
                Text('Transportadora: ${o['shippingCarrier'] ?? 'A definir'}'),
                if(o['customerContact'] is Map) Text('Destino: ${(o['customerContact'] as Map)['street'] ?? ''}, '
                  '${(o['customerContact'] as Map)['number'] ?? ''} - '
                  '${(o['customerContact'] as Map)['city'] ?? ''} / '
                  '${(o['customerContact'] as Map)['state'] ?? ''}, '
                  'CEP ${(o['customerContact'] as Map)['postalCode'] ?? ''}'),
                if(o['shipment'] is Map) Text('Rastreio: ${(o['shipment'] as Map)['trackingCode'] ?? ''} '
                  '(informado pela loja)'),
              ],
              if(o['customerContact'] is Map)
                Text('Cliente: ${(o['customerContact'] as Map)['name'] ?? 'Não informado'} • '
                    '${(o['customerContact'] as Map)['phone'] ?? 'Sem telefone'}'),
              for(final line in(o['items'] as List? ?? const[])) Text('${line['quantity']}× ${line['name']}'),
              Wrap(spacing: 8, children: [
                TextButton.icon(onPressed: () => showRailwayOrderTimeline(context,
                    orderId: o['id'].toString(), admin: true),
                    icon: const Icon(Icons.timeline),label: const Text('Histórico')),
                TextButton.icon(onPressed: () => context.push('/admin/support'),
                    icon: const Icon(Icons.support_agent_outlined),label: const Text('Atendimentos')),
              ]),
              if(cases.isNotEmpty) for(final request in cases.take(3))
                Padding(padding: const EdgeInsets.symmetric(vertical: 3),
                  child: Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
                    Text('Pós-venda: ${afterSalesTypes[request['type']] ?? request['type']}'
                      ' • ${afterSalesStatusNames[request['status']] ?? request['status']}'
                      '\nMotivo: ${request['reason']}'),
                    if(_refundByCase.containsKey(request['id']))
                      Text('Estorno: ${_refundByCase[request['id']]?['status']}',
                        style:Theme.of(context).textTheme.bodySmall),
                    Wrap(spacing:8,children:[
                      if(_canReview && activeAfterSalesStatuses.contains(request['status']) &&
                          !_refundByCase.containsKey(request['id']))
                        TextButton(onPressed:_busy!=null?null:() async {
                          final changed=await showReviewAfterSalesRequest(context,request);
                          if(changed && mounted)await _refresh();
                        },child:const Text('Analisar')),
                      if(o['paymentProvider']=='mercadopago' && _canRefund && _refundsEnabled && request['status']=='MANUAL_ACTION' &&
                          !_refundByCase.containsKey(request['id']) &&
                          ['PAID','PREPARING','SHIPPED','DELIVERED'].contains(status) &&
                          o['paymentStatus']=='APPROVED')
                        FilledButton.tonalIcon(onPressed:_busy!=null?null:() async {
                          final amount=int.tryParse(o['totalCents'].toString())??0;
                          final changed=await showRailwayRefundDialog(context,
                            caseId:request['id'].toString(),amountCents:amount);
                          if(changed && mounted)await _refresh();
                        },icon:const Icon(Icons.currency_exchange),
                          label:const Text('Reembolsar integralmente')),
                      if(o['paymentProvider']=='mercadopago' && _canRefund && _refundByCase.containsKey(request['id']) &&
                          _refundByCase[request['id']]?['status']!='CONFIRMED')
                        OutlinedButton.icon(onPressed:_busy!=null?null:() async {
                          final changed=await showRailwayRefundReconcileDialog(
                            context,request['id'].toString());
                          if(changed && mounted)await _refresh();
                        },icon:const Icon(Icons.sync),label:const Text('Conciliar estorno')),
                    ]),
                  ])),
              if(pending) const Padding(padding: EdgeInsets.symmetric(vertical: 4),
                  child: Text('Solicitação de cancelamento/devolução pendente. '
                      'Resolva antes de avançar o pedido.')),
              if(status=='PENDING_PAYMENT' && o['paymentProvider']=='offline' && !pending)
                FilledButton.tonalIcon(onPressed:_busy!=null?null:()=>_confirmOffline(o['id'].toString()),
                  icon:const Icon(Icons.verified_outlined),label:const Text('Confirmar recebimento manual')),
              if(status=='PAYMENT_REVIEW')const Text('ALERTA: pagamento precisa de revisão manual.'),
              if(delivery && !pending && status=='PREPARING')
                OutlinedButton.icon(onPressed:_busy!=null?null:() async {
                  final changed=await showRailwayShipmentDialog(context,
                    orderId:o['id'].toString(),alreadyShipped:false);
                  if(changed && mounted)await _refresh();
                },icon:const Icon(Icons.local_shipping_outlined),label:const Text('Registrar postagem')),
              if(delivery && !pending && status=='SHIPPED')
                OutlinedButton.icon(onPressed:_busy!=null?null:() async {
                  final changed=await showRailwayShipmentDialog(context,
                    orderId:o['id'].toString(),alreadyShipped:true);
                  if(changed && mounted)await _refresh();
                },icon:const Icon(Icons.task_alt_outlined),label:const Text('Confirmar entrega')),
              if(next!=null && !pending && (!delivery || next=='PREPARING'))FilledButton(
                onPressed:_busy==o['id']?null:()=>_advance(o['id'].toString(),next),
                child:Text(switch(next){'PREPARING'=>'Iniciar preparação','SHIPPED'=>'Pronto para retirada',_=>'Concluir pedido'})),
            ])));
        }));
    }),
  );
}
