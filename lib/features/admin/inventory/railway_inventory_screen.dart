import 'package:loja_roupas/router/app_back_button.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../../core/network/loja_api.dart';
import '../../../data/repositories/railway_inventory_repository.dart';

/// Inventário operacional. Estoque físico/reservado/disponível são distintos.
class RailwayInventoryScreen extends StatefulWidget {
  const RailwayInventoryScreen({super.key});
  @override
  State<RailwayInventoryScreen> createState() => _RailwayInventoryScreenState();
}

class _RailwayInventoryScreenState extends State<RailwayInventoryScreen> {
  final _repo = RailwayInventoryRepository();
  final _search = TextEditingController();
  late Future<Map<String, dynamic>> _page;
  StreamSubscription<int>? _changes;
  Timer? _debounce;
  bool _lowOnly = false;
  int _pageNumber = 1;
  static const _limit = 50;
  final _currency = NumberFormat.currency(locale: 'pt_BR', symbol: 'R\$');

  @override
  void initState() {
    super.initState();
    _load();
    _changes = LojaApi.instance.catalogChanges().listen((_) {
      if (mounted) setState(_load);
    });
  }

  void _load() {
    _page = _repo.inventory(search: _search.text.trim(), onlyLow: _lowOnly, page: _pageNumber);
  }

  Future<void> _reload() async {
    setState(_load);
    try { await _page; } catch (_) { /* FutureBuilder exibe erro. */ }
  }

