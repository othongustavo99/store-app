import 'package:flutter/material.dart';
import '../../../data/repositories/railway_shipping_repository.dart';

Future<bool> showRailwayShipmentDialog(BuildContext context, {
  required String orderId, required bool alreadyShipped,
}) async {
  if (alreadyShipped) {
    final accept=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(
      title:const Text('Confirmar entrega'),
      content:const Text('Confirme somente após verificar que o cliente recebeu o pacote. '
        'Essa atualização é manual e não é verificada automaticamente pela transportadora.'),
      actions:[TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Voltar')),
        FilledButton(onPressed:()=>Navigator.pop(ctx,true),child:const Text('Confirmar entrega'))],
    ));
    if(accept!=true)return false;
    try {await RailwayShippingRepository().delivered(orderId);return true;}
    catch(e){if(context.mounted)ScaffoldMessenger.of(context)
      .showSnackBar(SnackBar(content:Text('Não foi possível registrar a entrega: $e')));return false;}
  }
  final field=TextEditingController();
  try {
    final code=await showDialog<String>(context:context,builder:(ctx)=>AlertDialog(
      title:const Text('Registrar postagem'),
      content:SizedBox(width:360,child:Column(mainAxisSize:MainAxisSize.min,children:[
        const Text('Informe o código da etiqueta já comprada e efetivamente postada. '
          'Este painel não compra nem gera etiquetas.'),
        const SizedBox(height:12),
        TextField(controller:field,decoration:const InputDecoration(labelText:'Código de rastreamento')),
      ])),
      actions:[TextButton(onPressed:()=>Navigator.pop(ctx),child:const Text('Cancelar')),
        FilledButton(onPressed:()=>Navigator.pop(ctx,field.text.trim()),child:const Text('Confirmar postagem'))],
    ));
    if(code==null)return false;
    try {await RailwayShippingRepository().postShipment(orderId,code);return true;}
    catch(e){if(context.mounted)ScaffoldMessenger.of(context)
      .showSnackBar(SnackBar(content:Text('Não foi possível salvar: $e')));return false;}
  }finally {field.dispose();}
}
