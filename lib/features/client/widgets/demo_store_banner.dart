import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/loja_api.dart';

final isDemoStoreProvider = FutureProvider<bool>((ref) async {
  if (!LojaBackend.isRailway) return false;
  final response = await LojaApi.instance.request('GET',
      '/v1/shops/${LojaBackend.storeSlug}');
  return (response['store'] as Map?)?['isDemo'] == true;
});

class DemoStoreBanner extends ConsumerWidget {
  const DemoStoreBanner({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final demo = ref.watch(isDemoStoreProvider).valueOrNull == true;
    if (!demo) return const SizedBox.shrink();
    return Container(
      width: double.infinity,
      color: Colors.deepOrange.shade50,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      child: const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        Icon(Icons.science_outlined, color: Colors.deepOrange, size: 16),
        SizedBox(width: 7),
        Flexible(child: Text('MODO DEMONSTRAÇÃO · Pedidos e pagamentos fictícios',
          textAlign: TextAlign.center,
          style: TextStyle(fontWeight: FontWeight.w700,
            color: Colors.deepOrange, fontSize: 12))),
      ]),
    );
  }
}
