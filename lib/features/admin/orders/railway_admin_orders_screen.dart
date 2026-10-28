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
  final _money=NumberFormat.currency(locale:'pt_BR',symbol:'R\$');
  @override
  void initState(){
    super.initState(); _fetch();
    RailwayAfterSalesRepository().canReview().then((value) {
      if(mounted) setState(() => _canReview = value);
    }).catchError((Object _) { /* backend autoriza cada ação */ });
    _changes=LojaApi.instance.orderChanges(admin:true).listen((_) {
      if(mounted)setState(_fetch);
    });
  }
  @override
  void dispose(){_changes?.cancel();super.dispose();}
  void _fetch(){_items=_repo.adminOrders();}
  Future<void> _refresh()async{setState(_fetch);await _items;}
  Future<void> _advance(String id,String status) async {
    setState(()=>_busy=id);
    try{await _repo.changeStatus(id,status);if(mounted)await _refresh();}
    catch(e){if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text('$e')));}
    finally{if(mounted)setState(()=>_busy=null);}
  }
  @override
  Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Pedidos da loja'),actions:[IconButton(
      onPressed:() { _refresh(); },icon:const Icon(Icons.refresh))]),
    body:FutureBuilder<List<Map<String,dynamic>>>(future:_items,builder:(context,s){
      if(s.connectionState!=ConnectionState.done)return const Center(child:CircularProgressIndicator());
      if(s.hasError)return Center(child:Text('Erro ao carregar pedidos: ${s.error}'));
      final orders=s.data??[];
      if(orders.isEmpty)return const Center(child:Text('Ainda não há pedidos.'));
      return RefreshIndicator(onRefresh:_refresh,child:ListView.builder(
        physics:const AlwaysScrollableScrollPhysics(),itemCount:orders.length,itemBuilder:(context,i){
          final o=orders[i];final status=o['status']?.toString()??'';
          final next=switch(status){'PAID'=>'PREPARING','PREPARING'=>'SHIPPED','SHIPPED'=>'DELIVERED',_=>null};
          final total=(int.tryParse(o['totalCents'].toString())??0)/100;
          final cases=(o['afterSalesRequests'] as List? ?? const [])
              .whereType<Map<String,dynamic>>().toList();
          final pending=cases.any((c)=>activeAfterSalesStatuses.contains(c['status']) &&
              (c['type']=='CANCEL' || c['type']=='RETURN'));
          return Card(margin:const EdgeInsets.all(8),child:Padding(padding:const EdgeInsets.all(12),child:
            Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
              Text('Pedido ${o['id'].toString().substring(0,8)} • ${_money.format(total)}',
                  style:Theme.of(context).textTheme.titleMedium),
              Text('Status: $status'),
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
                  child: Row(children: [
                    Expanded(child: Text('Pós-venda: ${afterSalesTypes[request['type']] ?? request['type']}'
                      ' • ${afterSalesStatusNames[request['status']] ?? request['status']}'
                      '\nMotivo: ${request['reason']}')),
                    if(_canReview && activeAfterSalesStatuses.contains(request['status']))
                      TextButton(onPressed: _busy != null ? null : () async {
                        final changed=await showReviewAfterSalesRequest(context,request);
                        if(changed && mounted) await _refresh();
                      }, child: const Text('Analisar')),
                  ])),
              if(pending) const Padding(padding: EdgeInsets.symmetric(vertical: 4),
                  child: Text('Solicitação de cancelamento/devolução pendente. '
                      'Resolva antes de avançar o pedido.')),
              if(status=='PAYMENT_REVIEW')const Text('ALERTA: pagamento precisa de revisão manual.'),
              if(next!=null && !pending)FilledButton(
                onPressed:_busy==o['id']?null:()=>_advance(o['id'].toString(),next),
                child:Text(switch(next){'PREPARING'=>'Iniciar preparação','SHIPPED'=>'Pronto para retirada',_=>'Concluir pedido'})),
            ])));
        }));
    }),
  );
}
