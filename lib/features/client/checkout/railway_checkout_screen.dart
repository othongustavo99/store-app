import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/network/loja_api.dart';
import '../../../data/repositories/address_repository.dart';
import '../../../data/repositories/railway_coupon_repository.dart';
import '../../../data/repositories/railway_order_repository.dart';
import '../../../data/repositories/railway_shipping_repository.dart';
import '../../../data/services/shipping_service.dart';
import '../../../models/cart_item.dart';
import '../../../models/saved_address.dart';
import '../../../providers/auth_providers.dart';
import '../../../providers/cart_providers.dart';
import '../../../router/app_back_button.dart';
import '../widgets/empty_state.dart';

class RailwayCheckoutScreen extends ConsumerStatefulWidget {
  const RailwayCheckoutScreen(
      {super.key,
      this.orders,
      this.shipping,
      this.coupons,
      this.addresses,
      this.cepService,
      this.openPayment});
  final RailwayOrderRepository? orders;
  final RailwayShippingRepository? shipping;
  final RailwayCouponRepository? coupons;
  final AddressRepository? addresses;
  final ShippingService? cepService;
  final Future<bool> Function(Uri)? openPayment;
  @override
  ConsumerState<RailwayCheckoutScreen> createState() =>
      _RailwayCheckoutScreenState();
}

class _RailwayCheckoutScreenState extends ConsumerState<RailwayCheckoutScreen> {
  final _form = GlobalKey<FormState>();
  final _scroll = ScrollController();
  final _name = TextEditingController(), _phone = TextEditingController();
  final _cep = TextEditingController(), _street = TextEditingController();
  final _number = TextEditingController(),
      _complement = TextEditingController();
  final _neighborhood = TextEditingController(),
      _city = TextEditingController();
  final _state = TextEditingController(), _notes = TextEditingController();
  final _coupon = TextEditingController();
  late final _orders = widget.orders ?? RailwayOrderRepository();
  late final _shipping = widget.shipping ?? RailwayShippingRepository();
  late final _coupons = widget.coupons ?? RailwayCouponRepository();
  late final _cepService = widget.cepService ?? ShippingService();
  final _money = NumberFormat.currency(locale: 'pt_BR', symbol: 'R\$');
  Map<String, dynamic> _availability = {}, _receiving = {};
  bool _loading = true, _loadFailed = false, _busy = false;
  bool _quoting = false, _findingCep = false, _validatingCoupon = false;
  int _step = 0, _quoteRevision = 0, _cepRevision = 0, _couponRevision = 0;
  String _method = 'PICKUP', _payment = '', _error = '';
  String _quoteId = '', _serviceId = '', _quotedCart = '', _quotedZip = '';
  String? _validatedCode, _couponSignature;
  int _discountCents = 0;
  DateTime? _quoteExpires;
  bool _quoteSandbox = false;
  List<Map<String, dynamic>> _rates = [];
  List<SavedAddress> _saved = [];
  final _autoFilled = <TextEditingController, String>{};
  Timer? _cepTimer, _expiryTimer;
  String _checkoutKey = RailwayOrderRepository.newCheckoutKey();
  Map<String, dynamic>? _recorded;

