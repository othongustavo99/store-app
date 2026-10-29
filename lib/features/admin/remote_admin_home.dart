import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/theme/app_colors.dart';
import '../../data/repositories/railway_inventory_repository.dart';
import '../../providers/auth_providers.dart';
import '../client/widgets/demo_store_banner.dart';

/// Painel operacional. Mantém os mesmos endpoints e autorizações da API.
class RemoteAdminHome extends ConsumerStatefulWidget {
  const RemoteAdminHome({super.key});

  @override
  ConsumerState<RemoteAdminHome> createState() => _RemoteAdminHomeState();
}

class _RemoteAdminHomeState extends ConsumerState<RemoteAdminHome> {
  final _repository = RailwayInventoryRepository();
  late Future<Map<String, dynamic>> _summary;
  late Future<Map<String, dynamic>> _analytics;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    _summary = _repository.summary();
    _analytics = _repository.analytics();
  }

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
    final isDemo = ref.watch(isDemoStoreProvider).valueOrNull == true;
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
              if (context.mounted) context.go('/');
            },
          ),
        ],
      ),
      body: Column(children: [
        const DemoStoreBanner(),
        Expanded(child: RefreshIndicator(
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
                          _MetricData(isDemo ? 'Total FICTÍCIO de pedidos' : 'Total bruto de pedidos pagos', currency.format(cents / 100),
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
                    const SizedBox(height: 22),
                    _AnalyticsOverview(future: _analytics, isDemo: isDemo),
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
                    Text(
                      isDemo ? 'DADOS FICTÍCIOS: os valores acima não são receita nem correspondem a dinheiro recebido.' :
                      'A receita exibida é bruta e não representa lucro ou valores disponíveis para repasse.',
                      style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
        )),
      ]),
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
            Icon(data.icon, color: Theme.of(context).colorScheme.primary, size: 23),
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

/// Exibe somente dados agregados da loja autenticada, calculados pelo backend.
class _AnalyticsOverview extends StatelessWidget {
  const _AnalyticsOverview({required this.future, required this.isDemo});
  final Future<Map<String, dynamic>> future;
  final bool isDemo;
  @override
  Widget build(BuildContext context) => FutureBuilder<Map<String, dynamic>>(
    future: future, builder: (context, snapshot) {
      if (snapshot.hasError) return const Text('Indicadores de vendas indisponíveis.');
      if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
      final data = snapshot.data!;
      final totals = Map<String, dynamic>.from(data['totals'] as Map? ?? {});
      final days = (data['days'] as List? ?? []).whereType<Map>().toList();
      final top = (data['topProducts'] as List? ?? []).whereType<Map>().toList();
      final low = (data['lowStock'] as List? ?? []).whereType<Map>().toList();
      final recent = (data['recentOrders'] as List? ?? []).whereType<Map>().toList();
      final currency = NumberFormat.currency(locale: 'pt_BR',symbol: 'R\$');
      String money(dynamic value) => currency.format((int.tryParse('$value') ?? 0)/100);
      final max = days.fold<int>(1, (v, r) {
        final cents = int.tryParse('${r['cents']}') ?? 0;
        return cents > v ? cents : v;
      });
      final cs = Theme.of(context).colorScheme;
      return Column(crossAxisAlignment: CrossAxisAlignment.start,children: [
        Text(isDemo ? 'Vendas fictícias (demonstração)' : 'Indicadores de vendas',
          style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 10),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final entry in [
            ('Hoje', totals['todayCents']),
            ('Últimos 7 dias', totals['weekCents']),
            ('Últimos 30 dias', totals['monthCents']),
          ]) Container(width: 180, padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: cs.surface, borderRadius: BorderRadius.circular(12),
              border: Border.all(color: cs.outlineVariant)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start,children: [
              Text(entry.$1, style: Theme.of(context).textTheme.bodySmall),
              const SizedBox(height: 6),
              Text(money(entry.$2),style: Theme.of(context).textTheme.titleMedium),
            ])),
        ]),
        const SizedBox(height: 12),
        Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('Pedidos pagos por dia (últimos 7 dias)'),
          const SizedBox(height: 16),
          _WeeklySalesBars(days: days, money: money, max: max),
        ]))),
        const SizedBox(height: 12),
        LayoutBuilder(builder: (context, size) => Wrap(spacing: 12, runSpacing: 12,children: [
          for (final block in [
            ('Mais vendidos', top.map((e) => '${e['name']} • ${e['quantity']} un.').toList()),
            ('Estoque baixo', low.map((e) => '${e['product']} • ${e['sku']} (${e['available']})').toList()),
            ('Últimos pedidos', recent.map((e) => '${e['status']} • ${money(e['totalCents'])}').toList()),
          ]) SizedBox(width: size.maxWidth >= 860 ? (size.maxWidth-24)/3 : size.maxWidth,
            child: Card(child: Padding(padding: const EdgeInsets.all(14),child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,children: [
              Text(block.$1,style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 6),
              if (block.$2.isEmpty) const Text('Nenhum registro ainda.'),
              for (final item in block.$2.take(5)) Padding(padding: const EdgeInsets.symmetric(vertical: 5),
                child: Text(item,maxLines: 2,overflow: TextOverflow.ellipsis)),
            ])))),
          ])),
        const SizedBox(height: 6),
        Text(isDemo ? 'Valores fictícios, sem movimentação financeira.' :
          'Receita bruta por data UTC, sem dedução de estornos. Não é lucro.',
          style: Theme.of(context).textTheme.bodySmall),
      ]);
    });
}

class _WeeklySalesBars extends StatelessWidget {
  const _WeeklySalesBars({required this.days, required this.money, required this.max});
  final List<Map> days;
  final String Function(dynamic) money;
  final int max;
  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context).colorScheme.primary;
    return SizedBox(height: 140, child: Row(crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        for (final day in days)
          Expanded(child: Padding(padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Column(mainAxisAlignment: MainAxisAlignment.end, children: [
              Tooltip(message: money(day['cents']), child: Container(
                height: 95 * ((int.tryParse('${day['cents']}') ?? 0) / max),
                decoration: BoxDecoration(color: color,
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(5))))),
              const SizedBox(height: 6),
              Text('${day['label']}', style: const TextStyle(fontSize: 10)),
            ]))),
      ]));
  }
}
