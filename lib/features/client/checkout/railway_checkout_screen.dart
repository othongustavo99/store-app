import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../data/repositories/railway_order_repository.dart';
import '../../../data/repositories/railway_shipping_repository.dart';
import '../../../providers/auth_providers.dart';
import '../../../providers/cart_providers.dart';
import '../../../models/cart_item.dart';

class RailwayCheckoutScreen extends ConsumerStatefulWidget {
  const RailwayCheckoutScreen({super.key});
  @override
  ConsumerState<RailwayCheckoutScreen> createState()=>_RailwayCheckoutScreenState();
}

class _RailwayCheckoutScreenState extends ConsumerState<RailwayCheckoutScreen> {
  final form=GlobalKey<FormState>();
  final name=TextEditingController(),phone=TextEditingController(),cep=TextEditingController();
  final street=TextEditingController(),number=TextEditingController(),complement=TextEditingController();
  final neighborhood=TextEditingController(),city=TextEditingController(),state=TextEditingController();
  final orders=RailwayOrderRepository(),shipping=RailwayShippingRepository();
  final currency=NumberFormat.currency(locale:'pt_BR',symbol:'R\$');
  bool busy=false,quoting=false,deliveryEnabled=false,shippingSandbox=true;
  bool? paymentEnabled;
  String method='PICKUP', error='',quoteId='',selectedServiceId='',quotedCart='',quotedZip='';
  List<Map<String,dynamic>> options=[];
  String key=RailwayOrderRepository.newCheckoutKey();