  void _filterChanged() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      if (mounted) setState(() { _pageNumber = 1; _load(); });
    });
  }

  @override
  void dispose() {
    _changes?.cancel();
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  Future<void> _adjust(Map<String, dynamic> variant) async {
    final qty = TextEditingController();
    final reason = TextEditingController();
    var entrance = true;
    String? error;
    bool busy = false;
    final operationId = _repo.newOperationId();
    try {
      final changed = await showDialog<bool>(context: context, barrierDismissible: false,
        builder: (dialogContext) => StatefulBuilder(builder: (ctx, update) => AlertDialog(
          title: Text('Ajustar estoque • ${variant['sku']}'),
          content: SizedBox(width: 430, child: Column(mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${variant['productName']} • ${variant['color']} / ${variant['size']}'),
            const SizedBox(height: 6),
            Text('Físico: ${variant['onHand']}   Reservado: ${variant['reserved']}   Disponível: ${variant['available']}'),
            const SizedBox(height: 14),
            SegmentedButton<bool>(segments: const [
              ButtonSegment(value: true, label: Text('Entrada'), icon: Icon(Icons.add)),
              ButtonSegment(value: false, label: Text('Saída'), icon: Icon(Icons.remove)),
            ], selected: {entrance}, onSelectionChanged: busy ? null : (v) => update(() => entrance = v.first)),
            const SizedBox(height: 10),
            TextField(controller: qty, enabled: !busy, autofocus: true,
              keyboardType: TextInputType.number, decoration: const InputDecoration(
                labelText: 'Quantidade', border: OutlineInputBorder())),
            const SizedBox(height: 10),
            TextField(controller: reason, enabled: !busy, maxLength: 300,
              decoration: const InputDecoration(labelText: 'Motivo obrigatório (mín. 4 caracteres)',
                border: OutlineInputBorder())),
            if (error != null) Text(error!, style: TextStyle(color: Theme.of(ctx).colorScheme.error)),
            const Text('Saídas não podem consumir unidades reservadas por pedidos.',
              style: TextStyle(fontSize: 12)),
          ])),
          actions: [
            TextButton(onPressed: busy ? null : () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
            FilledButton(onPressed: busy ? null : () async {
              final amount = int.tryParse(qty.text.trim());
              final note = reason.text.trim();
              if (amount == null || amount < 1 || amount > 100000 || note.length < 4) {
                update(() => error = 'Informe uma quantidade entre 1 e 100.000 e um motivo com pelo menos 4 caracteres.');
                return;
              }
              update(() { busy = true; error = null; });
              try {
                await _repo.adjust(variantId: variant['variantId'].toString(),
                    requestId: operationId, delta: entrance ? amount : -amount, notes: note);
                if (ctx.mounted) Navigator.pop(ctx, true);
              } catch (e) {
                if (ctx.mounted) update(() { busy = false; error = '$e'; });
              }
            }, child: busy ? const SizedBox(width: 18, height: 18, child:
                CircularProgressIndicator(strokeWidth: 2)) : const Text('Confirmar ajuste')),
          ],
        )));
      if (changed == true && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Estoque atualizado.')));
        await _reload();
      }
    } finally { qty.dispose(); reason.dispose(); }
  }

  Future<void> _history(String? variantId) async {
    await showDialog<void>(context: context, builder: (ctx) => AlertDialog(
      title: Text(variantId == null ? 'Últimas movimentações' : 'Histórico da variante'),
      content: SizedBox(width: 650, height: 420, child: FutureBuilder<List<Map<String,dynamic>>>(
        future: _repo.movements(variantId: variantId), builder: (context, snap) {
          if (!snap.hasData) {
            return Center(child: snap.hasError
              ? Text('Falha ao consultar: ${snap.error}') : const CircularProgressIndicator());
          }
          if (snap.data!.isEmpty) return const Center(child: Text('Sem movimentações.'));
          return ListView.separated(itemCount: snap.data!.length,
            separatorBuilder: (context, index) => const Divider(height: 1),
            itemBuilder: (_, index) {
              final item = snap.data![index];
              final delta = (item['delta'] as num?)?.toInt() ?? 0;
              final timestamp = DateTime.tryParse(item['createdAt']?.toString() ?? '')?.toLocal();
              return ListTile(dense: true,
                title: Text('${item['productName']} • ${item['sku']} • ${item['kind']}'),
                subtitle: Text('${item['notes'] ?? 'Sem observações'}\n${item['actorName'] ?? 'Sistema'} • ${timestamp == null ? '' : DateFormat('dd/MM/yyyy HH:mm').format(timestamp)}'),
                trailing: Text(delta > 0 ? '+$delta' : '$delta',
                  style: const TextStyle(fontWeight: FontWeight.bold)));
            });
        })),
      actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Fechar'))],
    ));
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(leading: const AppBackButton(fallbackLocation: '/admin'), title: const Text('Inventário • Railway'), actions: [
      IconButton(tooltip: 'Histórico geral', onPressed: () => _history(null), icon: const Icon(Icons.history)),
      IconButton(tooltip: 'Atualizar', onPressed: _reload, icon: const Icon(Icons.refresh)),
    ]),
    body: Column(children: [
      Padding(padding: const EdgeInsets.fromLTRB(16, 12, 16, 8), child: Column(children: [
        TextField(controller: _search, onChanged: (_) => _filterChanged(),
          decoration: const InputDecoration(prefixIcon: Icon(Icons.search),
            labelText: 'Produto, SKU, cor ou tamanho', border: OutlineInputBorder())),
        SwitchListTile.adaptive(value: _lowOnly,
          title: const Text('Somente estoque baixo ou esgotado (até 5 unidades disponíveis)'),
          onChanged: (v) => setState(() { _lowOnly = v; _pageNumber = 1; _load(); })),
      ])),
      Expanded(child: FutureBuilder<Map<String,dynamic>>(future: _page, builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
        if (snap.hasError) {
          return Center(child: Padding(padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text('Erro ao carregar inventário: ${snap.error}', textAlign: TextAlign.center),
            const SizedBox(height: 10), FilledButton(onPressed: _reload, child: const Text('Tentar novamente')),
          ])));
        }
        final rows = (snap.data?['variants'] as List? ?? const []);
        final total = (snap.data?['total'] as num?)?.toInt() ?? 0;
        final canAdjust = snap.data?['canAdjust'] == true;
        return Column(children: [
          Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: Row(children: [
            Expanded(child: Text('$total variantes encontradas')),
            Text('Página $_pageNumber'),
            IconButton(tooltip: 'Anterior', onPressed: _pageNumber <= 1 ? null : () => setState(() { _pageNumber--; _load(); }), icon: const Icon(Icons.chevron_left)),
            IconButton(tooltip: 'Próxima', onPressed: _pageNumber * _limit >= total ? null : () => setState(() { _pageNumber++; _load(); }), icon: const Icon(Icons.chevron_right)),
          ])),
          Expanded(child: rows.isEmpty ? const Center(child: Text('Nenhuma variante encontrada.')) :
            RefreshIndicator(onRefresh: _reload, child: ListView.builder(
              physics: const AlwaysScrollableScrollPhysics(), itemCount: rows.length,
              itemBuilder: (context, index) {
                final v = Map<String,dynamic>.from(rows[index] as Map);
                final available = (v['available'] as num?)?.toInt() ?? 0;
                final price = (int.tryParse(v['priceCents'].toString()) ?? 0) / 100;
                return Card(margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                  child: Padding(padding: const EdgeInsets.all(12), child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [Expanded(child: Text(v['productName'].toString(),
                      style: Theme.of(context).textTheme.titleMedium)),
                      if (available <= 5) Chip(label: Text(available == 0 ? 'Esgotado' : 'Baixo'))]),
                    Text('${v['sku']} • ${v['color']} / ${v['size']} • ${_currency.format(price)}'),
                    const SizedBox(height: 5),
                    Text('Disponível: $available   |   Físico: ${v['onHand']}   |   Reservado: ${v['reserved']}'),
                    Wrap(spacing: 8, children: [
                      OutlinedButton.icon(onPressed: () => _history(v['variantId'].toString()),
                        icon: const Icon(Icons.history), label: const Text('Histórico')),
                      FilledButton.icon(onPressed: canAdjust ? () => _adjust(v) : null, icon: const Icon(Icons.tune),
                        label: const Text('Ajustar estoque')),
                    ]),
                  ])));
              }))),
        ]);
      })),
    ]),
  );
}
