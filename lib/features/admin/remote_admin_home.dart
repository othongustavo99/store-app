import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/theme/app_colors.dart';
import '../../data/repositories/railway_inventory_repository.dart';
import '../../providers/auth_providers.dart';

/// Painel operacional. Mantém os mesmos endpoints e autorizações da API.
class RemoteAdminHome extends ConsumerStatefulWidget {
  const RemoteAdminHome({super.key});

  @override
  ConsumerState<RemoteAdminHome> createState() => _RemoteAdminHomeState();
}

class _RemoteAdminHomeState extends ConsumerState<RemoteAdminHome> {
  final _repository = RailwayInventoryRepository();
  late Future<Map<String, dynamic>> _summary;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() => _summary = _repository.summary();

  Future<void> _refresh() async {
    setState(_load);
    try {
      await _summary;
    } catch (_) {
      // A falha é apresentada pelo FutureBuilder.
    }
  }

  String _count(dynamic value) => (int.tryParse('$value') ?? 0).toString();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Administração da loja'),
        actions: [
          IconButton(
            tooltip: 'Atualizar indicadores',
            onPressed: _refresh,
            icon: const Icon(Icons.refresh_rounded),
          ),
          IconButton(
            tooltip: 'Sair da conta',
            icon: const Icon(Icons.logout_rounded),
            onPressed: () async {
              await ref.read(authProvider.notifier).logout();
              if (context.mounted) context.go('/login');
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 20, 16, 40),
          children: [
            Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 1160),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Visão geral', style: Theme.of(context).textTheme.headlineSmall),
                    const SizedBox(height: 5),
                    const Text('Pedidos e estoque da loja atual, atualizados pelo Railway.',
                        style: TextStyle(color: AppColors.textSecondary)),
                    const SizedBox(height: 22),
                    FutureBuilder<Map<String, dynamic>>(
                      future: _summary,
                      builder: (context, snapshot) {
                        if (snapshot.hasError) {
                          return _AdminNotice(
                            icon: Icons.wifi_off_outlined,
                            message: 'Não foi possível carregar os indicadores.',
                            action: _refresh,
                          );
                        }
                        if (!snapshot.hasData) {
                          return const Padding(
                            padding: EdgeInsets.all(28),
                            child: Center(child: CircularProgressIndicator()),
                          );
                        }
                        final data = snapshot.data!;
                        final stock = data['stock'] is Map
                            ? Map<String, dynamic>.from(data['stock'] as Map)
                            : <String, dynamic>{};
                        final orders = data['orders'] is Map
                            ? Map<String, dynamic>.from(data['orders'] as Map)
                            : <String, dynamic>{};
                        final cents = int.tryParse('${orders['grossPaidCents']}') ?? 0;
                        final currency = NumberFormat.currency(locale: 'pt_BR', symbol: 'R\$');
                        final items = <_MetricData>[
                          _MetricData('Unidades disponíveis', _count(stock['availableUnits']),
                              Icons.inventory_2_outlined),
                          _MetricData('Unidades reservadas', _count(stock['reservedUnits']),
                              Icons.lock_clock_outlined),
                          _MetricData('Estoque baixo', _count(stock['lowVariants']),
                              Icons.warning_amber_rounded),
                          _MetricData('Variantes esgotadas', _count(stock['outVariants']),
                              Icons.production_quantity_limits_outlined),
                          _MetricData('Pedidos a preparar', _count(orders['toPrepare']),
                              Icons.receipt_long_outlined),
                          _MetricData('Pedidos em andamento', _count(orders['inProgress']),
                              Icons.local_shipping_outlined),
                          _MetricData('Total bruto de pedidos pagos', currency.format(cents / 100),
                              Icons.payments_outlined),
                        ];
                        return LayoutBuilder(
                          builder: (context, constraints) {
                            final count = constraints.maxWidth >= 900 ? 4 :
                                constraints.maxWidth >= 580 ? 3 :
                                constraints.maxWidth >= 350 ? 2 : 1;
                            final width = (constraints.maxWidth - (count - 1) * 12) / count;
                            return Wrap(
                              spacing: 12,
                              runSpacing: 12,
                              children: items.map((item) => SizedBox(
                                width: width,
                                child: _MetricCard(data: item),
                              )).toList(),
                            );
                          },
                        );
                      },
                    ),
                    const SizedBox(height: 28),
                    Text('Operação diária', style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 12),
                    LayoutBuilder(
                      builder: (context, constraints) {
                        final columns = constraints.maxWidth >= 810 ? 3 :
                            constraints.maxWidth >= 520 ? 2 : 1;
                        final width = (constraints.maxWidth - (columns - 1) * 12) / columns;
                        final actions = <_AdminAction>[
                          _AdminAction('Pedidos e expedição', 'Separar e acompanhar vendas',
                              Icons.receipt_long_outlined, '/admin/orders'),
                          _AdminAction('Inventário', 'Ajustes e movimentações',
                              Icons.inventory_outlined, '/admin/inventory'),
                          _AdminAction('Produtos e categorias', 'Organizar sua vitrine',
                              Icons.category_outlined, '/admin/products'),
                          _AdminAction('Atendimento', 'Conversas com os clientes',
                              Icons.support_agent_outlined, '/admin/support'),
                          _AdminAction('Frete e embalagens', 'Medidas e expedição',
                              Icons.local_shipping_outlined, '/admin/shipping'),
                          _AdminAction('Equipe e permissões', 'Acessos da loja',
                              Icons.groups_outlined, '/admin/team'),
                          _AdminAction('Identidade da loja', 'Marca e preparação comercial',
                              Icons.tune_outlined, '/admin/store-settings'),
                          _AdminAction('Visualizar vitrine', 'Experiência do comprador',
                              Icons.storefront_outlined, '/'),
                        ];
                        return Wrap(
                          spacing: 12,
                          runSpacing: 12,
                          children: actions.map((item) => SizedBox(
                            width: width,
                            child: _ActionCard(
                              data: item,
                              onTap: () => item.route == '/admin/support'
                                  ? context.push(item.route)
                                  : context.go(item.route),
                            ),
                          )).toList(),
                        );
                      },
                    ),
                    const SizedBox(height: 20),
                    const Text(
                      'A receita exibida é bruta e não representa lucro ou valores disponíveis para repasse.',
                      style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MetricData {
  const _MetricData(this.title, this.value, this.icon);
  final String title;
  final String value;
  final IconData icon;
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({required this.data});
  final _MetricData data;

  @override
  Widget build(BuildContext context) => Container(
        constraints: const BoxConstraints(minHeight: 120),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: AppColors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(data.icon, color: AppColors.primary, size: 23),
            const SizedBox(height: 12),
            Text(data.value, maxLines: 1, overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 4),
            Text(data.title, maxLines: 2,
                style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
          ],
        ),
      );
}

class _AdminAction {
  const _AdminAction(this.title, this.subtitle, this.icon, this.route);
  final String title;
  final String subtitle;
  final IconData icon;
  final String route;
}

class _ActionCard extends StatelessWidget {
  const _ActionCard({required this.data, required this.onTap});
  final _AdminAction data;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: Container(
            constraints: const BoxConstraints(minHeight: 96),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              border: Border.all(color: AppColors.border),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Row(
              children: [
                Icon(data.icon, size: 26, color: AppColors.primary),
                const SizedBox(width: 12),
                Expanded(child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(data.title, maxLines: 2,
                        style: const TextStyle(fontSize: 14,
                            fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
                    const SizedBox(height: 4),
                    Text(data.subtitle, maxLines: 2,
                        style: const TextStyle(fontSize: 12,
                            color: AppColors.textSecondary)),
                  ],
                )),
                const Icon(Icons.chevron_right, color: AppColors.textLight),
              ],
            ),
          ),
        ),
      );
}

class _AdminNotice extends StatelessWidget {
  const _AdminNotice({required this.icon, required this.message, required this.action});
  final IconData icon;
  final String message;
  final VoidCallback action;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(children: [
          Icon(icon, size: 34, color: AppColors.textSecondary),
          const SizedBox(height: 8),
          Text(message, textAlign: TextAlign.center),
          const SizedBox(height: 10),
          OutlinedButton.icon(onPressed: action,
              icon: const Icon(Icons.refresh), label: const Text('Tentar novamente')),
        ]),
      );
}

class RemotePendingScreen extends StatelessWidget {
  const RemotePendingScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Funcionalidade pendente')), 
        body: Center(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Text(
              'Esse recurso ainda não está integrado ao Railway. '
              'Não utilize dados do Firebase no modo Railway.',
              textAlign: TextAlign.center,
            ),
          ),
        ),
      );
}
