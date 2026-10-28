import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/network/loja_api.dart';
import '../../data/repositories/railway_support_repository.dart';

/// Central de atendimento Railway para comprador e equipe da loja.
class RailwaySupportScreen extends StatefulWidget {
  const RailwaySupportScreen({super.key, required this.admin});
  final bool admin;

  @override
  State<RailwaySupportScreen> createState() => _RailwaySupportScreenState();
}

class _RailwaySupportScreenState extends State<RailwaySupportScreen> {
  final _repo = RailwaySupportRepository();
  late Future<List<Map<String, dynamic>>> _future;
  StreamSubscription<int>? _events;

  @override
  void initState() {
    super.initState();
    _load();
    _events = LojaApi.instance.supportChanges(admin: widget.admin).listen((_) {
      if (mounted) setState(_load);
    });
  }

  void _load() => _future = _repo.tickets(admin: widget.admin);
  Future<void> _refresh() async {
    setState(_load);
    try { await _future; } catch (_) { /* FutureBuilder exibe o erro. */ }
  }

  @override
  void dispose() {
    _events?.cancel();
    super.dispose();
  }

  Future<void> _createTicket() async {
    final subject = TextEditingController();
    final message = TextEditingController();
    final formKey = GlobalKey<FormState>();
    try {
      final submitted = await showDialog<bool>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Novo atendimento'),
          content: SizedBox(
            width: 470,
            child: Form(
              key: formKey,
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                TextFormField(
                  controller: subject,
                  maxLength: 160,
                  decoration: const InputDecoration(labelText: 'Assunto'),
                  validator: (v) => (v?.trim().length ?? 0) < 5
                      ? 'Informe pelo menos 5 caracteres.' : null,
                ),
                TextFormField(
                  controller: message,
                  minLines: 3,
                  maxLines: 5,
                  maxLength: 4000,
                  decoration: const InputDecoration(labelText: 'Como podemos ajudar?'),
                  validator: (v) => (v?.trim().isEmpty ?? true)
                      ? 'Escreva sua mensagem.' : null,
                ),
              ]),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext, false),
                child: const Text('Cancelar')),
            FilledButton(onPressed: () {
              if (formKey.currentState?.validate() ?? false) {
                Navigator.pop(dialogContext, true);
              }
            }, child: const Text('Criar atendimento')),
          ],
        ),
      );
      if (submitted != true || !mounted) return;
      final ticketId = await _repo.createTicket(subject: subject.text,
          message: message.text);
      if (!mounted) return;
      await _refresh();
      if (mounted) context.push('/support/ticket/$ticketId');
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Não foi possível criar atendimento: $e')));
    } finally {
      subject.dispose();
      message.dispose();
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(widget.admin ? 'Atendimento da loja' : 'Fale com a loja'),
      actions: [
        IconButton(onPressed: _refresh, tooltip: 'Atualizar',
            icon: const Icon(Icons.refresh)),
      ],
    ),
    floatingActionButton: widget.admin ? null : FloatingActionButton.extended(
      onPressed: _createTicket,
      icon: const Icon(Icons.add_comment_outlined),
      label: const Text('Novo atendimento'),
    ),
    body: FutureBuilder<List<Map<String, dynamic>>>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return Center(child: Padding(padding: const EdgeInsets.all(24),
            child: Text('Não foi possível carregar os atendimentos: ${snapshot.error}')));
        }
        final data = snapshot.data ?? [];
        if (data.isEmpty) {
          return Center(child: Text(widget.admin
              ? 'Nenhum atendimento recebido.'
              : 'Você ainda não possui atendimentos.'));
        }
        return RefreshIndicator(
          onRefresh: _refresh,
          child: Center(child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 860),
            child: ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 90),
              itemCount: data.length,
              separatorBuilder: (context, index) => const SizedBox(height: 6),
              itemBuilder: (context, i) {
                final ticket = data[i];
                final id = ticket['id']?.toString() ?? '';
                final open = ticket['status'] == 'OPEN';
                return Card(child: ListTile(
                  leading: Icon(open ? Icons.mark_chat_unread_outlined
                      : Icons.mark_chat_read_outlined),
                  title: Text(ticket['subject']?.toString() ?? 'Atendimento'),
                  subtitle: Text(widget.admin
                      ? '${ticket['customerName'] ?? 'Cliente'} • ${open ? 'Aberto' : 'Encerrado'}'
                      : open ? 'Aguardando ou em atendimento' : 'Encerrado'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: id.isEmpty ? null : () => context.push(widget.admin
                      ? '/admin/support/ticket/$id' : '/support/ticket/$id'),
                ));
              },
            ),
          )),
        );
      },
    ),
  );
}
