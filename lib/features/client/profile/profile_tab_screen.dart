import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../providers/auth_providers.dart';
import '../../../core/network/loja_api.dart';

class ProfileTabScreen extends ConsumerWidget {
  const ProfileTabScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    final loggedIn = auth.isLoggedIn;
    return Scaffold(appBar: AppBar(title: const Text('Perfil')),
      body: ListView(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20), children: [
        Card(child: ListTile(leading: const CircleAvatar(child: Icon(Icons.person_outline)),
          title: Text(loggedIn ? (auth.name.isEmpty ? 'Minha conta' : auth.name) : 'Olá, visitante!'),
          subtitle: Text(loggedIn ? (auth.email ?? 'Conta conectada') : 'Entre para consultar seus pedidos'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => context.push(loggedIn ? '/account' : '/login?from=%2Faccount'))),
        const SizedBox(height: 20),
        ListTile(leading: const Icon(Icons.receipt_long_outlined), title: const Text('Meus pedidos'),
          trailing: const Icon(Icons.chevron_right), onTap: () => context.push('/orders')),
        ListTile(leading: const Icon(Icons.support_agent_outlined), title: const Text('Ajuda e atendimento'),
          trailing: const Icon(Icons.chevron_right), onTap: () => context.push('/support')),
        if (loggedIn) ListTile(leading: const Icon(Icons.manage_accounts_outlined),
          title: const Text('Meus dados e endereços'), trailing: const Icon(Icons.chevron_right),
          onTap: () => context.push('/account')),
        if (loggedIn && auth.role == UserRole.admin) ...[
          const Divider(),
          ListTile(leading: const Icon(Icons.dashboard_outlined), title: const Text('Painel da loja'),
            onTap: () => context.push('/admin')),
          if (LojaBackend.isRailway) ListTile(leading: const Icon(Icons.group_add_outlined),
            title: const Text('Convites da equipe'), onTap: () => context.push('/invite')),
        ],
        if (!loggedIn) FilledButton.icon(onPressed: () => context.push('/login?from=%2Fprofile'),
          icon: const Icon(Icons.login), label: const Text('Entrar ou criar conta'))
        else OutlinedButton.icon(onPressed: () async {
          await ref.read(authProvider.notifier).logout();
          if (context.mounted) context.go('/');
        }, icon: const Icon(Icons.logout), label: const Text('Sair da conta')),
      ]),
    );
  }
}