  List<TextEditingController> get _inputs => [
        _name,
        _phone,
        _cep,
        _street,
        _number,
        _complement,
        _neighborhood,
        _city,
        _state,
        _notes
      ];
  bool get _demo => _availability['demo'] == true;
  String get _postal => _cep.text.replaceAll(RegExp(r'\D'), '');
  String get _couponCode => _coupon.text.trim().toUpperCase();
  bool get _delivery => _method != 'PICKUP';
  List<String> get _payments => _demo
      ? ['PIX', 'CARD']
      : [
          if (_availability['realEnabled'] == true) 'GATEWAY',
          if (_method != 'CARRIER')
            for (final entry
                in (_availability['offlineMethods'] as List? ?? []))
              if (_method == 'PICKUP' || entry != 'PAY_ON_PICKUP') '$entry',
        ];
  String _paymentName(String value) => switch (value) {
        'PIX' => 'Pix simulado',
        'CARD' => 'Cartão simulado',
        'GATEWAY' => 'Pagamento online',
        'PAY_ON_PICKUP' => 'Pagar na retirada',
        'MANUAL_PIX' => 'Pix combinado com a loja',
        'WHATSAPP' => 'Combinar com a loja',
        _ => 'Escolha uma forma de pagamento',
      };
  String get _methodName => switch (_method) {
        'LOCAL' => 'Entrega local',
        'CARRIER' => 'Transportadora',
        _ => 'Retirada na loja',
      };
  String _signature(List<CartItem> items) => items
      .map((i) =>
          '${i.product.id}:${i.color}:${i.size}:${i.quantity}:${i.total}')
      .join('|');
  bool _validQuote(List<CartItem> items) =>
      !_quoteSandbox &&
      _quoteId.isNotEmpty &&
      _serviceId.isNotEmpty &&
      _postal == _quotedZip &&
      _quotedCart == _signature(items) &&
      _quoteExpires != null &&
      DateTime.now().isBefore(_quoteExpires!);
  bool _validCoupon(List<CartItem> items) =>
      _couponCode.isEmpty ||
      (_validatedCode == _couponCode && _couponSignature == _signature(items));
  Map<String, String> _address() => {
        'postalCode': _postal,
        'street': _street.text.trim(),
        'number': _number.text.trim(),
        'complement': _complement.text.trim(),
        'neighborhood': _neighborhood.text.trim(),
        'city': _city.text.trim(),
        'state': _state.text.trim().toUpperCase()
      };

