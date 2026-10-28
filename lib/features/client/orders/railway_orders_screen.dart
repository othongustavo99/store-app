import 'dart:async';
import 'package:flutter/material.dart';
import '../../../core/network/loja_api.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../data/repositories/railway_order_repository.dart';

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
    appBar: AppBar(title:const Text('Meus pedidos'),actions:[IconButton(
      tooltip:'Atualizar pedidos',onPressed:() { _refresh(); },icon:const Icon(Icons.refresh))]),
    body:FutureBuilder<List<Map<String,dynamic>>>(future:_orders,builder:(context,snapshot){
      if(snapshot.connectionState!=ConnectionState.done) return const Center(child:CircularProgressIndicator());
      if(snapshot.hasError) return Center(child:Text('Não foi possível consultar pedidos: ${snapshot.error}'));
      final orders=snapshot.data??[];
      if(orders.isEmpty) return const Center(child:Text('Nenhum pedido registrado ainda.'));
      return RefreshIndicator(onRefresh:_refresh,child:ListView.builder(
        physics:const AlwaysScrollableScrollPhysics(),itemCount:orders.length,itemBuilder:(context,index){
          final order=orders[index];
          final status=order['status']?.toString()??'PENDING_PAYMENT';
          final total=(int.tryParse(order['totalCents'].toString())??0)/100;
          final checkoutUrl=order['checkoutUrl']?.toString();
          return Card(margin:const EdgeInsets.symmetric(horizontal:12,vertical:6),child:Padding(
            padding:const EdgeInsets.all(12),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
              Text('Pedido ${order['id'].toString().substring(0,8)}',style:Theme.of(context).textTheme.titleMedium),
              Text(_label(status)),
              Text('Total: ${_money.format(total)}  •  Retirada na loja'),
              for(final line in (order['items'] as List? ?? const []))
                Text('${line['quantity']}× ${line['name']}',maxLines:2,overflow:TextOverflow.ellipsis),
              if(status=='PENDING_PAYMENT') TextButton.icon(
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
              if(status=='PAYMENT_REVIEW') const Text(
                'Pagamento em análise. Contate a loja; não faça um segundo pagamento.'),
            ])));
        },
      ));
    }),
  );

  String _label(String v) => switch(v){
    'PENDING_PAYMENT'=>'Aguardando pagamento', 'PAID'=>'Pago',
    'PREPARING'=>'Preparando','SHIPPED'=>'Pronto para retirada',
    'DELIVERED'=>'Concluído','CANCELED'=>'Cancelado',
    'REFUNDED'=>'Reembolsado','PAYMENT_REVIEW'=>'Pagamento em revisão',_=>v,
  };
}
