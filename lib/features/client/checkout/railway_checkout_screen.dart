import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../data/repositories/railway_order_repository.dart';
import '../../../providers/auth_providers.dart';
import '../../../providers/cart_providers.dart';

class RailwayCheckoutScreen extends ConsumerStatefulWidget {
  const RailwayCheckoutScreen({super.key});
  @override
  ConsumerState<RailwayCheckoutScreen> createState() => _RailwayCheckoutScreenState();
}

class _RailwayCheckoutScreenState extends ConsumerState<RailwayCheckoutScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _repo = RailwayOrderRepository();
  final String _key = RailwayOrderRepository.newCheckoutKey();
  bool _loading = false;
  bool? _enabled;
  String? _error;
  final _currency = NumberFormat.currency(locale: 'pt_BR', symbol: 'R\$');

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _name.text = ref.read(authProvider).name;
    });
    _check();
  }

  Future<void> _check() async {
    try {
      final enabled = await _repo.checkoutEnabled();
      if (mounted) setState(() => _enabled = enabled);
    } catch (e) {
      if (mounted) setState(() { _enabled = false; _error = e.toString(); });
    }
  }

  @override
  void dispose() { _name.dispose(); _phone.dispose(); super.dispose(); }

  Future<void> _pay() async {
    if (_loading || _enabled != true || !_formKey.currentState!.validate()) return;
    final cart = ref.read(cartProvider);
    if (cart.isEmpty) return;
    setState(() { _loading = true; _error = null; });
    try {
      final created = await _repo.createOrder(
        cart: cart, customerName: _name.text, customerPhone: _phone.text,
        idempotencyKey: _key,
      );
      final checkoutUrl = created['checkoutUrl']?.toString();
      if (checkoutUrl == null) throw StateError('Link de pagamento indisponível.');
      final uri = Uri.tryParse(checkoutUrl);
      if (uri == null || uri.scheme != 'https' || uri.host.isEmpty) {
        throw StateError('Endereço do gateway inválido.');
      }
      final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!opened) throw StateError('Não foi possível abrir o checkout. Seu pedido está salvo.');
      ref.read(cartProvider.notifier).clear();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Pedido registrado. A confirmação do pagamento será exibida em Pedidos.')));
        context.go('/orders');
      }
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally { if (mounted) setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    final cart = ref.watch(cartProvider);
    final subtotal = cart.fold<double>(0, (sum, i) => sum + i.total);
    return Scaffold(
      appBar: AppBar(title: const Text('Finalizar pedido')),
      body: ListView(padding: const EdgeInsets.all(18), children: [
        const ListTile(
          leading: Icon(Icons.storefront_outlined),
          title: Text('Retirada na loja'),
          subtitle: Text('Entrega e cálculo de frete ainda não estão disponíveis nesta versão.'),
        ),
        const SizedBox(height: 12),
        if (_enabled == null) const Center(child: CircularProgressIndicator()),
        if (_enabled == false) Card(child: Padding(
          padding: const EdgeInsets.all(16),
          child: Text(_error ?? 'A loja ainda não habilitou pagamentos reais. Nenhuma cobrança será feita.'),
        )),
        Form(key: _formKey, child: Column(children: [
          TextFormField(controller: _name, decoration: const InputDecoration(labelText: 'Nome para retirada'),
            textCapitalization: TextCapitalization.words,
            validator: (v) => v == null || v.trim().length < 2 ? 'Informe seu nome' : null),
          const SizedBox(height: 12),
          TextFormField(controller: _phone, decoration: const InputDecoration(labelText: 'Telefone para contato'),
            keyboardType: TextInputType.phone,
            validator: (v) => v == null || v.replaceAll(RegExp(r'\D'), '').length < 8 ? 'Informe seu telefone' : null),
        ])),
        const SizedBox(height: 22),
        Text('Resumo do pedido', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 10),
        for (final line in cart) ListTile(
          title: Text(line.product.name),
          subtitle: Text('${line.color} / ${line.size} • ${line.quantity} un.'),
          trailing: Text(_currency.format(line.total)),
        ),
        const Divider(),
        ListTile(title: const Text('Total estimado'), subtitle: const Text('Confirmado novamente pelo servidor'),
            trailing: Text(_currency.format(subtotal))),
        const SizedBox(height: 14),
        const Text('Pagamento seguro no Mercado Pago. O pedido só será marcado como pago após a confirmação do provedor.'),
        if (_error != null) Padding(padding: const EdgeInsets.symmetric(vertical: 12),
          child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
        const SizedBox(height: 20),
        FilledButton.icon(
          onPressed: _enabled == true && !_loading && cart.isNotEmpty ? _pay : null,
          icon: _loading ? const SizedBox(width: 16,height:16,child:CircularProgressIndicator(strokeWidth:2))
              : const Icon(Icons.lock_outline),
          label: const Text('Ir para pagamento seguro'),
        ),
      ]),
    );
  }
}
