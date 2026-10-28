import 'package:flutter/material.dart';
import '../../../data/repositories/railway_shipping_repository.dart';

class RailwayShippingScreen extends StatefulWidget {
  const RailwayShippingScreen({super.key});
  @override
  State<RailwayShippingScreen> createState() => _RailwayShippingScreenState();
}

class _RailwayShippingScreenState extends State<RailwayShippingScreen> {
  final repo = RailwayShippingRepository();
  final origin = TextEditingController();
  late Future<Map<String, dynamic>> setup;
  bool busy = false;
  @override
  void initState() { super.initState(); reload(); }
  void reload() { setState(() => setup = repo.setup()); }
  @override
  void dispose() { origin.dispose(); super.dispose(); }
  void message(Object e) { if(mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text('$e'))); }

  Future<void> saveOrigin() async {
    final cep=origin.text.replaceAll(RegExp(r'\D'),'');
    if(!RegExp(r'^\d{8}$').hasMatch(cep)) {message('CEP deve ter 8 números.');return;}
    setState(()=>busy=true);
    try { await repo.saveOrigin(cep);message('Origem salva.');reload(); }
    catch(e){message(e);} finally {if(mounted)setState(()=>busy=false);}
  }

  Future<void> editParcel(Map<String,dynamic> item) async {
    final names=['weightKg','widthCm','heightCm','lengthCm'];
    final labels=['Peso embalado (kg)','Largura (cm)','Altura (cm)','Comprimento (cm)'];
    final inputs=[for(final n in names) TextEditingController(text:item[n]?.toString()??'')];
    try {
      final values=await showDialog<Map<String,double>>(context:context,builder:(ctx)=>AlertDialog(
        title:Text('Embalagem • ${item['sku']}'),
        content:SizedBox(width:360,child:SingleChildScrollView(child:Column(
          mainAxisSize:MainAxisSize.min,children:[
            const Text('Informe medidas e peso reais do produto embalado.'),
            for(var i=0;i<inputs.length;i++)Padding(padding:const EdgeInsets.only(top:12),
              child:TextField(controller:inputs[i],keyboardType:const TextInputType.numberWithOptions(decimal:true),
                decoration:InputDecoration(labelText:labels[i]))),
          ]))),
        actions:[TextButton(onPressed:()=>Navigator.pop(ctx),child:const Text('Cancelar')),
          FilledButton(onPressed:(){
            final map=<String,double>{};
            for(var i=0;i<names.length;i++){
              final d=double.tryParse(inputs[i].text.replaceAll(',','.'));
              if(d==null||d<=0){ScaffoldMessenger.of(ctx).showSnackBar(
                const SnackBar(content:Text('Preencha todas as medidas com números positivos.')));return;}
              map[names[i]]=d;
            }
            Navigator.pop(ctx,map);
          },child:const Text('Salvar'))],
      ));
      if(values==null)return;
      setState(()=>busy=true);
      try {await repo.saveParcel(item['id'].toString(),values);message('Embalagem salva.');reload();}
      catch(e){message(e);}finally{if(mounted)setState(()=>busy=false);}
    } finally {for(final input in inputs)input.dispose();}
  }

  @override
  Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Frete e embalagens'),
      actions:[IconButton(onPressed:reload,icon:const Icon(Icons.refresh))]),
    body:FutureBuilder<Map<String,dynamic>>(future:setup,builder:(context,snapshot){
      if(!snapshot.hasData)return Center(child:snapshot.hasError?
        Text('Erro: ${snapshot.error}'):const CircularProgressIndicator());
      final data=snapshot.data!;
      if(origin.text.isEmpty)origin.text=data['originPostalCode']?.toString()??'';
      final items=(data['variants'] as List? ?? const [])
        .map((e)=>Map<String,dynamic>.from(e as Map)).toList();
      final missing=items.where((x)=>x['weightKg']==null).length;
      return ListView(padding:const EdgeInsets.all(18),children:[
        Card(child:Padding(padding:const EdgeInsets.all(16),child:Column(
          crossAxisAlignment:CrossAxisAlignment.start,children:[
            const Text('Origem dos envios',style:TextStyle(fontWeight:FontWeight.bold)),
            const SizedBox(height:8),
            Text(data['enabled']==true?'Integração de cotação habilitada.':
              'Cotação externa desabilitada: configure o Melhor Envio no Railway.'),
            if(data['sandbox']==true)const Text('Sandbox: cotações apenas para testes.',
              style:TextStyle(color:Colors.deepOrange)),
            const SizedBox(height:12),
            TextField(controller:origin,keyboardType:TextInputType.number,
              decoration:const InputDecoration(labelText:'CEP de origem (8 dígitos)')),
            const SizedBox(height:8),
            FilledButton.icon(onPressed:busy?null:saveOrigin,icon:const Icon(Icons.save_outlined),
              label:const Text('Salvar CEP')),
          ]))),
        const SizedBox(height:20),
        Text('Embalagens • $missing de ${items.length} sem medidas',
          style:Theme.of(context).textTheme.titleMedium),
        const Text('Cadastre cada SKU para habilitar a cotação dos produtos.'),
        for(final item in items) Card(child:ListTile(
          title:Text('${item['productName']} • ${item['sku']}'),
          subtitle:Text(item['weightKg']==null?'Peso e dimensões não cadastrados':
            '${item['weightKg']} kg • ${item['widthCm']} × ${item['heightCm']} × ${item['lengthCm']} cm'),
          trailing:IconButton(tooltip:'Editar medidas',onPressed:busy?null:()=>editParcel(item),
            icon:const Icon(Icons.edit_outlined)),
        )),
      ]);
    }),
  );
}
