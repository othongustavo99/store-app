import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/theme/app_colors.dart';
import '../../../data/repositories/railway_order_repository.dart';
import '../../../data/repositories/railway_shipping_repository.dart';
import '../../../data/repositories/address_repository.dart';
import '../../../models/cart_item.dart';
import '../../../providers/auth_providers.dart';
import '../../../providers/cart_providers.dart';

/// Checkout Railway: UI apenas. Preço final, estoque e frete são validados na API.
class RailwayCheckoutScreen extends ConsumerStatefulWidget {
  const RailwayCheckoutScreen({super.key});

  @override
  ConsumerState<RailwayCheckoutScreen> createState() => _RailwayCheckoutScreenState();
}

class _RailwayCheckoutScreenState extends ConsumerState<RailwayCheckoutScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _cep = TextEditingController();
  final _street = TextEditingController();
  final _number = TextEditingController();
  final _complement = TextEditingController();
  final _neighborhood = TextEditingController();
  final _city = TextEditingController();
  final _state = TextEditingController();
  final _orders = RailwayOrderRepository();
  final _shipping = RailwayShippingRepository();
  final _currency = NumberFormat.currency(locale: 'pt_BR', symbol: 'R\$');

  bool _busy = false;
  bool _quoting = false;
  bool _deliveryEnabled = false;
  bool _sandbox = true;
  bool? _paymentEnabled;
  bool _demo = false;
  String _demoMethod = 'PIX';
  String _method = 'PICKUP';
  String _error = '';
  String _quoteId = '';
  String _serviceId = '';
  String _quotedCart = '';
  String _quotedZip = '';
  DateTime? _quotedAt;
  List<Map<String, dynamic>> _options = [];
  String _checkoutKey = RailwayOrderRepository.newCheckoutKey();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _name.text = ref.read(authProvider).name;
    });
    _load();
    _prefillPrimaryAddress();
  }

  Future<void> _prefillPrimaryAddress() async {
    try {
      final list = await AddressRepository().getAddresses();
      if (!mounted || list.isEmpty || _cep.text.isNotEmpty) return;
      final address = list.firstWhere((a) => a.isPrimary, orElse: () => list.first);
      setState(() {
        _cep.text = address.zipCode;
        _street.text = address.street;
        _number.text = address.number;
        _complement.text = address.complement;
        _neighborhood.text = address.neighborhood;
        _city.text = address.city;
        _state.text = address.state;
      });
    } catch (_) {
      // Permite preenchimento manual quando o perfil estiver indisponível.
    }
  }

  Future<void> _load() async {
    try {
      final data = await Future.wait([
        _orders.checkoutAvailability(),
        _shipping.availability(),
      ]);
      if (!mounted) return;
      final availability = data[1] as Map<String, dynamic>;
      setState(() {
        final checkout=Map<String,dynamic>.from(data[0] as Map);
        _paymentEnabled = checkout['enabled'] == true;
        _demo = checkout['demo'] == true;
        _deliveryEnabled = !_demo && availability['delivery'] == true;
        _sandbox = availability['sandbox'] != false;
      });
    } catch (error) {
      if (mounted) setState(() { _paymentEnabled = false; _error = error.toString(); });
    }
  }

  @override
  void dispose() {
    for (final controller in [_name, _phone, _cep, _street, _number, _complement,
      _neighborhood, _city, _state]) {
      controller.dispose();
    }
    super.dispose();
  }

  String get _postal => _cep.text.replaceAll(RegExp(r'\D'), '');

  String _signature(List<CartItem> items) => items
      .map((line) => '${line.product.id}:${line.color}:${line.size}:${line.quantity}:${line.total}')
      .join('|');

  bool _isQuoteValid(List<CartItem> items) =>
      _quoteId.isNotEmpty && _serviceId.isNotEmpty &&
      _signature(items) == _quotedCart && _postal == _quotedZip &&
      _quotedAt != null && DateTime.now().difference(_quotedAt!) < const Duration(minutes: 15);

  Map<String, String> _address() => {
    'postalCode': _postal,
    'street': _street.text.trim(),
    'number': _number.text.trim(),
    'complement': _complement.text.trim(),
    'neighborhood': _neighborhood.text.trim(),
    'city': _city.text.trim(),
    'state': _state.text.trim().toUpperCase(),
  };

  void _selectMethod(String value) {
    setState(() {
      _method = value;
      _quoteId = '';
      _serviceId = '';
      _quotedAt = null;
      _options = [];
      _checkoutKey = RailwayOrderRepository.newCheckoutKey();
      _error = '';
    });
  }

  Future<void> _quote(List<CartItem> items) async {
    if (_quoting || !RegExp(r'^\d{8}$').hasMatch(_postal)) {
      setState(() => _error = 'Informe um CEP válido com oito números.');
      return;
    }
    if (items.isEmpty) return;
    setState(() {
      _quoting = true;
      _error = '';
      _options = [];
      _quoteId = '';
      _serviceId = '';
      _quotedAt = null;
    });
    try {
      final result = await _shipping.quote(items, _postal);
      if (!mounted) return;
      setState(() {
        _quoteId = result['quoteId']?.toString() ?? '';
        _options = (result['options'] as List? ?? const [])
            .map((value) => Map<String, dynamic>.from(value as Map))
            .toList();
        _quotedCart = _signature(items);
        _quotedZip = _postal;
        _quotedAt = DateTime.now();
        _checkoutKey = RailwayOrderRepository.newCheckoutKey();
        if (result['sandbox'] == true) {
          _sandbox = true;
          _error = 'Cotação do ambiente de teste: não é possível cobrar este frete.';
        }
      });
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _quoting = false);
    }
  }

  Future<void> _pay(List<CartItem> items) async {
    if (_busy || _paymentEnabled != true || !_form.currentState!.validate()) return;
    if (items.isEmpty) return;
    if (_method == 'DELIVERY' && !_isQuoteValid(items)) {
      setState(() => _error = 'Atualize a cotação e selecione uma transportadora para continuar.');
      return;
    }
    setState(() { _busy = true; _error = ''; });
    try {
      final response = await _orders.createOrder(
        cart: items,
        customerName: _name.text,
        customerPhone: _phone.text,
        idempotencyKey: _checkoutKey,
        fulfillment: _method,
        quoteId: _method == 'DELIVERY' ? _quoteId : null,
        serviceId: _method == 'DELIVERY' ? _serviceId : null,
        address: _method == 'DELIVERY' ? _address() : null,
        demoPaymentMethod: _demo ? _demoMethod : null,
      );
      if (response['simulated'] == true && response['order'] is Map &&
          (response['order'] as Map)['isDemo'] == true) {
        ref.read(cartProvider.notifier).clear();
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Pedido de demonstração criado! Nenhum valor foi cobrado.')));
        context.go('/orders');
        return;
      }
      final uri = Uri.tryParse(response['checkoutUrl']?.toString() ?? '');
      if (uri == null || uri.scheme != 'https' || uri.host.isEmpty) {
        throw StateError('O pedido foi registrado, mas o link de pagamento não está disponível. Consulte seus pedidos.');
      }
      final launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!launched) {
        throw StateError('O pedido foi registrado, mas não conseguimos abrir o pagamento. Consulte seus pedidos.');
      }
      ref.read(cartProvider.notifier).clear();
      if (mounted) context.go('/orders');
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _field(TextEditingController controller, String title,
      {bool isRequired = true, TextInputType? type, String? Function(String?)? validator}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextFormField(
        controller: controller,
        keyboardType: type,
        textInputAction: TextInputAction.next,
        decoration: InputDecoration(labelText: title),
        validator: validator ?? (text) => isRequired && (text == null || text.trim().isEmpty)
            ? 'Preencha este campo.' : null,
      ),
    );
  }

  Widget _section(BuildContext context, String title, IconData icon, Widget content) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(children: [
              Icon(icon, size: 20, color: AppColors.primary),
              const SizedBox(width: 8),
              Expanded(child: Text(title,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800))),
            ]),
            const SizedBox(height: 14),
            content,
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final items = ref.watch(cartProvider);
    final subtotal = items.fold<double>(0, (sum, line) => sum + line.total);
    final selected = _options.where((rate) => rate['id'].toString() == _serviceId).toList();
    final cents = selected.isEmpty ? 0 : (selected.first['priceCents'] as num?)?.toInt() ?? 0;
    final quoteValid = _isQuoteValid(items);
    final shippingPrice = _method == 'PICKUP' ? 0.0 : cents / 100;
    final canPay = _paymentEnabled == true && !_busy && items.isNotEmpty &&
        (_method == 'PICKUP' || (!_sandbox && quoteValid));

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Finalizar pedido')),
      body: items.isEmpty
          ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.shopping_cart_outlined, size: 48),
              const SizedBox(height: 12),
              const Text('Seu carrinho está vazio.'),
              const SizedBox(height: 12),
              FilledButton(onPressed: () => context.go('/cart'), child: const Text('Voltar ao carrinho')),
            ]))
          : Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 1120),
                child: LayoutBuilder(builder: (context, limits) {
                  final wide = limits.maxWidth >= 780;
                  final details = Form(
                    key: _form,
                    child: Column(
                      children: [
                        _section(context, '1. Recebimento', Icons.local_shipping_outlined,
                          Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                            SegmentedButton<String>(
                              segments: [
                                const ButtonSegment(value: 'PICKUP', label: Text('Retirada'), icon: Icon(Icons.storefront)),
                                if (_deliveryEnabled) const ButtonSegment(value: 'DELIVERY', label: Text('Entrega'), icon: Icon(Icons.local_shipping_outlined)),
                              ],
                              selected: {_method},
                              onSelectionChanged: (values) => _selectMethod(values.first),
                            ),
                            if (!_deliveryEnabled) const Padding(
                              padding: EdgeInsets.only(top: 10),
                              child: Text('Entrega ainda não configurada. A retirada continua disponível.',
                                  style: TextStyle(color: AppColors.textSecondary)),
                            ),
                          ])),
                        const SizedBox(height: 12),
                        _section(context, '2. Seus dados', Icons.person_outline, Column(children: [
                          _field(_name, 'Nome completo'),
                          _field(_phone, 'Telefone com DDD', type: TextInputType.phone,
                            validator: (value) => RegExp(r'^\d{10,11}$').hasMatch((value ?? '').replaceAll(RegExp(r'\D'), ''))
                                ? null : 'Informe um telefone com DDD.'),
                          if (_method == 'DELIVERY') ...[
                            Row(children: [
                              Expanded(child: _field(_cep, 'CEP (8 números)', type: TextInputType.number,
                                  validator: (value) => RegExp(r'^\d{8}$').hasMatch((value ?? '').replaceAll(RegExp(r'\D'), ''))
                                      ? null : 'CEP inválido.')),
                              const SizedBox(width: 8),
                              Padding(
                                padding: const EdgeInsets.only(bottom: 12),
                                child: FilledButton.tonalIcon(
                                  onPressed: _quoting ? null : () => _quote(items),
                                  icon: _quoting
                                      ? const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2))
                                      : const Icon(Icons.search),
                                  label: const Text('Cotar'),
                                ),
                              ),
                            ]),
                            _field(_street, 'Logradouro'),
                            _field(_number, 'Número'),
                            _field(_complement, 'Complemento', isRequired: false),
                            _field(_neighborhood, 'Bairro'),
                            _field(_city, 'Cidade'),
                            _field(_state, 'UF (ex.: SP)',
                                validator: (value) => RegExp(r'^[a-zA-Z]{2}$').hasMatch((value ?? '').trim())
                                    ? null : 'Informe a sigla da UF.'),
                          ],
                        ])),
                        if (_method == 'DELIVERY') ...[
                          const SizedBox(height: 12),
                          _section(context, '3. Frete', Icons.inventory_2_outlined,
                            Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                              if (_options.isEmpty) const Text('Informe o CEP e solicite uma cotação.'),
                              for (final rate in _options)
                                RadioListTile<String>(
                                  value: rate['id'].toString(),
                                  groupValue: _serviceId,
                                  onChanged: (value) => setState(() => _serviceId = value ?? ''),
                                  contentPadding: EdgeInsets.zero,
                                  title: Text('${rate['carrier']} · ${rate['name']}'),
                                  subtitle: Text('${rate['deliveryDays']} dia(s) úteis estimados'),
                                  secondary: Text(_currency.format(((rate['priceCents'] as num?)?.toInt() ?? 0) / 100)),
                                ),
                              if (_quoteId.isNotEmpty)
                                Text(quoteValid ? 'Cotação válida por até 15 minutos.' : 'Cotação vencida ou carrinho alterado. Calcule novamente.',
                                  style: TextStyle(color: quoteValid ? AppColors.textSecondary : AppColors.error)),
                              if (_sandbox) const Text('Ambiente de testes: cotações não permitem cobrança real.',
                                style: TextStyle(color: AppColors.textSecondary)),
                            ])),
                        ],
                      ],
                    ),
                  );
                  final summary = _section(context, 'Resumo e confirmação', Icons.receipt_long_outlined,
                    Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      for (final line in items)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: Row(children: [
                            Expanded(child: Text('${line.product.name}\n${line.color} · ${line.size} · ${line.quantity} un.',
                                maxLines: 3, overflow: TextOverflow.ellipsis)),
                            const SizedBox(width: 8),
                            Text(_currency.format(line.total)),
                          ]),
                        ),
                      const Divider(height: 24),
                      _summaryLine('Produtos', _currency.format(subtotal)),
                      const SizedBox(height: 10),
                      _summaryLine('Frete', _method == 'PICKUP' ? 'Retirada sem custo' :
                          selected.isEmpty || !quoteValid ? 'A calcular' : _currency.format(shippingPrice)),
                      const Divider(height: 24),
                      if (_method == 'PICKUP' || (selected.isNotEmpty && quoteValid))
                        _summaryLine('Total estimado', _currency.format(subtotal + shippingPrice), emphasized: true)
                      else
                        const Text('O total será exibido após escolher o frete.'),
                      const SizedBox(height: 12),
                      if (_demo) ...[
                        const Padding(padding: EdgeInsets.symmetric(vertical: 8), child: Text(
                          'MODO DEMONSTRAÇÃO — Nenhuma cobrança real será feita. Pedidos são fictícios.',
                          style: TextStyle(fontWeight: FontWeight.w700, color: Colors.deepOrange))),
                        SegmentedButton<String>(
                          segments: const [
                            ButtonSegment(value:'PIX',label:Text('Pix simulado'),icon:Icon(Icons.qr_code)),
                            ButtonSegment(value:'CARD',label:Text('Cartão simulado'),icon:Icon(Icons.credit_card)),
                          ], selected:{_demoMethod},
                          onSelectionChanged: (methods) => setState(() {
                            _demoMethod=methods.first;
                            _checkoutKey=RailwayOrderRepository.newCheckoutKey();
                          }),
                        ),
                        const SizedBox(height: 12),
                      ],
                      if (_paymentEnabled == null) const Center(child: CircularProgressIndicator()),
                      if (_paymentEnabled == false)
                        const Card(
                          color: AppColors.divider,
                          child: Padding(
                            padding: EdgeInsets.all(12),
                            child: Text('Pagamentos ainda não habilitados nesta loja. Você pode conferir o carrinho e testar a cotação, mas não concluir a compra.'),
                          ),
                        ),
                      if (_error.isNotEmpty)
                        Padding(padding: const EdgeInsets.symmetric(vertical: 12),
                          child: Text(_error, style: const TextStyle(color: AppColors.error))),
                      const SizedBox(height: 10),
                      FilledButton.icon(
                        onPressed: canPay ? () => _pay(items) : null,
                        icon: _busy
                            ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                            : const Icon(Icons.lock_outline),
                        label: Text(_busy ? 'Preparando pedido…' : (_demo ? 'Concluir pedido simulado' : 'Ir para pagamento seguro')),
                      ),
                      const SizedBox(height: 10),
                      Text(_demo
                          ? 'Preço e estoque são revalidados na API. Esta compra não movimenta dinheiro.'
                          : 'O preço, o estoque e a entrega são revalidados pelo servidor antes de criar a cobrança.',
                        style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                    ]));
                  if (wide) {
                    return SingleChildScrollView(
                      padding: const EdgeInsets.all(16),
                      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Expanded(flex: 3, child: details),
                        const SizedBox(width: 16),
                        Expanded(flex: 2, child: summary),
                      ]),
                    );
                  }
                  return ListView(padding: const EdgeInsets.all(12), children: [
                    details,
                    const SizedBox(height: 12),
                    summary,
                    const SizedBox(height: 16),
                  ]);
                }),
              ),
            ),
    );
  }

  Widget _summaryLine(String label, String value, {bool emphasized = false}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Expanded(child: Text(label, style: TextStyle(fontWeight: emphasized ? FontWeight.w800 : FontWeight.w400))),
        const SizedBox(width: 8),
        Text(value, style: TextStyle(fontWeight: FontWeight.w700, fontSize: emphasized ? 18 : 14)),
      ],
    );
  }
}
