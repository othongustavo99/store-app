import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../data/repositories/railway_team_repository.dart';
import '../../../providers/auth_providers.dart';

/// Cada pessoa aceita o convite na própria conta; não recebe senha de admin.
class RailwayAcceptInviteScreen extends ConsumerStatefulWidget {
  const RailwayAcceptInviteScreen({super.key});

  @override
  ConsumerState<RailwayAcceptInviteScreen> createState() => _RailwayAcceptInviteScreenState();
}

class _RailwayAcceptInviteScreenState extends ConsumerState<RailwayAcceptInviteScreen> {
  final _code = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _accept() async {
    final code = _code.text.trim();
    if (code.length != 43) {
      setState(() => _error = 'Cole o código completo enviado pelo proprietário.');
      return;
    }
    setState(() { _busy = true; _error = null; });
    try {
      await RailwayTeamRepository().acceptInvitation(code);
      if (!mounted) return;
      await ref.read(authProvider.notifier).refreshRailwayRole();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Convite aceito!')));
      context.go('/admin');
    } catch (e) {
      if (mounted) setState(() => _error = 'Não foi possível aceitar: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Convite da equipe')),
        body: Center(child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 460),
          child: ListView(shrinkWrap: true, padding: const EdgeInsets.all(24), children: [
            const Icon(Icons.mark_email_read_outlined, size: 56),
            const SizedBox(height: 20),
            Text('Trabalhar nesta loja', style: Theme.of(context).textTheme.titleLarge,
                textAlign: TextAlign.center),
            const SizedBox(height: 8),
            const Text('Entre com a conta cujo email recebeu o convite. Depois cole o código '
                'enviado pelo proprietário. O código pode ser usado uma única vez.',
                textAlign: TextAlign.center),
            const SizedBox(height: 24),
            TextField(
              controller: _code,
              enabled: !_busy,
              autocorrect: false,
              enableSuggestions: false,
              decoration: const InputDecoration(labelText: 'Código do convite',
                  border: OutlineInputBorder(), prefixIcon: Icon(Icons.key_outlined)),
              onSubmitted: (_) {
                if (!_busy) _accept();
              },
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
            const SizedBox(height: 18),
            FilledButton.icon(
              onPressed: _busy ? null : _accept,
              icon: _busy ? const SizedBox(width: 18, height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.verified_user_outlined),
              label: const Text('Aceitar convite'),
            ),
          ]),
        )),
      );
}
