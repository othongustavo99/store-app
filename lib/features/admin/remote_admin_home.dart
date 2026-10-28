import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../data/repositories/railway_inventory_repository.dart';
import '../../providers/auth_providers.dart';

/// Painel Railway com dados do servidor, sem misturar métricas do Firestore.
class RemoteAdminHome extends ConsumerStatefulWidget {
  const RemoteAdminHome({super.key});
  @override
  ConsumerState<RemoteAdminHome> createState() => _RemoteAdminHomeState();
}

class _RemoteAdminHomeState extends ConsumerState<RemoteAdminHome> {
  final _repository = RailwayInventoryRepository();
  late Future<Map<String, dynamic>> _summary;

  @override
  void initState() { super.initState(); _load(); }
  void _load() { _summary = _repository.summary(); }
  Future<void> _refresh() async {
    setState(_load);
    try { await _summary; } catch (_) { /* FutureBuilder exibe o erro. */ }
  }
  String _count(dynamic v) => int.tryParse('$v')?.toString() ?? '0';
  Widget _metric(BuildContext context, String title, String value, IconData icon) {
    return Card(child: Padding(padding: const EdgeInsets.all(16), child: Row(children: [
      Icon(icon, size: 26), const SizedBox(width: 12),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title, style: Theme.of(context).textTheme.bodySmall),
        Text(value, style: Theme.of(context).textTheme.titleLarge),
      ])),
    ])));
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Minha loja • Administração'), actions: [
      IconButton(tooltip: 'Atualizar indicadores', onPressed: _refresh, icon: const Icon(Icons.refresh)),
      IconButton(tooltip: 'Sair', onPressed: () async {
        await ref.read(authProvider.notifier).logout();
        if (context.mounted) context.go('/login');
      }, icon: const Icon(Icons.logout)),
    ]),
    body: RefreshIndicator(onRefresh: _refresh, child: ListView(
      physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.all(20), children: [
      Text('Visão geral da loja', style: Theme.of(context).textTheme.headlineSmall),
      const SizedBox(height: 8),
      const Text('Pedidos e estoque da loja atual, sincronizados pelo Railway.'),
      const SizedBox(height: 16),
      FutureBuilder<Map<String, dynamic>>(future: _summary, builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return Padding(padding: const EdgeInsets.all(18), child: snapshot.hasError
              ? Text('Não foi possível carregar indicadores: ${snapshot.error}')
              : const Center(child: CircularProgressIndicator()));
        }
        final stock = Map<String,dynamic>.from(snapshot.data!['stock'] as Map);
        final orders = Map<String,dynamic>.from(snapshot.data!['orders'] as Map);
        final paidCents = int.tryParse('${orders['grossPaidCents']}') ?? 0;
        final paid = (paidCents / 100).toStringAsFixed(2).replaceAll('.', ',');
        return LayoutBuilder(builder: (context, constraints) {
          final columns = constraints.maxWidth > 800 ? 3 : constraints.maxWidth > 440 ? 2 : 1;
          final width = (constraints.maxWidth - (columns - 1) * 8) / columns;
          return Wrap(spacing: 8, runSpacing: 8, children: [
            SizedBox(width: width, child: _metric(context, 'Unidades disponíveis', _count(stock['availableUnits']), Icons.inventory_2_outlined)),
            SizedBox(width: width, child: _metric(context, 'Unidades reservadas', _count(stock['reservedUnits']), Icons.lock_clock_outlined)),
            SizedBox(width: width, child: _metric(context, 'Variantes com estoque baixo', _count(stock['lowVariants']), Icons.warning_amber_outlined)),
            SizedBox(width: width, child: _metric(context, 'Variantes esgotadas', _count(stock['outVariants']), Icons.remove_shopping_cart_outlined)),
            SizedBox(width: width, child: _metric(context, 'Pedidos a preparar', _count(orders['toPrepare']), Icons.receipt_long_outlined)),
            SizedBox(width: width, child: _metric(context, 'Pedidos em andamento', _count(orders['inProgress']), Icons.local_shipping_outlined)),
            SizedBox(width: width, child: _metric(context, 'Total bruto dos pedidos pagos', 'R\$ $paid', Icons.payments_outlined)),
          ]);
        });
      }),
      const SizedBox(height: 20),
      FilledButton.icon(onPressed: () => context.go('/admin/inventory'),
        icon: const Icon(Icons.inventory_outlined), label: const Text('Inventário e movimentações')),
      const SizedBox(height: 8),
      OutlinedButton.icon(onPressed: () => context.go('/admin/team'),
        icon: const Icon(Icons.groups_outlined), label: const Text('Equipe e permissões')),
      const SizedBox(height: 8),
      OutlinedButton.icon(onPressed: () => context.go('/admin/products'),
        icon: const Icon(Icons.add_box_outlined), label: const Text('Produtos e categorias')),
      const SizedBox(height: 8),
      OutlinedButton.icon(onPressed: () => context.push('/admin/support'),
        icon: const Icon(Icons.support_agent_outlined), label: const Text('Atendimento ao cliente')),
      const SizedBox(height: 8),
      OutlinedButton.icon(onPressed: () => context.go('/admin/shipping'),
        icon: const Icon(Icons.local_shipping_outlined), label: const Text('Frete e embalagens')),
      const SizedBox(height: 8),
      OutlinedButton.icon(onPressed: () => context.go('/admin/orders'),
        icon: const Icon(Icons.receipt_long_outlined), label: const Text('Pedidos e expedição')),
      const SizedBox(height: 8),
      OutlinedButton.icon(onPressed: () => context.go('/'),
        icon: const Icon(Icons.storefront_outlined), label: const Text('Visualizar vitrine')),
      const SizedBox(height: 12),
      const Text('O total bruto não é lucro nem repasse financeiro. Reembolsos parciais e conciliação são etapas futuras.',
        style: TextStyle(fontSize: 12)),
    ])),
  );
}

class RemotePendingScreen extends StatelessWidget {
  const RemotePendingScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Funcionalidade pendente')),
    body: const Center(child: Padding(padding: EdgeInsets.all(24), child:
      Text('Esse recurso ainda não está integrado ao Railway. Não utilize dados do Firebase no modo Railway.',
        textAlign: TextAlign.center))),
  );
}
