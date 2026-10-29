import 'package:loja_roupas/router/app_back_button.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../../data/repositories/railway_coupon_repository.dart';

class RailwayCouponsScreen extends StatefulWidget {
  const RailwayCouponsScreen({super.key});
  @override State<RailwayCouponsScreen> createState()=>_RailwayCouponsScreenState();
}
class _RailwayCouponsScreenState extends State<RailwayCouponsScreen> {
  final repo=RailwayCouponRepository();
  late Future<List<Map<String,dynamic>>> _future;
  final money=NumberFormat.currency(locale:'pt_BR',symbol:'R\$');
  @override
  void initState() {
    super.initState();
    _future = repo.list();
  }

  void _reload() {
    if (!mounted) return;
    final next = repo.list();
    setState(() {
      _future = next;
    });
  }
  Future<void> _create() async {
    final code=TextEditingController(),amount=TextEditingController(),min=TextEditingController(text:'0'),uses=TextEditingController(text:'50');
    var type='PERCENT'; var maxPer=1; DateTime? expiry;
    final accepted=await showDialog<bool>(context:context,builder:(ctx)=>StatefulBuilder(builder:(ctx,setDialog)=>AlertDialog(
      title:const Text('Novo cupom'),scrollable:true,content:Column(mainAxisSize:MainAxisSize.min,children:[
      TextField(controller:code,textCapitalization:TextCapitalization.characters,decoration:const InputDecoration(labelText:'Código (ex.: BEMVINDO10)')),
      DropdownButtonFormField<String>(initialValue:type,items:const [DropdownMenuItem(value:'PERCENT',child:Text('Percentual (%)')),
        DropdownMenuItem(value:'FIXED',child:Text('Valor fixo (R\$)'))],onChanged:(v)=>setDialog(()=>type=v??type)),
      TextField(controller:amount,keyboardType:TextInputType.number,decoration:InputDecoration(labelText:type=='PERCENT'?'Percentual (ex.: 10)':'Valor em reais (ex.: 15,50)')),
      TextField(controller:min,keyboardType:TextInputType.number,decoration:const InputDecoration(labelText:'Mínimo da compra (R\$)')),
      TextField(controller:uses,keyboardType:TextInputType.number,decoration:const InputDecoration(labelText:'Limite total de usos (vazio = ilimitado)')),
      DropdownButtonFormField<int>(initialValue:maxPer,items:[for(final v in [1,2,3,5,10])DropdownMenuItem(value:v,child:Text('Até $v uso(s) por cliente'))],
        onChanged:(v)=>setDialog(()=>maxPer=v??1)),
      TextButton.icon(icon:const Icon(Icons.event),label:Text(expiry==null?'Definir validade (opcional)':'Válido até ${DateFormat('dd/MM/yyyy').format(expiry!)}'),
        onPressed:() async {
          final chosen=await showDatePicker(context:ctx,firstDate:DateTime.now(),
            lastDate:DateTime.now().add(const Duration(days:3650)),initialDate:expiry??DateTime.now());
          if(chosen!=null)setDialog(()=>expiry=DateTime(chosen.year,chosen.month,chosen.day,23,59,59));
        }),
      const SizedBox(height:8),const Text('Cupons não realizam pagamentos; o servidor valida os limites.',style:TextStyle(fontSize:12)),
    ]),actions:[TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Cancelar')),
      FilledButton(onPressed:()=>Navigator.pop(ctx,true),child:const Text('Criar'))])));
    if(accepted!=true){code.dispose();amount.dispose();min.dispose();uses.dispose();return;}
    int? cents(String x){final n=double.tryParse(x.trim().replaceAll(',','.'));return n==null||!n.isFinite?null:(n*100).round();}
    final value=double.tryParse(amount.text.trim().replaceAll(',','.'));
    final minVal=cents(min.text),limit=uses.text.trim().isEmpty?null:int.tryParse(uses.text.trim());
    final raw=type=='PERCENT' ? ((value??0)*100).round():cents(amount.text);
    if(value==null || raw==null || raw<=0 || (type=='PERCENT'&&raw>10000)||minVal==null||minVal<0||
      (uses.text.trim().isNotEmpty&&(limit==null||limit<=0))||!RegExp(r'^[A-Za-z0-9_-]{3,24}$').hasMatch(code.text.trim())) {
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Revise os valores e o código do cupom.')));
      code.dispose();amount.dispose();min.dispose();uses.dispose();return;
    }
    try {await repo.create(code:code.text,type:type,amount:raw,minCents:minVal,maxUses:limit,maxPerCustomer:maxPer,expiresAt:expiry);
      if(mounted){_reload();ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Cupom criado.')));}}
    catch(e){if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text('$e')));}
    finally{code.dispose();amount.dispose();min.dispose();uses.dispose();}
  }
  @override Widget build(BuildContext context)=>Scaffold(appBar:AppBar(leading: const AppBackButton(fallbackLocation: '/admin'), title:const Text('Cupons da loja')),
    floatingActionButton:FloatingActionButton.extended(onPressed:_create,icon:const Icon(Icons.add),label:const Text('Novo cupom')),
    body:FutureBuilder<List<Map<String,dynamic>>>(future:_future,builder:(ctx,s){
      if(s.hasError)return Center(child:Text('Não foi possível carregar: ${s.error}'));
      if(!s.hasData)return const Center(child:CircularProgressIndicator());
      if(s.data!.isEmpty)return const Center(child:Text('Nenhum cupom cadastrado.'));
      return ListView.builder(padding:const EdgeInsets.fromLTRB(12,12,12,90),itemCount:s.data!.length,itemBuilder:(ctx,i){
        final c=s.data![i],active=c['active']==true,percent=c['discountType']=='PERCENT';
        final label=percent?'${((c['amount'] as num)/100).toStringAsFixed(2)}%':money.format((c['amount'] as num)/100);
        return Card(child:ListTile(title:Text('${c['code']} · $label'),
          subtitle:Text('Utilizações: ${c['usedCount']}/${c['maxUses']??'∞'} · Mínimo: ${money.format((c['minimumSubtotalCents'] as num)/100)}'),
          trailing:Switch(value:active,onChanged:(v) async {try{await repo.setActive('${c['id']}',v);_reload();}
            catch(e){if(context.mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text('$e')));}})));
      });
    }));
}
