import 'package:flutter/material.dart';
import '../../data/repositories/railway_after_sales_repository.dart';

const Map<String, String> afterSalesTypes = {
  'CANCEL': 'Solicitar cancelamento',
  'RETURN': 'Solicitar devolução',
  'REFUND': 'Solicitar reembolso',
};
const Map<String, String> afterSalesStatusNames = {
  'OPEN': 'Recebido',
  'IN_REVIEW': 'Em análise',
  'WAITING_CUSTOMER': 'Aguardando informações',
  'MANUAL_ACTION': 'Ação da loja pendente',
  'REJECTED': 'Não aprovado',
  'CLOSED': 'Atendimento encerrado',
};
const activeAfterSalesStatuses = {'OPEN','IN_REVIEW','WAITING_CUSTOMER','MANUAL_ACTION'};

List<String> availableAfterSalesTypes(String status) => switch (status) {
  'PENDING_PAYMENT' => ['CANCEL'],
  'PAID' || 'PREPARING' || 'SHIPPED' => ['CANCEL', 'REFUND'],
  'DELIVERED' => ['RETURN', 'REFUND'],
  'PAYMENT_REVIEW' => ['REFUND'],
  _ => [],
};

Future<bool> showCreateAfterSalesRequest(BuildContext context, {required String orderId,
    required String orderStatus}) async {
  final types = availableAfterSalesTypes(orderStatus);
  if (types.isEmpty) return false;
  final reason = TextEditingController();
  var type = types.first;
  var submitting = false;
  final result = await showDialog<bool>(context: context, builder: (dialogContext) =>
    StatefulBuilder(builder: (context, setDialogState) => AlertDialog(
      title: const Text('Solicitar ajuda com o pedido'),
      content: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Text('A solicitação será analisada pela loja. Nenhum pagamento será reembolsado automaticamente.'),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(value: type,
          decoration: const InputDecoration(labelText: 'Tipo de solicitação'),
          items: types.map((value) => DropdownMenuItem(
              value: value, child: Text(afterSalesTypes[value]!))).toList(),
          onChanged: submitting ? null : (value) {
            if(value != null) setDialogState(() => type = value);
          }),
        const SizedBox(height: 12),
        TextField(controller: reason, maxLines: 4, maxLength: 1200,
          enabled: !submitting,
          decoration: const InputDecoration(labelText: 'Descreva o motivo',
              hintText: 'Informe por que precisa de ajuda com este pedido')),
      ])),
      actions: [
        TextButton(onPressed: submitting ? null : () => Navigator.pop(context, false),
            child: const Text('Voltar')),
        FilledButton(onPressed: submitting ? null : () async {
          if (reason.text.trim().length < 10) {
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
              content: Text('Descreva o motivo com pelo menos 10 caracteres.')));
            return;
          }
          setDialogState(() => submitting = true);
          try {
            await RailwayAfterSalesRepository().request(orderId: orderId,
                type: type, reason: reason.text);
            if (context.mounted) Navigator.pop(context, true);
          } catch (e) {
            if (context.mounted) {
              ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
              setDialogState(() => submitting = false);
            }
          }
        }, child: const Text('Enviar solicitação')),
      ],
    )));
  // O TextField mantém o controlador até a rota desaparecer.
  WidgetsBinding.instance.addPostFrameCallback((_) => reason.dispose());
  return result == true;
}

Future<bool> showReviewAfterSalesRequest(BuildContext context,
    Map<String, dynamic> request) async {
  final original = request['status']?.toString() ?? 'OPEN';
  final allowed = <String, List<String>>{
    'OPEN': ['IN_REVIEW','WAITING_CUSTOMER','MANUAL_ACTION','REJECTED'],
    'IN_REVIEW': ['WAITING_CUSTOMER','MANUAL_ACTION','REJECTED','CLOSED'],
    'WAITING_CUSTOMER': ['IN_REVIEW','MANUAL_ACTION','REJECTED'],
    'MANUAL_ACTION': ['IN_REVIEW','REJECTED','CLOSED'],
  }[original] ?? [];
  if (allowed.isEmpty) return false;
  String selected = allowed.first;
  bool sending = false;
  final note = TextEditingController();
  final result = await showDialog<bool>(context: context, builder: (dialogContext) =>
    StatefulBuilder(builder: (context, setDialogState) => AlertDialog(
      title: const Text('Revisar solicitação'),
      content: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
        Text('Motivo do cliente: ${request['reason'] ?? ''}'),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(value: selected,
          decoration: const InputDecoration(labelText: 'Nova etapa'),
          items: allowed.map((status) => DropdownMenuItem(value: status,
              child: Text(afterSalesStatusNames[status]!))).toList(),
          onChanged: sending ? null : (value) {
            if (value != null) setDialogState(() => selected = value);
          }),
        const SizedBox(height: 12),
        TextField(controller: note, maxLines: 3, maxLength: 1200,
          decoration: const InputDecoration(labelText: 'Justificativa / observação')),
        const SizedBox(height: 12),
        const Text('Importante: esta tela NÃO cancela pagamentos nem emite reembolsos. '
            'Confirme eventuais estornos no painel do gateway e concilie os registros.'),
      ])),
      actions: [
        TextButton(onPressed: sending ? null : () => Navigator.pop(context, false),
            child: const Text('Voltar')),
        FilledButton(onPressed: sending ? null : () async {
          if ((selected == 'REJECTED' || selected == 'CLOSED') && note.text.trim().length < 15) {
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                content: Text('Para encerrar ou recusar, informe pelo menos 15 caracteres.')));
            return;
          }
          setDialogState(() => sending = true);
          try {
            await RailwayAfterSalesRepository().update(caseId: request['id'].toString(),
                status: selected, note: note.text);
            if (context.mounted) Navigator.pop(context, true);
          } catch(e) {
            if(context.mounted){
              ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
              setDialogState(() => sending = false);
            }
          }
        }, child: const Text('Salvar')),
      ],
    )));
  WidgetsBinding.instance.addPostFrameCallback((_) => note.dispose());
  return result == true;
}
