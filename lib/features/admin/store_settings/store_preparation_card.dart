import 'package:flutter/material.dart';

class StorePreparationCard extends StatelessWidget {
  const StorePreparationCard(
      {super.key, required this.data, required this.onOpen});
  final Map<String, dynamic> data;
  final ValueChanged<String> onOpen;
  @override
  Widget build(BuildContext context) {
    final progress = data['progress'] as Map? ?? {};
    final total = (progress['total'] as num?)?.toInt() ?? 1;
    final completed = (progress['completed'] as num?)?.toInt() ?? 0;
    final channels = data['channels'] as Map? ?? {};
    final demo = data['mode'] == 'DEMO';
    return Card(
        child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('Preparação da loja',
                      style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 10),
                  Text('$completed de $total configurações cadastradas'),
                  const SizedBox(height: 10),
                  LinearProgressIndicator(
                      value: total > 0 ? (completed / total).clamp(0, 1) : 0),
                  const SizedBox(height: 14),
                  Wrap(spacing: 8, runSpacing: 6, children: [
                    for (final pair in const {
                      'pickup': 'Retirada',
                      'localDelivery': 'Entrega local',
                      'onlinePayment': 'Online',
                      'carrierDelivery': 'Transportadora'
                    }.entries)
                      Chip(
                          avatar: Icon(
                              channels[pair.key] == true
                                  ? Icons.check_circle_outline
                                  : Icons.radio_button_unchecked,
                              size: 18),
                          label: Text(demo && pair.key == 'pickup'
                              ? 'Retirada simulada'
                              : pair.value)),
                  ]),
                  const SizedBox(height: 10),
                  for (final step
                      in (data['steps'] as List? ?? []).whereType<Map>())
                    ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: Icon(
                            step['done'] == true
                                ? Icons.check_circle_outline
                                : Icons.radio_button_unchecked,
                            color: step['done'] == true
                                ? Theme.of(context).colorScheme.primary
                                : null),
                        title: Text('${step['title']}'),
                        subtitle: Text('${step['description']}'),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => onOpen('${step['route']}')),
                  const Divider(),
                  Text(
                      '${data['notice'] ?? 'Confira o fluxo completo antes de distribuir.'}',
                      style: Theme.of(context).textTheme.bodySmall),
                  for (final note in data['limitations'] as List? ?? [])
                    Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text('$note',
                            style: Theme.of(context).textTheme.bodySmall)),
                ])));
  }
}
