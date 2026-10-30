import 'package:flutter/material.dart';

class ProductPurchaseBar extends StatelessWidget {
  const ProductPurchaseBar(
      {super.key,
      required this.selection,
      required this.total,
      required this.available,
      required this.onAdd,
      required this.onBuy});
  final String selection, total;
  final bool available;
  final VoidCallback onAdd, onBuy;

  @override
  Widget build(BuildContext context) => Material(
        color: Theme.of(context).colorScheme.surface,
        elevation: 0,
        shape: Border(
            top: BorderSide(
                color: Theme.of(context).colorScheme.outlineVariant)),
        child: SafeArea(
            top: false,
            child: Center(
                heightFactor: 1,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 920),
                  child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                        Row(children: [
                          Expanded(
                              flex: 3,
                              child: Text(selection,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style:
                                      Theme.of(context).textTheme.bodySmall)),
                          const SizedBox(width: 12),
                          Flexible(
                              flex: 2,
                              child: FittedBox(
                                  fit: BoxFit.scaleDown,
                                  child: Text(total,
                                      style: Theme.of(context)
                                          .textTheme
                                          .titleMedium)))
                        ]),
                        const SizedBox(height: 10),
                        Row(children: [
                          Expanded(
                              child: OutlinedButton(
                                  onPressed: available ? onAdd : null,
                                  child: const Text('Adicionar'))),
                          const SizedBox(width: 12),
                          Expanded(
                              child: FilledButton(
                                  onPressed: available ? onBuy : null,
                                  child: Text(available
                                      ? 'Comprar agora'
                                      : 'Indisponível'))),
                        ]),
                      ])),
                ))),
      );
}
