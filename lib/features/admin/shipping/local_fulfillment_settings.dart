import 'package:flutter/material.dart';
import '../../../data/repositories/railway_shipping_repository.dart';

class LocalFulfillmentSettings extends StatefulWidget {
  const LocalFulfillmentSettings(
      {super.key, required this.settings, this.repository});
  final Map<String, dynamic> settings;
  final RailwayShippingRepository? repository;
  @override
  State<LocalFulfillmentSettings> createState() =>
      _LocalFulfillmentSettingsState();
}

class _LocalFulfillmentSettingsState extends State<LocalFulfillmentSettings> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _address, _hours, _fee, _estimate, _ranges;
  late bool _enabled;
  bool _busy = false;
  String _message = '';
  @override
  void initState() {
    super.initState();
    final data = widget.settings;
    _address = TextEditingController(text: '${data['pickupAddress'] ?? ''}');
    _hours = TextEditingController(text: '${data['pickupHours'] ?? ''}');
    _fee = TextEditingController(
        text: (((data['localFeeCents'] as num?) ?? 0) / 100)
            .toStringAsFixed(2)
            .replaceAll('.', ','));
    _estimate = TextEditingController(text: '${data['localEstimate'] ?? ''}');
    _ranges = TextEditingController(
        text: (data['localPostalRanges'] as List? ?? [])
            .map((r) => '${r['start']}-${r['end']}')
            .join('\n'));
    _enabled = data['localEnabled'] == true;
  }

  List<Map<String, String>>? _parseRanges() {
    final lines = _ranges.text
        .split(RegExp(r'[\n;]'))
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty);
    final result = <Map<String, String>>[];
    for (final line in lines) {
      final match = RegExp(r'^(\d{8})\s*-\s*(\d{8})$').firstMatch(line);
      if (match == null || match[1]!.compareTo(match[2]!) > 0) return null;
      result.add({'start': match[1]!, 'end': match[2]!});
    }
    return result.length <= 30 ? result : null;
  }

  Future<void> _save() async {
    if (_busy || _form.currentState?.validate() != true) return;
    setState(() {
      _busy = true;
      _message = '';
    });
    try {
      await (widget.repository ?? RailwayShippingRepository()).saveFulfillment({
        'pickupAddress': _address.text.trim(),
        'pickupHours': _hours.text.trim(),
        'localEnabled': _enabled,
        'localFeeCents':
            (double.parse(_fee.text.trim().replaceAll(',', '.')) * 100).round(),
        'localEstimate': _estimate.text.trim(),
        'localPostalRanges': _parseRanges()!,
      });
      if (mounted) {
        setState(() => _message =
            'Recebimento atualizado. Novas compras usarão estas informações.');
      }
    } catch (_) {
      if (mounted) {
        setState(() => _message =
            'Não foi possível salvar. Confira sua permissão e conexão e tente novamente.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _field(TextEditingController controller, String label,
          {int max = 250,
          int lines = 1,
          String? Function(String?)? validator,
          TextInputType? type}) =>
      Padding(
          padding: const EdgeInsets.only(top: 14),
          child: TextFormField(
              controller: controller,
              enabled: !_busy,
              maxLength: max,
              maxLines: lines,
              keyboardType: type,
              decoration: InputDecoration(labelText: label),
              validator: validator));
  @override
  void dispose() {
    for (final input in [_address, _hours, _fee, _estimate, _ranges]) {
      input.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Card(
      child: Padding(
          padding: const EdgeInsets.all(18),
          child: Form(
              key: _form,
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('Retirada e entrega local',
                        style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 8),
                    const Text(
                        'Informe o local e o horário de retirada. A entrega local é organizada pela sua equipe e não exige token de transportadora.'),
                    _field(_address, 'Endereço de retirada',
                        max: 500, lines: 2),
                    _field(_hours, 'Horário e orientações de retirada',
                        lines: 2),
                    SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('Oferecer entrega local'),
                        value: _enabled,
                        onChanged:
                            _busy ? null : (v) => setState(() => _enabled = v)),
                    _field(_fee, 'Taxa fixa de entrega (R\$)',
                        max: 7,
                        type: const TextInputType.numberWithOptions(
                            decimal: true), validator: (text) {
                      final value = (text ?? '').trim().replaceAll(',', '.');
                      final amount = double.tryParse(value);
                      return RegExp(r'^\d{1,4}(\.\d{1,2})?$').hasMatch(value) &&
                              amount != null &&
                              amount <= 1000
                          ? null
                          : 'Informe de 0,00 a 1000,00, com até duas casas decimais.';
                    }),
                    _field(_estimate, 'Prazo e condições da entrega local',
                        max: 150,
                        lines: 2,
                        validator: (v) => _enabled && (v ?? '').trim().isEmpty
                            ? 'Informe um prazo real para o cliente.'
                            : null),
                    const Text(
                        'Área atendida: uma faixa por linha, com CEPs de oito números. Exemplo de formato: 01000000-01000999. Use somente as faixas que sua loja atende.'),
                    _field(_ranges, 'Faixas de CEP atendidas',
                        max: 600, lines: 4, validator: (_) {
                      final ranges = _parseRanges();
                      return ranges == null || (_enabled && ranges.isEmpty)
                          ? 'Use início-fim, oito números em cada CEP, até 30 faixas.'
                          : null;
                    }),
                    const Text(
                        'Taxa zero significa entrega gratuita dentro das faixas cadastradas. Pagamento na retirada não é oferecido para entrega; Pix/WhatsApp continuam pendentes até a conferência da loja.'),
                    const SizedBox(height: 16),
                    FilledButton.icon(
                        onPressed: _busy ? null : _save,
                        icon: const Icon(Icons.save_outlined),
                        label: Text(_busy
                            ? 'Salvando…'
                            : 'Salvar retirada e entrega local')),
                    if (_message.isNotEmpty)
                      Padding(
                          padding: const EdgeInsets.only(top: 12),
                          child: Text(_message)),
                  ]))));
}
