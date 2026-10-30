import 'package:flutter/material.dart';
import '../../../core/config/store_build_contract.dart';
import '../../../core/network/loja_api.dart';
import '../../../core/theme/app_theme.dart';

/// Builds antigos continuam sem vínculo obrigatório. O gerador por cliente
/// inclui UUID/modo e só monta o aplicativo após conferir a resposta pública.
class StoreConnectionGate extends StatefulWidget {
  const StoreConnectionGate(
      {super.key,
      required this.child,
      this.contract = const StoreBuildContract.fromEnvironment(),
      this.enabled = LojaBackend.isRailway,
      this.verify});
  final Widget child;
  final StoreBuildContract contract;
  final bool enabled;
  final Future<Map<String, dynamic>> Function()? verify;
  @override
  State<StoreConnectionGate> createState() => _StoreConnectionGateState();
}

class _StoreConnectionGateState extends State<StoreConnectionGate> {
  late Future<void> _verification;
  @override
  void initState() {
    super.initState();
    _verification = _verify();
  }

  Future<void> _verify() async {
    if (!widget.enabled || !widget.contract.bound) return;
    widget.contract.validateConfiguration();
    final store = await (widget.verify?.call() ??
        LojaApi.instance.verifyStoreConnection());
    widget.contract.validateStore(store);
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.enabled || !widget.contract.bound) return widget.child;
    return FutureBuilder<void>(
        future: _verification,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.done &&
              !snapshot.hasError) {
            return widget.child;
          }
          return MaterialApp(
              debugShowCheckedModeBanner: false,
              theme: AppTheme.light,
              home: Scaffold(
                  body: SafeArea(
                      child: Center(
                          child: SingleChildScrollView(
                              padding: const EdgeInsets.all(28),
                              child: ConstrainedBox(
                                  constraints:
                                      const BoxConstraints(maxWidth: 420),
                                  child: Column(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        if (!snapshot.hasError) ...[
                                          const CircularProgressIndicator(),
                                          const SizedBox(height: 20),
                                          const Text('Abrindo a loja…')
                                        ] else ...[
                                          const Icon(Icons.storefront_outlined,
                                              size: 48),
                                          const SizedBox(height: 16),
                                          const Text(
                                              'Não foi possível abrir a loja',
                                              textAlign: TextAlign.center,
                                              style: TextStyle(
                                                  fontSize: 22,
                                                  fontWeight: FontWeight.w700)),
                                          const SizedBox(height: 12),
                                          const Text(
                                              'Verifique sua conexão e tente novamente. Se continuar, entre em contato com a loja.',
                                              textAlign: TextAlign.center),
                                          const SizedBox(height: 20),
                                          FilledButton(
                                              onPressed: () => setState(() {
                                                    _verification = _verify();
                                                  }),
                                              child: const Text(
                                                  'Tentar novamente'))
                                        ],
                                      ])))))));
        });
  }
}
