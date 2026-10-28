import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../providers/auth_providers.dart';

/// Fase 2: painel seguro durante o corte de infraestrutura.
/// Não mistura métricas/pedidos Firebase com catálogo Railway.
class RemoteAdminHome extends ConsumerWidget {
  const RemoteAdminHome({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => Scaffold(
    appBar: AppBar(title: const Text('Minha loja • Railway'), actions: [
      IconButton(tooltip: 'Sair', onPressed: () async {
        await ref.read(authProvider.notifier).logout();
        if (context.mounted) context.go('/login');
      }, icon: const Icon(Icons.logout)),
    ]),
    body: ListView(padding: const EdgeInsets.all(24), children: [
      const Icon(Icons.storefront_outlined, size: 72),
      const SizedBox(height: 16),
      const Text('Catálogo conectado ao PostgreSQL', textAlign: TextAlign.center,
        style: TextStyle(fontSize: 21, fontWeight: FontWeight.bold)),
      const SizedBox(height: 12),
      const Text('Produtos e categorias já podem ser gerenciados. Pedidos, pagamentos e relatórios serão transferidos para o servidor na Fase 3.',
        textAlign: TextAlign.center),
      const SizedBox(height: 24),
      FilledButton.icon(onPressed: () => context.go('/admin/products'),
        icon: const Icon(Icons.inventory_2_outlined), label: const Text('Gerenciar produtos')),
      const SizedBox(height: 12),
      OutlinedButton.icon(onPressed: () => context.go('/'),
        icon: const Icon(Icons.storefront_outlined), label: const Text('Visualizar vitrine')),
    ]),
  );
}

class RemotePendingScreen extends StatelessWidget {
  const RemotePendingScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Em implantação')),
    body: const Center(child: Padding(padding: EdgeInsets.all(24), child:
      Column(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.construction_outlined, size: 54),
        SizedBox(height: 14),
        Text('Esta operação ainda não está disponível no modo Railway.',
          textAlign: TextAlign.center, style: TextStyle(fontSize: 19, fontWeight: FontWeight.w600)),
        SizedBox(height: 8),
        Text('Compras, acompanhamento de pedidos e atendimento serão ativados após a integração transacional da Fase 3.',
          textAlign: TextAlign.center),
      ]))),
  );
}
