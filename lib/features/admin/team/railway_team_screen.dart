import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../data/repositories/railway_team_repository.dart';

/// Gestão de equipe: proprietário pode convidar; gerente pode consultar.
class RailwayTeamScreen extends StatefulWidget {
  const RailwayTeamScreen({super.key});

  @override
  State<RailwayTeamScreen> createState() => _RailwayTeamScreenState();
}

class _RailwayTeamScreenState extends State<RailwayTeamScreen> {
  final _repository = RailwayTeamRepository();
  late Future<Map<String, dynamic>> _team;
  bool _working = false;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    _team = _repository.team();
  }

  Future<void> _refresh() async {
    setState(_reload);
    try {
      await _team;
    } catch (_) {
      // FutureBuilder apresenta o erro.
    }
  }

  void _notice(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _invite() async {
    final emailController = TextEditingController();
    var role = 'STAFF';
    try {
      final invitation = await showDialog<Map<String, String>>(
        context: context,
        builder: (dialogContext) => StatefulBuilder(
          builder: (context, update) => AlertDialog(
            title: const Text('Convidar integrante'),
            content: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                TextField(
                  controller: emailController,
                  autofocus: true,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(labelText: 'Email da pessoa'),
                ),
                const SizedBox(height: 14),
                DropdownButtonFormField<String>(
                  initialValue: role,
                  decoration: const InputDecoration(labelText: 'Permissão'),
                  items: const [
                    DropdownMenuItem(value: 'STAFF', child: Text('Funcionário — consulta')),
                    DropdownMenuItem(value: 'MANAGER', child: Text('Gerente — gerencia loja')),
                  ],
                  onChanged: (v) => update(() => role = v ?? 'STAFF'),
                ),
                const SizedBox(height: 12),
                const Text('O convite expira em 72 horas. Compartilhe o código por um canal privado.'),
              ]),
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancelar')),
              FilledButton(
                onPressed: () {
                  final email = emailController.text.trim();
                  if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(email)) return;
                  Navigator.pop(dialogContext, {'email': email, 'role': role});
                },
                child: const Text('Criar convite'),
              ),
            ],
          ),
        ),
      );
      if (invitation == null || !mounted) return;
      setState(() => _working = true);
      try {
        final result = await _repository.invite(
          email: invitation['email']!, role: invitation['role']!);
        if (!mounted) return;
        await showDialog<void>(
          context: context,
          barrierDismissible: false,
          builder: (dialogContext) => AlertDialog(
            title: const Text('Convite criado'),
            content: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 450),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                const Text('Copie o código agora: por segurança ele não poderá ser consultado novamente.'),
                const SizedBox(height: 12),
                SelectableText(result['code'].toString()),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: () async {
                    await Clipboard.setData(ClipboardData(text: result['code'].toString()));
                    if (dialogContext.mounted) {
                      ScaffoldMessenger.of(dialogContext).showSnackBar(
                        const SnackBar(content: Text('Código copiado.')));
                    }
                  },
                  icon: const Icon(Icons.copy_outlined),
                  label: const Text('Copiar código'),
                ),
              ]),
            ),
            actions: [
              FilledButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Concluir')),
            ],
          ),
        );
        await _refresh();
      } catch (e) {
        _notice('Falha ao convidar: $e');
      } finally {
        if (mounted) setState(() => _working = false);
      }
    } finally {
      emailController.dispose();
    }
  }

  Future<void> _changeRole(Map<String, dynamic> member) async {
    final name = member['name'].toString();
    final currentRole = member['role'].toString();
    final next = currentRole == 'MANAGER' ? 'STAFF' : 'MANAGER';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Alterar permissão'),
        content: Text('Alterar $name para ${next == 'MANAGER' ? 'gerente' : 'funcionário'}?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Confirmar')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _working = true);
    try {
      await _repository.updateMemberRole(member['id'].toString(), next);
      await _refresh();
      _notice('Permissão alterada.');
    } catch (e) {
      _notice('Não foi possível alterar a permissão: $e');
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _remove(Map<String, dynamic> member) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remover integrante?'),
        content: Text('${member['name']} perderá o acesso administrativo a esta loja.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Remover')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _working = true);
    try {
      await _repository.removeMember(member['id'].toString());
      await _refresh();
      _notice('Acesso administrativo removido.');
    } catch (e) {
      _notice('Não foi possível remover: $e');
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _revoke(String invitationId) async {
    setState(() => _working = true);
    try {
      await _repository.revokeInvitation(invitationId);
      await _refresh();
      _notice('Convite revogado.');
    } catch (e) {
      _notice('Não foi possível revogar: $e');
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  String _role(String role) => switch (role) {
        'OWNER' => 'Proprietário',
        'MANAGER' => 'Gerente',
        'STAFF' => 'Funcionário',
        _ => role,
      };

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Equipe da loja'), actions: [
          IconButton(onPressed: _working ? null : _refresh,
              tooltip: 'Atualizar', icon: const Icon(Icons.refresh)),
        ]),
        body: FutureBuilder<Map<String, dynamic>>(
          future: _team,
          builder: (context, snapshot) {
            if (!snapshot.hasData) {
              return Center(child: snapshot.hasError
                  ? Padding(padding: const EdgeInsets.all(20),
                      child: Text('Falha ao carregar a equipe: ${snapshot.error}'))
                  : const CircularProgressIndicator());
            }
            final data = snapshot.data!;
            final owner = data['myRole'] == 'OWNER';
            final members = (data['members'] as List? ?? const [])
                .map((e) => Map<String, dynamic>.from(e as Map)).toList();
            final invitations = (data['invitations'] as List? ?? const [])
                .map((e) => Map<String, dynamic>.from(e as Map)).toList();
            return ListView(padding: const EdgeInsets.all(20), children: [
              Text('Acesso por função', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 6),
              const Text('Proprietário controla a equipe. Gerente gerencia pedidos, produtos e estoque. '
                  'Funcionário consulta pedidos e inventário.'),
              const SizedBox(height: 16),
              if (owner) ...[
                FilledButton.icon(onPressed: _working ? null : _invite,
                  icon: const Icon(Icons.person_add_alt_1), label: const Text('Convidar integrante')),
                const SizedBox(height: 14),
              ],
              Text('Integrantes (${members.length})', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              for (final member in members)
                Card(child: ListTile(
                  leading: const Icon(Icons.account_circle_outlined),
                  title: Text(member['name']?.toString() ?? 'Sem nome'),
                  subtitle: Text('${member['email']} • ${_role(member['role'].toString())}'),
                  trailing: owner && member['role'] != 'OWNER'
                      ? PopupMenuButton<String>(
                          enabled: !_working,
                          tooltip: 'Ações sobre integrante',
                          onSelected: (action) => action == 'role'
                              ? _changeRole(member) : _remove(member),
                          itemBuilder: (context) => const [
                            PopupMenuItem(value: 'role', child: Text('Alterar função')),
                            PopupMenuItem(value: 'remove', child: Text('Remover acesso')),
                          ],
                        ) : null,
                )),
              if (owner) ...[
                const SizedBox(height: 22),
                Text('Convites recentes', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                if (invitations.isEmpty) const Text('Nenhum convite ainda.'),
                for (final invitation in invitations) ...[
                  Builder(builder: (context) {
                    final accepted = invitation['acceptedAt'] != null;
                    final revoked = invitation['revokedAt'] != null;
                    final expires = DateTime.tryParse('${invitation['expiresAt']}');
                    final expired = expires != null && expires.isBefore(DateTime.now());
                    final pending = !accepted && !revoked && !expired;
                    final status = accepted ? 'Aceito' : revoked ? 'Revogado' : expired ? 'Expirado' : 'Pendente';
                    return Card(child: ListTile(
                      title: Text(invitation['email'].toString()),
                      subtitle: Text('${_role(invitation['role'].toString())} • $status'),
                      trailing: pending ? TextButton(
                        onPressed: _working ? null : () => _revoke(invitation['id'].toString()),
                        child: const Text('Revogar'),
                      ) : null,
                    ));
                  }),
                ],
              ],
            ]);
          },
        ),
      );
}
