import 'package:loja_roupas/router/app_back_button.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import '../../core/network/loja_api.dart';
import '../../data/repositories/railway_support_repository.dart';

class RailwaySupportConversationScreen extends StatefulWidget {
  const RailwaySupportConversationScreen({super.key, required this.ticketId,
    required this.admin});
  final String ticketId;
  final bool admin;

  @override
  State<RailwaySupportConversationScreen> createState() =>
      _RailwaySupportConversationScreenState();
}

class _RailwaySupportConversationScreenState
    extends State<RailwaySupportConversationScreen> {
  final _repo = RailwaySupportRepository();
  final _input = TextEditingController();
  late Future<Map<String, dynamic>> _messages;
  StreamSubscription<int>? _events;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _load();
    _events = LojaApi.instance.supportChanges(admin: widget.admin).listen((_) {
      if (mounted) setState(_load);
    });
  }

  void _load() => _messages = _repo.conversation(widget.ticketId,
      admin: widget.admin);

  Future<void> _refresh() async {
    setState(_load);
    try { await _messages; } catch (_) { /* Mostrado no FutureBuilder. */ }
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty || _sending || text.length > 4000) return;
    setState(() => _sending = true);
    try {
      await _repo.send(widget.ticketId, text, admin: widget.admin);
      _input.clear();
      if (mounted) await _refresh();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Não foi possível enviar: $e')));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _changeStatus(String status) async {
    try {
      await _repo.status(widget.ticketId, status, admin: widget.admin);
      if (mounted) await _refresh();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Não foi possível alterar atendimento: $e')));
    }
  }

  @override
  void dispose() {
    _events?.cancel();
    _input.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(leading: AppBackButton(fallbackLocation: widget.admin ? '/admin/support' : '/support'), title: const Text('Conversa de atendimento'), actions: [
      IconButton(tooltip: 'Atualizar', onPressed: _refresh,
          icon: const Icon(Icons.refresh)),
    ]),
    body: FutureBuilder<Map<String, dynamic>>(
      future: _messages,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return Center(child: Text('Erro ao carregar conversa: ${snapshot.error}'));
        }
        final data = snapshot.data ?? {};
        final ticket = Map<String, dynamic>.from(data['ticket'] as Map? ?? {});
        final open = ticket['status'] == 'OPEN';
        final messages = (data['messages'] as List? ?? const [])
            .map((e) => Map<String, dynamic>.from(e as Map)).toList();
        return Center(child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 820),
          child: Column(children: [
            Material(
              color: Theme.of(context).colorScheme.surfaceContainer,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                child: Row(children: [
                  Expanded(child: Text(open ? 'Atendimento aberto' : 'Atendimento encerrado')),
                  TextButton(
                    onPressed: !open && !widget.admin ? null
                        : () => _changeStatus(open ? 'CLOSED' : 'OPEN'),
                    child: Text(open ? 'Encerrar' : widget.admin ? 'Reabrir' : 'Encerrado'),
                  ),
                ]),
              ),
            ),
            Expanded(child: ListView.builder(
              padding: const EdgeInsets.all(12),
              itemCount: messages.length,
              itemBuilder: (context, i) {
                final m = messages[i];
                final mySide = (m['fromCustomer'] == true) != widget.admin;
                return Align(
                  alignment: mySide ? Alignment.centerRight : Alignment.centerLeft,
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 540),
                    child: Card(
                      color: mySide ? Theme.of(context).colorScheme.primaryContainer : null,
                      child: Padding(padding: const EdgeInsets.all(12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(m['senderName']?.toString() ?? 'Usuário',
                                style: Theme.of(context).textTheme.labelSmall),
                            const SizedBox(height: 4),
                            SelectableText(m['body']?.toString() ?? ''),
                          ],
                        ),
                      ),
                    ),
                  ),
                );
              },
            )),
            SafeArea(top: false, child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(children: [
                Expanded(child: TextField(
                  controller: _input,
                  enabled: open && !_sending,
                  minLines: 1, maxLines: 4, maxLength: 4000,
                  decoration: InputDecoration(
                    hintText: open ? 'Escreva sua mensagem' : 'Atendimento encerrado',
                    border: const OutlineInputBorder(),
                  ),
                )),
                const SizedBox(width: 8),
                IconButton.filled(
                  onPressed: open && !_sending ? _send : null,
                  tooltip: 'Enviar mensagem', icon: const Icon(Icons.send),
                ),
              ]),
            )),
          ]),
        ));
      },
    ),
  );
}