  @override
  void initState(){
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_){
      if(mounted)name.text=ref.read(authProvider).name;
    });
    load();
  }
  Future<void> load()async{
    try{
      final result=await Future.wait([orders.checkoutEnabled(),shipping.availability()]);
      if(mounted)setState((){
        paymentEnabled=result[0] as bool;
        deliveryEnabled=(result[1] as Map)['delivery']==true;
        shippingSandbox=(result[1] as Map)['sandbox']!=false;
      });
    }catch(e){if(mounted)setState((){paymentEnabled=false;error=e.toString();});}
  }
  @override
  void dispose(){for(final c in [name,phone,cep,street,number,complement,neighborhood,city,state])c.dispose();super.dispose();}
  String postal()=>cep.text.replaceAll(RegExp(r'\D'),'');
  String cartSignature(List<CartItem> items)=>items.map((i)=>
    '${i.product.id}:${i.color}:${i.size}:${i.quantity}:${i.total}').join('|');
  Map<String,String> address()=>{
    'postalCode':postal(),'street':street.text.trim(),'number':number.text.trim(),
    'complement':complement.text.trim(),'neighborhood':neighborhood.text.trim(),
    'city':city.text.trim(),'state':state.text.trim().toUpperCase(),
  };
  void changeMethod(String value){setState((){
    method=value;quoteId='';selectedServiceId='';options=[];
    key=RailwayOrderRepository.newCheckoutKey();
  });}
  Future<void> calculate()async{
    final cart=ref.read(cartProvider);
    if(!RegExp(r'^\d{8}$').hasMatch(postal())){
      setState(()=>error='Digite um CEP válido com 8 números.');return;
    }
    if(cart.isEmpty)return;
    setState((){quoting=true;error='';options=[];quoteId='';selectedServiceId='';});
    try{
      final result=await shipping.quote(cart,postal());
      if(mounted)setState((){
        quoteId=result['quoteId'].toString();
        options=(result['options'] as List? ?? const [])
          .map((e)=>Map<String,dynamic>.from(e as Map)).toList();
        quotedCart=cartSignature(cart);
        quotedZip=postal();
        key=RailwayOrderRepository.newCheckoutKey();
        if(result['sandbox']==true)error='Cotação de teste (sandbox): não é uma etiqueta comprada.';
      });
    }catch(e){if(mounted)setState(()=>error='$e');}
    finally{if(mounted)setState(()=>quoting=false);}
  }
  Future<void> pay()async{
    if(busy||paymentEnabled!=true||!form.currentState!.validate())return;
    final cart=ref.read(cartProvider);
    if(cart.isEmpty)return;
    if(method=='DELIVERY' && (quoteId.isEmpty||selectedServiceId.isEmpty||
      cartSignature(cart)!=quotedCart||postal()!=quotedZip)){
      setState(()=>error='Calcule e escolha novamente o frete para este carrinho.');return;
    }
    setState((){busy=true;error='';});
    try{
      final result=await orders.createOrder(cart:cart,customerName:name.text,
        customerPhone:phone.text,idempotencyKey:key,fulfillment:method,
        quoteId:method=='DELIVERY'?quoteId:null,
        serviceId:method=='DELIVERY'?selectedServiceId:null,
        address:method=='DELIVERY'?address():null);
      final url=result['checkoutUrl']?.toString();
      final uri=url==null?null:Uri.tryParse(url);
      if(uri==null||uri.scheme!='https'||uri.host.isEmpty)throw StateError('Link de pagamento não disponível.');
      if(!await launchUrl(uri,mode:LaunchMode.externalApplication))
        throw StateError('Não foi possível abrir o pagamento. O pedido permanece registrado.');
      ref.read(cartProvider.notifier).clear();
      if(mounted)context.go('/orders');
    }catch(e){if(mounted)setState(()=>error='$e');}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Widget field(TextEditingController controller,String title,{bool mustFill=true,TextInputType? type})=>
    Padding(padding:const EdgeInsets.only(bottom:10),child:TextFormField(
      controller:controller,keyboardType:type,decoration:InputDecoration(labelText:title),
      validator:(value)=>mustFill&&(value==null||value.trim().isEmpty)?'Campo obrigatório':null));

  @override
  Widget build(BuildContext context){
    final cart=ref.watch(cartProvider);
    final subtotal=cart.fold<double>(0,(sum,item)=>sum+item.total);
    final selected=options.where((o)=>o['id'].toString()==selectedServiceId).toList();
    final price=selected.isEmpty?0:((selected.first['priceCents'] as num?)?.toInt()??0);
    final estimate=subtotal+(method=='DELIVERY'?price/100:0);
    return Scaffold(appBar:AppBar(title:const Text('Finalizar pedido')),
      body:ListView(padding:const EdgeInsets.all(18),children:[
        Text('Forma de recebimento',style:Theme.of(context).textTheme.titleMedium),
        const SizedBox(height:10),
        SegmentedButton<String>(segments:[const ButtonSegment(value:'PICKUP',label:Text('Retirada'),
          icon:Icon(Icons.storefront)),if(deliveryEnabled)const ButtonSegment(value:'DELIVERY',
          label:Text('Entrega'),icon:Icon(Icons.local_shipping_outlined))],
          selected:{method},onSelectionChanged:(values)=>changeMethod(values.first)),
        if(!deliveryEnabled)const Padding(padding:EdgeInsets.symmetric(vertical:10),
          child:Text('Entrega ainda não configurada pela loja. Retirada continua disponível.')),
        const SizedBox(height:14),
        Form(key:form,child:Column(children:[
          field(name,'Nome completo'),field(phone,'Telefone',type:TextInputType.phone),
          if(method=='DELIVERY')...[
            Row(children:[Expanded(child:field(cep,'CEP (8 números)',type:TextInputType.number)),
              const SizedBox(width:8),FilledButton.tonal(onPressed:quoting?null:calculate,
                child:quoting?const SizedBox(height:16,width:16,child:CircularProgressIndicator(strokeWidth:2)):
                  const Text('Cotar frete'))]),
            field(street,'Logradouro'),field(number,'Número'),
            field(complement,'Complemento',mustFill:false),field(neighborhood,'Bairro'),
            field(city,'Cidade'),field(state,'UF (ex.: SP)'),
          ],
        ])),
        if(method=='DELIVERY')...[ 
          if(options.isNotEmpty)Text('Escolha uma transportadora',style:Theme.of(context).textTheme.titleMedium),
          for(final rate in options)RadioListTile<String>(
            value:rate['id'].toString(),groupValue:selectedServiceId,
            onChanged:(value)=>setState(()=>selectedServiceId=value??''),
            title:Text('${rate['carrier']} • ${rate['name']}'),
            subtitle:Text('${rate['deliveryDays']} dia(s) úteis estimados'),
            secondary:Text(currency.format(((rate['priceCents'] as num?)?.toInt()??0)/100)),
          ),
          const Text('O frete é cotado pelo Melhor Envio. O preço só é incluído no pedido após validação do servidor.'),
        ],
        const SizedBox(height:16),
        Text('Resumo do pedido',style:Theme.of(context).textTheme.titleMedium),
        for(final line in cart)ListTile(title:Text(line.product.name),
          subtitle:Text('${line.color} / ${line.size} • ${line.quantity} un.'),
          trailing:Text(currency.format(line.total))),
        const Divider(),
        ListTile(title:const Text('Produtos'),trailing:Text(currency.format(subtotal))),
        ListTile(title:const Text('Frete'),trailing:Text(method=='PICKUP'?'Retirada gratuita':
          selected.isEmpty?'Calcule o frete':currency.format(price/100))),
        ListTile(title:const Text('Total estimado'),trailing:Text(currency.format(estimate))),
        if(paymentEnabled==null)const Center(child:CircularProgressIndicator()),
        if(paymentEnabled==false)const Card(child:Padding(padding:EdgeInsets.all(14),
          child:Text('Pagamentos desativados para esta loja. É possível testar a cotação sem gerar cobrança.'))),
        if(method=='DELIVERY' && shippingSandbox)const Text(
          'Cotação sandbox: apenas demonstração. Não é possível cobrar esta entrega.'),
        if(error.isNotEmpty)Padding(padding:const EdgeInsets.symmetric(vertical:12),
          child:Text(error,style:TextStyle(color:Theme.of(context).colorScheme.error))),
        const SizedBox(height:12),
        FilledButton.icon(onPressed:paymentEnabled==true&&!busy&&cart.isNotEmpty&&
          (method=='PICKUP'||(!shippingSandbox && selectedServiceId.isNotEmpty&&cartSignature(cart)==quotedCart&&postal()==quotedZip))?pay:null,
          icon:busy?const SizedBox(width:16,height:16,child:CircularProgressIndicator(strokeWidth:2)):
            const Icon(Icons.lock_outline),label:const Text('Ir para pagamento seguro')),
      ]),
    );
  }
}
