import 'package:flutter/material.dart';
import '../../../core/network/loja_api.dart';
import '../../../data/repositories/railway_inventory_repository.dart';

class StockAdjustmentDialog extends StatefulWidget {
  const StockAdjustmentDialog(
      {super.key, required this.variant, required this.repository});
  final Map<String, dynamic> variant;
  final RailwayInventoryRepository repository;
  @override
  State<StockAdjustmentDialog> createState() => _StockAdjustmentDialogState();
}

class _StockAdjustmentDialogState extends State<StockAdjustmentDialog> {
  final _quantity = TextEditingController(), _reason = TextEditingController();
  late String _requestId;
  bool _entrance = true, _busy = false;
  String? _error;
  ({int delta, String notes})? _attempt;
  int _number(dynamic value) => int.tryParse('$value') ?? 0;
  int get _onHand => _number(widget.variant['onHand']);
  int get _reserved => _number(widget.variant['reserved']);
  int? get _delta {
    final amount = int.tryParse(_quantity.text.trim());
    return amount == null || amount < 1 || amount > 100000
        ? null
        : _entrance
            ? amount
            : -amount;
  }

  @override
  void initState() {
    super.initState();
    _requestId = widget.repository.newOperationId();
  }

  Future<void> _save() async {
    if (_busy) return;
    final delta = _attempt?.delta ?? _delta;
    final notes = _attempt?.notes ?? _reason.text.trim();
    if (delta == null || notes.length < 4) {
      setState(() => _error =
          'Informe uma quantidade de 1 a 100.000 e um motivo com pelo menos 4 caracteres.');
      return;
    }
    if (_attempt == null &&
        (_onHand + delta < _reserved || _onHand + delta > 1000000)) {
      setState(() => _error =
          'Ajuste inválido: preserve as unidades reservadas e o limite de estoque.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _attempt = (delta: delta, notes: notes);
    });
    try {
      await widget.repository.adjust(
          variantId: '${widget.variant['variantId']}',
          requestId: _requestId,
          delta: delta,
          notes: notes);
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (!mounted) return;
      final definitive = error is LojaApiException &&
          error.status != null &&
          error.status! >= 400 &&
          error.status! < 500;
      setState(() {
        _busy = false;
        if (definitive) {
          _attempt = null;
          _requestId = widget.repository.newOperationId();
        }
        _error = definitive
            ? error.message
            : 'Não foi possível confirmar o resultado. Repita a mesma operação abaixo ou feche e confira o histórico antes de fazer outro ajuste.';
      });
    }
  }

  @override
  void dispose() {
    _quantity.dispose();
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final locked = _busy || _attempt != null, delta = _attempt?.delta ?? _delta;
    return PopScope(
        canPop: !_busy,
        child: AlertDialog(
          title: const Text('Ajustar estoque'),
          content: SizedBox(
              width: 450,
              child: SingleChildScrollView(
                  child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                    Text('${widget.variant['productName']}',
                        style: const TextStyle(fontWeight: FontWeight.w700)),
                    Text(
                        '${widget.variant['sku']} · ${widget.variant['color']} / ${widget.variant['size']}'),
                    const SizedBox(height: 14),
                    Text(
                        'Físico: $_onHand · Reservado: $_reserved · Disponível: ${_onHand - _reserved}'),
                    const SizedBox(height: 14),
                    SegmentedButton<bool>(
                        segments: const [
                          ButtonSegment(value: true, label: Text('Entrada')),
                          ButtonSegment(value: false, label: Text('Saída'))
                        ],
                        selected: {
                          _entrance
                        },
                        onSelectionChanged: locked
                            ? null
                            : (v) => setState(() {
                                  _entrance = v.first;
                                  _error = null;
                                })),
                    const SizedBox(height: 14),
                    TextField(
                        controller: _quantity,
                        enabled: !locked,
                        keyboardType: TextInputType.number,
                        maxLength: 6,
                        onChanged: (_) => setState(() => _error = null),
                        decoration:
                            const InputDecoration(labelText: 'Quantidade')),
                    TextField(
                        controller: _reason,
                        enabled: !locked,
                        maxLength: 300,
                        minLines: 2,
                        maxLines: 3,
                        onChanged: (_) => setState(() => _error = null),
                        decoration: const InputDecoration(
                            labelText: 'Motivo do ajuste')),
                    if (delta != null)
                      Card(
                          child: Padding(
                              padding: const EdgeInsets.all(12),
                              child: Text(
                                  'Após o ajuste\nFísico: ${_onHand + delta} · Reservado: $_reserved\nDisponível: ${_onHand + delta - _reserved}',
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w600)))),
                    if (_error != null)
                      Padding(
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          child: Text(_error!,
                              style: TextStyle(
                                  color: Theme.of(context).colorScheme.error))),
                    const Text(
                        'Reservas de pedidos não podem ser consumidas por uma saída manual. O servidor confere o saldo atual antes de salvar.'),
                  ]))),
          actions: [
            TextButton(
                onPressed: _busy ? null : () => Navigator.pop(context, false),
                child: const Text('Fechar')),
            FilledButton(
                onPressed: _busy ? null : _save,
                child: Text(_busy
                    ? 'Salvando…'
                    : _attempt != null
                        ? 'Repetir mesma operação'
                        : 'Confirmar ajuste'))
          ],
        ));
  }
}
