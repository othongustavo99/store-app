import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../data/repositories/railway_after_sales_repository.dart';

/// Atalho operacional com dupla confirmação; a autorização final é sempre na API.
Future<bool> showRailwayRefundDialog(BuildContext context, {
  required String caseId, required int amountCents,
}) async {
  final typed=TextEditingController();
  bool acknowledged=false;
  bool busy=false;
  final money=NumberFormat.currency(locale:'pt_BR',symbol:'R\$');
  final result=await showDialog<bool>(context:context,barrierDismissible:false,
    builder:(dialogContext)=>StatefulBuilder(builder:(context,setState)=>AlertDialog(
      title:const Text('Reembolso integral — Mercado Pago'),
      content:SingleChildScrollView(child:Column(mainAxisSize:MainAxisSize.min,
        crossAxisAlignment:CrossAxisAlignment.start,children:[
        Text('Valor total: ${money.format(amountCents/100)}',
          style:Theme.of(context).textTheme.titleMedium),
        const SizedBox(height:12),
        const Text('Ação financeira REAL e potencialmente irreversível. '
          'Confirme no pós-venda o direito ao reembolso e a situação da mercadoria. '
          'O sistema não devolve unidades ao estoque automaticamente.'),
        const SizedBox(height:12),
        CheckboxListTile(contentPadding:EdgeInsets.zero,value:acknowledged,
          title:const Text('Analisei a solicitação e a devolução da mercadoria, '
            'quando aplicável, e assumo a responsabilidade pelo estorno integral.'),
          onChanged:busy?null:(v)=>setState(()=>acknowledged=v??false)),
        TextField(controller:typed,enabled:!busy,
          onChanged:(_)=>setState((){}),
          decoration:const InputDecoration(labelText:'Digite REEMBOLSAR para confirmar')),
      ])),
      actions:[
        TextButton(onPressed:busy?null:()=>Navigator.pop(dialogContext,false),
          child:const Text('Voltar')),
        FilledButton(onPressed:busy || !acknowledged || typed.text.trim()!='REEMBOLSAR'
          ? null : () async {
          setState(()=>busy=true);
          try {
            final r=await RailwayRefundRepository().execute(caseId);
            if(!context.mounted)return;
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(
              content:Text(r['message']?.toString()??'Operação registrada. Verifique a conciliação.')));
            if(dialogContext.mounted)Navigator.pop(dialogContext,true);
          }catch(e){
            if(context.mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content:Text('Falha na operação: $e')));
            }
            if(dialogContext.mounted)setState(()=>busy=false);
          }
        },child:const Text('Confirmar estorno')),
      ],
    )));
  WidgetsBinding.instance.addPostFrameCallback((_)=>typed.dispose());
  return result==true;
}

Future<bool> showRailwayRefundReconcileDialog(BuildContext context,String caseId) async {
  final confirmed=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(
    title:const Text('Consultar reembolso'),
    content:const Text('O sistema consultará o Mercado Pago sem enviar novo pedido de estorno. '
      'Se a operação ainda estiver incerta, confira o painel do gateway.'),
    actions:[TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Voltar')),
      FilledButton(onPressed:()=>Navigator.pop(ctx,true),child:const Text('Conciliar'))]));
  if(confirmed!=true)return false;
  try {
    final result=await RailwayRefundRepository().reconcile(caseId);
    if(context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content:Text(result['message']?.toString()??'Conciliação consultada.')));
    }
    return true;
  }catch(e){
    if(context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content:Text('Não foi possível conciliar: $e')));
    }
    return false;
  }
}