  @override
  void initState() {
    super.initState();
    for (final input in _inputs) {
      input.addListener(_intentChanged);
    }
    _cep.addListener(_cepChanged);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _name.text.isEmpty) {
        _name.text = ref.read(authProvider).name;
      }
    });
    _load();
    _loadAddresses();
  }

  void _intentChanged() {
    if (_busy || _recorded != null) return;
    _checkoutKey = RailwayOrderRepository.newCheckoutKey();
  }

  void _showError(String message) {
    setState(() => _error = message);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _scroll.hasClients) {
        _scroll.animateTo(0,
            duration: const Duration(milliseconds: 220), curve: Curves.easeOut);
      }
    });
  }

  String _message(Object error, String fallback) =>
      error is LojaApiException ? error.message : fallback;
  Future<void> _load() async {
    setState(() {
      _loading = true;
      _loadFailed = false;
      _error = '';
    });
    try {
      final data = await Future.wait(
          [_orders.checkoutAvailability(), _shipping.availability()]);
      if (!mounted) return;
      setState(() {
        _availability = data[0];
        _receiving = data[1];
        if ((_method == 'LOCAL' &&
                (_demo || _receiving['localDelivery'] != true)) ||
            (_method == 'CARRIER' &&
                (_demo ||
                    _receiving['delivery'] != true ||
                    _receiving['sandbox'] != false))) {
          _method = 'PICKUP';
          _invalidateQuote();
        }
        if (!_payments.contains(_payment)) {
          _payment = _payments.firstOrNull ?? '';
        }
      });
    } catch (_) {
      if (mounted) setState(() => _loadFailed = true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadAddresses() async {
    try {
      final addresses =
          await (widget.addresses ?? AddressRepository()).getAddresses();
      if (!mounted) return;
      setState(() => _saved = addresses);
      if (addresses.isNotEmpty &&
          [_cep, _street, _number, _city].every((c) => c.text.isEmpty)) {
        _applyAddress(addresses.firstWhere((a) => a.isPrimary,
            orElse: () => addresses.first));
      }
    } catch (_) {/* O preenchimento manual permanece disponível. */}
  }

  void _applyAddress(SavedAddress address) {
    setState(() {
      _cep.text = address.zipCode;
      _street.text = address.street;
      _number.text = address.number;
      _complement.text = address.complement;
      _neighborhood.text = address.neighborhood;
      _city.text = address.city;
      _state.text = address.state;
    });
  }

  void _invalidateQuote() {
    _quoteRevision++;
    _expiryTimer?.cancel();
    _quoteId = '';
    _serviceId = '';
    _rates = [];
    _quoteExpires = null;
    _quoting = false;
  }

  void _cepChanged() {
    _cepTimer?.cancel();
    final revision = ++_cepRevision;
    for (final entry in _autoFilled.entries) {
      if (entry.key.text == entry.value) entry.key.clear();
    }
    _autoFilled.clear();
    setState(() {
      _invalidateQuote();
      _findingCep = false;
    });
    final zip = _postal;
    if (zip.length != 8 || !_delivery) return;
    _cepTimer = Timer(const Duration(milliseconds: 450), () async {
      if (!mounted || revision != _cepRevision) return;
      setState(() => _findingCep = true);
      try {
        final data =
            await _cepService.fetchCep(zip).timeout(const Duration(seconds: 8));
        if (!mounted || _busy || revision != _cepRevision || data == null) {
          return;
        }
        for (final pair in [
          (_street, 'logradouro'),
          (_neighborhood, 'bairro'),
          (_city, 'localidade'),
          (_state, 'uf')
        ]) {
          if (pair.$1.text.isEmpty) {
            final value = data[pair.$2]?.toString() ?? '';
            pair.$1.text = value;
            if (value.isNotEmpty) _autoFilled[pair.$1] = value;
          }
        }
      } catch (_) {
        /* Consulta auxiliar: não bloqueia endereço manual. */
      } finally {
        if (mounted && revision == _cepRevision) {
          setState(() => _findingCep = false);
        }
      }
    });
  }

  void _chooseMethod(String method) {
    if (_busy) return;
    _cepTimer?.cancel();
    _cepRevision++;
    setState(() {
      _findingCep = false;
      _method = method;
      _invalidateQuote();
      _error = '';
      if (!_payments.contains(_payment)) _payment = _payments.firstOrNull ?? '';
      _checkoutKey = RailwayOrderRepository.newCheckoutKey();
    });
  }

  Future<void> _quote() async {
    if (_quoting || _busy) return;
    if (!RegExp(r'^\d{8}$').hasMatch(_postal)) {
      _showError('Informe um CEP com oito números para consultar a entrega.');
      return;
    }
    final items = List<CartItem>.of(ref.read(cartProvider));
    if (items.isEmpty) return;
    final zip = _postal, signature = _signature(items), method = _method;
    final revision = ++_quoteRevision;
    setState(() {
      _quoting = true;
      _quoteId = '';
      _serviceId = '';
      _rates = [];
      _error = '';
    });
    try {
      final data = await _shipping.quote(items, zip, mode: method);
      if (!mounted ||
          revision != _quoteRevision ||
          zip != _postal ||
          method != _method ||
          signature != _signature(ref.read(cartProvider))) {
        return;
      }
      final expires = DateTime.tryParse('${data['expiresAt']}');
      final rates = (data['options'] as List? ?? [])
          .map((r) => Map<String, dynamic>.from(r as Map))
          .toList();
      if (expires == null ||
          !expires.isAfter(DateTime.now()) ||
          rates.isEmpty) {
        _showError('Não há uma cotação válida. Consulte a entrega novamente.');
        return;
      }
      setState(() {
        _quoteId = data['quoteId']?.toString() ?? '';
        _rates = rates;
        _quotedZip = zip;
        _quotedCart = signature;
        _quoteExpires = expires;
        _quoteSandbox = data['sandbox'] == true;
        _serviceId = rates.length == 1 ? '${rates.first['id']}' : '';
        _checkoutKey = RailwayOrderRepository.newCheckoutKey();
      });
      _expiryTimer?.cancel();
      _expiryTimer = Timer(expires.difference(DateTime.now()), () {
        if (mounted) setState(() {});
      });
    } catch (e) {
      if (mounted && revision == _quoteRevision) {
        _showError(_message(
            e, 'Não foi possível consultar a entrega. Tente novamente.'));
      }
    } finally {
      if (mounted && revision == _quoteRevision) {
        setState(() => _quoting = false);
      }
    }
  }

  Future<void> _checkCoupon() async {
    if (_validatingCoupon || _busy) return;
    final code = _couponCode, items = List<CartItem>.of(ref.read(cartProvider));
    final signature = _signature(items), revision = ++_couponRevision;
    if (code.isEmpty) return;
    setState(() {
      _validatingCoupon = true;
      _validatedCode = null;
      _discountCents = 0;
      _error = '';
    });
    try {
      final result = await _coupons.preview(code, items);
      if (!mounted ||
          revision != _couponRevision ||
          code != _couponCode ||
          signature != _signature(ref.read(cartProvider))) {
        return;
      }
      setState(() {
        _validatedCode = code;
        _couponSignature = signature;
        _discountCents = int.tryParse('${result['discountCents']}') ?? 0;
        _checkoutKey = RailwayOrderRepository.newCheckoutKey();
      });
    } catch (e) {
      if (mounted && revision == _couponRevision) {
        _showError(
            _message(e, 'Não foi possível validar o cupom. Tente novamente.'));
      }
    } finally {
      if (mounted && revision == _couponRevision) {
        setState(() => _validatingCoupon = false);
      }
    }
  }

  void _couponChanged() {
    setState(() {
      _couponRevision++;
      _validatingCoupon = false;
      _validatedCode = null;
      _couponSignature = null;
      _discountCents = 0;
      _checkoutKey = RailwayOrderRepository.newCheckoutKey();
    });
  }

  void _goStep(int step) {
    if (_busy) return;
    if (step > _step && _step == 0) {
      if (_form.currentState?.validate() != true) return;
      if (_delivery && !_validQuote(ref.read(cartProvider))) {
        _showError(
            'Consulte a entrega e selecione uma opção válida antes de continuar.');
        return;
      }
    }
    if (step > _step && _step == 1 && !_payments.contains(_payment)) {
      _showError(
          'Escolha uma forma de pagamento disponível para este recebimento.');
      return;
    }
    setState(() {
      _step = step;
      _error = '';
    });
    if (_scroll.hasClients) _scroll.jumpTo(0);
  }

  Future<void> _pay() async {
    if (_busy ||
        _availability['enabled'] != true ||
        _step != 2 ||
        _recorded != null) {
      return;
    }
    final items = List<CartItem>.of(ref.read(cartProvider));
    if (!_validCoupon(items) || _validatingCoupon) {
      _showError('Valide o cupom para este carrinho ou remova o código.');
      return;
    }
    if (_delivery && !_validQuote(items)) {
      _goStep(0);
      _showError(
          'A cotação expirou ou o carrinho mudou. Consulte a entrega novamente.');
      return;
    }
    if (!_payments.contains(_payment) || items.isEmpty) return;
    final signature = _signature(items);
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      final result = await _orders.createOrder(
          cart: items,
          customerName: _name.text,
          customerPhone: _phone.text,
          idempotencyKey: _checkoutKey,
          fulfillment: _delivery ? 'DELIVERY' : 'PICKUP',
          quoteId: _delivery ? _quoteId : null,
          serviceId: _delivery ? _serviceId : null,
          address: _delivery ? _address() : null,
          notes: _notes.text,
          couponCode: _validatedCode,
          demoPaymentMethod: _demo ? _payment : null,
          offlineMethod: !_demo && _payment != 'GATEWAY' ? _payment : null);
      if (!mounted) return;
      if (result['order'] is! Map || (result['order'] as Map)['id'] == null) {
        _showError(
            'Não foi possível confirmar a resposta. Tente novamente sem alterar os dados ou confira Meus pedidos.');
        return;
      }
      setState(() => _recorded = result);
      if (signature == _signature(ref.read(cartProvider))) {
        ref.read(cartProvider.notifier).clear();
      }
      // Confirmação permanece na tela; abrir o pagamento não cria outro pedido.
    } catch (e) {
      if (mounted) {
        _showError(_message(e,
            'Não foi possível confirmar o pedido. Confira Meus pedidos ou tente novamente sem alterar os dados.'));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _openPayment() async {
    if (_busy || _recorded == null) return;
    setState(() => _busy = true);
    try {
      final order = Map<String, dynamic>.from(_recorded!['order'] as Map);
      final url = _recorded!['checkoutUrl']?.toString() ??
          await _orders.retryCheckout('${order['id']}');
      final uri = Uri.tryParse(url);
      if (uri == null ||
          uri.scheme != 'https' ||
          !uri.hasAuthority ||
          uri.userInfo.isNotEmpty) {
        throw StateError('Link indisponível');
      }
      final opened = await (widget.openPayment?.call(uri) ??
          launchUrl(uri, mode: LaunchMode.externalApplication));
      if (!opened) throw StateError('Aplicativo de pagamento indisponível');
    } catch (_) {
      if (mounted) {
        _showError(
            'Seu pedido está salvo. Não conseguimos abrir o pagamento; tente novamente ou acesse Meus pedidos.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    _cepTimer?.cancel();
    _expiryTimer?.cancel();
    _scroll.dispose();
    _cep.removeListener(_cepChanged);
    for (final input in _inputs) {
      input.removeListener(_intentChanged);
      input.dispose();
    }
    _coupon.dispose();
    super.dispose();
  }

  Widget _field(TextEditingController controller, String label,
          {int max = 100,
          int lines = 1,
          bool required = true,
          TextInputType? type,
          String? Function(String?)? validator}) =>
      Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: TextFormField(
              controller: controller,
              enabled: !_busy,
              maxLength: max,
              maxLines: lines,
              keyboardType: type,
              textInputAction:
                  lines == 1 ? TextInputAction.next : TextInputAction.newline,
              decoration: InputDecoration(labelText: label, counterText: ''),
              validator: validator ??
                  (text) => required && (text ?? '').trim().isEmpty
                      ? 'Preencha este campo.'
                      : null));
  Widget _card(String title, List<Widget> children) => Card(
      child: Padding(
          padding: const EdgeInsets.all(18),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(title,
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 16),
            ...children
          ])));
  Widget _text(String text) =>
      Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(text));
  Widget _line(String label, String value, {bool bold = false}) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Wrap(
          alignment: WrapAlignment.spaceBetween,
          spacing: 16,
          runSpacing: 4,
          children: [
            Text(label),
            Text(value,
                style: TextStyle(
                    fontWeight: bold ? FontWeight.w800 : FontWeight.w600,
                    fontSize: bold ? 20 : 14))
          ]));
  Widget _details(List<CartItem> items) => Form(
      key: _form,
      child: Column(children: [
        _card('Como deseja receber?', [
          RadioGroup<String>(
              groupValue: _method,
              onChanged: (v) {
                if (v != null) _chooseMethod(v);
              },
              child: Column(children: [
                const RadioListTile(
                    value: 'PICKUP',
                    title: Text('Retirar na loja'),
                    subtitle: Text('Sem taxa de entrega'),
                    contentPadding: EdgeInsets.zero),
                if (!_demo && _receiving['localDelivery'] == true)
                  RadioListTile(
                      value: 'LOCAL',
                      title: const Text('Entrega local'),
                      contentPadding: EdgeInsets.zero,
                      subtitle: Text(
                          'Consulte seu CEP · ${_money.format(((_receiving['localFeeCents'] as num?) ?? 0) / 100)}')),
                if (!_demo &&
                    _availability['realEnabled'] == true &&
                    _receiving['delivery'] == true &&
                    _receiving['sandbox'] == false)
                  const RadioListTile(
                      value: 'CARRIER',
                      title: Text('Transportadora'),
                      subtitle: Text('Consulte prazo e frete pelo CEP'),
                      contentPadding: EdgeInsets.zero),
              ])),
          if (!_delivery) ...[
            _text((_receiving['pickupAddress']?.toString() ?? '').isEmpty
                ? 'Combine o endereço de retirada com a loja.'
                : '${_receiving['pickupAddress']}'),
            if ('${_receiving['pickupHours'] ?? ''}'.isNotEmpty)
              _text('${_receiving['pickupHours']}'),
            _text(
                'Aguarde a loja informar que seu pedido está pronto antes de ir buscar.'),
          ],
        ]),
        const SizedBox(height: 12),
        _card('Seus dados', [
          _field(_name, 'Nome completo',
              validator: (v) =>
                  (v ?? '').trim().length < 2 ? 'Informe seu nome.' : null),
          _field(_phone, 'Telefone com DDD', max: 22, type: TextInputType.phone,
              validator: (v) {
            final digits = (v ?? '').replaceAll(RegExp(r'\D'), '');
            return RegExp(r'^(?:55)?\d{10,11}$').hasMatch(digits)
                ? null
                : 'Informe um telefone com DDD.';
          }),
        ]),
        if (_delivery) ...[
          const SizedBox(height: 12),
          _card('Endereço de entrega', [
            if (_saved.isNotEmpty)
              Wrap(spacing: 8, children: [
                for (final a in _saved)
                  ActionChip(
                      label: Text(a.label),
                      onPressed: _busy ? null : () => _applyAddress(a))
              ]),
            const SizedBox(height: 8),
            _field(_cep, 'CEP',
                max: 9,
                type: TextInputType.number,
                validator: (_) => _postal.length == 8
                    ? null
                    : 'Informe os oito números do CEP.'),
            if (_findingCep)
              _text(
                  'Buscando endereço; você também pode preencher manualmente.'),
            _field(_street, 'Logradouro',
                max: 150,
                validator: (v) => (v ?? '').trim().length < 3
                    ? 'Informe o logradouro.'
                    : null),
            _field(_number, 'Número', max: 30),
            _field(_complement, 'Complemento (opcional)', required: false),
            _field(_neighborhood, 'Bairro',
                validator: (v) =>
                    (v ?? '').trim().length < 2 ? 'Informe o bairro.' : null),
            _field(_city, 'Cidade',
                validator: (v) =>
                    (v ?? '').trim().length < 2 ? 'Informe a cidade.' : null),
            _field(_state, 'UF',
                max: 2,
                validator: (v) =>
                    RegExp(r'^[a-zA-Z]{2}$').hasMatch((v ?? '').trim())
                        ? null
                        : 'Informe a sigla da UF.'),
            OutlinedButton.icon(
                onPressed: _quoting || _busy ? null : _quote,
                icon: _quoting
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.local_shipping_outlined),
                label: Text(_quoting ? 'Consultando…' : 'Consultar entrega')),
            if (_rates.isNotEmpty)
              RadioGroup<String>(
                  groupValue: _serviceId,
                  onChanged: (v) {
                    if (v != null && !_busy) {
                      setState(() {
                        _serviceId = v;
                        _intentChanged();
                      });
                    }
                  },
                  child: Column(children: [
                    for (final rate in _rates)
                      RadioListTile<String>(
                        contentPadding: EdgeInsets.zero,
                        value: '${rate['id']}',
                        title: Text(
                            '${rate['carrier']} · ${_money.format(((rate['priceCents'] as num?) ?? 0) / 100)}'),
                        subtitle: Text(_method == 'LOCAL'
                            ? '${rate['name']}'
                            : '${rate['name']} · ${rate['deliveryDays']} dia(s) úteis estimados'),
                      )
                  ])),
            if (_quoteSandbox)
              _text('Cotação de teste indisponível para concluir a compra.'),
            if (_quoteId.isNotEmpty && !_validQuote(items))
              _text(
                  'Selecione uma opção válida ou consulte a entrega novamente.'),
          ])
        ],
        const SizedBox(height: 12),
        _card('Observação para a loja', [
          _field(_notes, 'Observação (opcional)',
              max: 500, lines: 3, required: false),
        ]),
      ]));
  Widget _paymentStep() => _card('Como deseja pagar?', [
        if (_payments.isEmpty)
          _text(
              'Não há pagamento disponível para este recebimento. Volte e escolha outra opção ou fale com a loja.'),
        RadioGroup<String>(
            groupValue: _payment,
            onChanged: (v) {
              if (v != null && !_busy) {
                setState(() {
                  _payment = v;
                  _intentChanged();
                });
              }
            },
            child: Column(children: [
              for (final method in _payments)
                RadioListTile(
                    value: method,
                    contentPadding: EdgeInsets.zero,
                    title: Text(_paymentName(method)))
            ])),
        _text(_demo
            ? 'Demonstração: nenhum valor será cobrado.'
            : _payment == 'GATEWAY'
                ? 'Você abrirá o ambiente seguro do pagamento após registrar o pedido.'
                : 'O pedido ficará aguardando pagamento. Combine os dados oficiais com a loja; ela confirmará o recebimento.'),
      ]);
  Widget _review(List<CartItem> items, double subtotal, double shipping) =>
      Column(children: [
        _card('Confira antes de confirmar', [
          _text(_name.text.trim()),
          _text(_phone.text.trim()),
          _text(_methodName),
          if (_delivery)
            _text(
                '${_street.text}, ${_number.text}${_complement.text.isEmpty ? '' : ' · ${_complement.text}'}\n${_neighborhood.text} · ${_city.text}/${_state.text.toUpperCase()} · CEP ${_cep.text}'),
          if (!_delivery) ...[
            _text(
                '${_receiving['pickupAddress'] ?? 'Combine a retirada com a loja.'}'),
            _text('${_receiving['pickupHours'] ?? ''}')
          ],
          if (_delivery && _rates.any((r) => '${r['id']}' == _serviceId))
            _text(
                '${_rates.firstWhere((r) => '${r['id']}' == _serviceId)['name']}'),
          if (_notes.text.trim().isNotEmpty)
            _text('Observação: ${_notes.text.trim()}'),
          TextButton(
              onPressed: () => _goStep(0),
              child: const Text('Alterar recebimento e contato')),
          const Divider(),
          _text(_paymentName(_payment)),
          TextButton(
              onPressed: () => _goStep(1),
              child: const Text('Alterar pagamento')),
        ]),
        const SizedBox(height: 12),
        _card('Resumo do pedido', [
          for (final item in items)
            _line(
                '${item.product.name}\n${item.color} · ${item.size} · ${item.quantity} un.',
                _money.format(item.total)),
          const Divider(),
          _line('Produtos', _money.format(subtotal)),
          TextField(
              controller: _coupon,
              enabled: !_busy,
              onChanged: (_) => _couponChanged(),
              decoration: InputDecoration(
                  labelText: 'Cupom de desconto',
                  suffixIcon: IconButton(
                      tooltip: 'Remover cupom',
                      onPressed: _busy
                          ? null
                          : () {
                              _coupon.clear();
                              _couponChanged();
                            },
                      icon: const Icon(Icons.close)))),
          OutlinedButton(
              onPressed: _validatingCoupon || _busy ? null : _checkCoupon,
              child: Text(_validatingCoupon ? 'Validando…' : 'Aplicar cupom')),
          if (!_validCoupon(items) && _couponCode.isNotEmpty)
            _text('Valide o cupom para este carrinho ou remova o código.'),
          if (_validCoupon(items) && _validatedCode != null)
            _line('Desconto · $_validatedCode',
                '- ${_money.format(_discountCents / 100)}'),
          _line(_delivery ? 'Entrega' : 'Retirada',
              _delivery ? _money.format(shipping) : 'Sem custo'),
          const Divider(),
          _line(
              'Total estimado',
              _money.format(subtotal +
                  shipping -
                  (_validCoupon(items) ? _discountCents / 100 : 0)),
              bold: true),
          _text(_demo
              ? 'Compra simulada, sem cobrança.'
              : 'Preço, estoque, desconto e entrega serão conferidos ao registrar o pedido.'),
        ]),
      ]);
  Widget _confirmation() {
    final result = _recorded!, order = result['order'] as Map;
    final id = '${order['id']}';
    final demo = result['simulated'] == true,
        offline = result['offlinePending'] == true;
    return _card('Pedido registrado', [
      Icon(Icons.check_circle_outline,
          size: 56, color: Theme.of(context).colorScheme.primary),
      const SizedBox(height: 16),
      _text('Pedido #${id.length > 8 ? id.substring(0, 8) : id}'),
      _text(demo
          ? 'Demonstração concluída. Nenhum valor foi cobrado.'
          : offline
              ? 'Aguardando pagamento. Combine com a loja e acompanhe a confirmação em Meus pedidos.'
              : 'Seu pedido está salvo e aguarda pagamento. Abra o pagamento seguro para continuar.'),
      if (!demo && !offline)
        FilledButton.icon(
            onPressed: _busy ? null : _openPayment,
            icon: const Icon(Icons.open_in_new),
            label: const Text('Abrir pagamento seguro')),
      OutlinedButton(
          onPressed: () => context.go('/orders'),
          child: const Text('Acompanhar meu pedido')),
      TextButton(
          onPressed: () => context.go('/'),
          child: const Text('Continuar comprando')),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final items = ref.watch(cartProvider);
    final subtotal = items.fold<double>(0, (s, i) => s + i.total);
    final rate = _rates.where((r) => '${r['id']}' == _serviceId).firstOrNull;
    final shipping =
        _delivery ? ((rate?['priceCents'] as num?) ?? 0) / 100 : 0.0;
    final enabled =
        !_loading && !_loadFailed && _availability['enabled'] == true;
    return PopScope(
        canPop: !_busy,
        child: Scaffold(
          appBar: AppBar(
              leading: _busy
                  ? const SizedBox.shrink()
                  : const AppBackButton(fallbackLocation: '/cart'),
              title: const Text('Finalizar pedido')),
          bottomNavigationBar: _recorded == null && items.isNotEmpty && enabled
              ? Material(
                  color: Theme.of(context).colorScheme.surface,
                  child: SafeArea(
                      top: false,
                      child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: ConstrainedBox(
                              constraints: const BoxConstraints(maxWidth: 760),
                              child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  crossAxisAlignment:
                                      CrossAxisAlignment.stretch,
                                  children: [
                                    if (!_delivery || _validQuote(items))
                                      _line(
                                          'Total estimado',
                                          _money.format(subtotal +
                                              shipping -
                                              (_validCoupon(items)
                                                  ? _discountCents / 100
                                                  : 0))),
                                    FilledButton(
                                        onPressed: _busy ||
                                                _quoting ||
                                                _validatingCoupon
                                            ? null
                                            : _step < 2
                                                ? () => _goStep(_step + 1)
                                                : _pay,
                                        child: Text(_busy
                                            ? 'Registrando pedido…'
                                            : _step < 2
                                                ? 'Continuar'
                                                : _demo
                                                    ? 'Concluir demonstração'
                                                    : _payment == 'GATEWAY'
                                                        ? 'Registrar e seguir para pagamento'
                                                        : 'Confirmar pedido · pagamento pendente')),
                                  ])))))
              : null,
          body: _loading
              ? const Center(child: CircularProgressIndicator())
              : _loadFailed
                  ? EmptyState(
                      icon: Icons.wifi_off_outlined,
                      title: 'Não foi possível preparar a compra',
                      subtitle: 'Verifique sua conexão e tente novamente.',
                      buttonLabel: 'Tentar novamente',
                      onButtonPressed: _load)
                  : items.isEmpty && _recorded == null
                      ? EmptyState(
                          icon: Icons.shopping_bag_outlined,
                          title: 'Seu carrinho está vazio',
                          subtitle: 'Escolha uma peça para continuar.',
                          buttonLabel: 'Explorar coleção',
                          onButtonPressed: () => context.go('/search'))
                      : ListView(
                          controller: _scroll,
                          padding: const EdgeInsets.all(16),
                          children: [
                              Center(
                                  child: ConstrainedBox(
                                      constraints:
                                          const BoxConstraints(maxWidth: 760),
                                      child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.stretch,
                                          children: [
                                            if (_error.isNotEmpty)
                                              Padding(
                                                  padding:
                                                      const EdgeInsets.only(
                                                          bottom: 16),
                                                  child: Text(_error,
                                                      style: TextStyle(
                                                          color:
                                                              Theme.of(context)
                                                                  .colorScheme
                                                                  .error),
                                                      semanticsLabel: _error)),
                                            if (_recorded != null)
                                              _confirmation()
                                            else ...[
                                              Text(
                                                  'Etapa ${_step + 1} de 3 · ${[
                                                    'Recebimento',
                                                    'Pagamento',
                                                    'Revisão'
                                                  ][_step]}',
                                                  style: Theme.of(context)
                                                      .textTheme
                                                      .titleLarge),
                                              const SizedBox(height: 12),
                                              LinearProgressIndicator(
                                                  value: (_step + 1) / 3),
                                              const SizedBox(height: 20),
                                              if (!enabled)
                                                _card(
                                                    'Compra indisponível no momento',
                                                    [
                                                      _text(
                                                          'A loja ainda não habilitou uma forma de pagamento. Fale com o atendimento para saber mais.'),
                                                      OutlinedButton(
                                                          onPressed: _load,
                                                          child: const Text(
                                                              'Verificar novamente'))
                                                    ]),
                                              AbsorbPointer(
                                                  absorbing: _busy,
                                                  child: _step == 0
                                                      ? _details(items)
                                                      : _step == 1
                                                          ? _paymentStep()
                                                          : _review(
                                                              items,
                                                              subtotal,
                                                              shipping)),
                                              if (_step > 0)
                                                TextButton.icon(
                                                    onPressed: _busy
                                                        ? null
                                                        : () =>
                                                            _goStep(_step - 1),
                                                    icon: const Icon(
                                                        Icons.arrow_back),
                                                    label: const Text(
                                                        'Voltar uma etapa')),
                                            ],
                                          ])))
                            ]),
        ));
  }
}
