import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/app_colors.dart';
import '../../../models/saved_address.dart';
import '../../../providers/address_providers.dart';
import '../../../providers/cart_providers.dart';
import '../../../providers/order_providers.dart';

class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key});

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  final _formKey = GlobalKey<FormState>();

  // =========================
  // DADOS DO CLIENTE
  // =========================

  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();

  // =========================
  // ENDEREÇO
  // =========================

  final _zipCodeController = TextEditingController();
  final _streetController = TextEditingController();
  final _numberController = TextEditingController();
  final _complementController = TextEditingController();
  final _neighborhoodController = TextEditingController();
  final _cityController = TextEditingController();
  final _stateController = TextEditingController();

  bool _addressLoaded = false;
  bool _saveAddress = false;
  String _addressLabel = 'Casa';

  // =========================
  // OBSERVAÇÃO
  // =========================

  final _notesController = TextEditingController();

  // =========================
  // PAGAMENTO
  // =========================

  String _paymentMethod = 'Pix';

  // =========================
  // ESTADO
  // =========================

  bool _isLoading = false;

  // =========================
  // ENDEREÇO SALVO
  // =========================

  void _fillAddress(SavedAddress address) {
    _zipCodeController.text = address.zipCode;
    _streetController.text = address.street;
    _numberController.text = address.number;
    _complementController.text = address.complement;
    _neighborhoodController.text = address.neighborhood;
    _cityController.text = address.city;
    _stateController.text = address.state;
  }

  void _loadPrimaryAddress(
    AsyncValue<List<SavedAddress>> addressesAsync,
  ) {
    if (_addressLoaded) {
      return;
    }

    addressesAsync.whenData((addresses) {
      if (addresses.isEmpty || _addressLoaded) {
        return;
      }

      SavedAddress primary;

      try {
        primary = addresses.firstWhere(
          (address) => address.isPrimary,
        );
      } catch (_) {
        primary = addresses.first;
      }

      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || _addressLoaded) {
          return;
        }

        _fillAddress(primary);

        setState(() {
          _addressLoaded = true;
        });
      });
    });
  }

  Future<void> _saveCurrentAddressIfNeeded() async {
    if (!_saveAddress) {
      return;
    }

    final currentAddresses = ref.read(addressesProvider).value ?? [];

    final newAddress = SavedAddress(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      label: _addressLabel,
      zipCode: _zipCodeController.text.trim(),
      street: _streetController.text.trim(),
      number: _numberController.text.trim(),
      complement: _complementController.text.trim(),
      neighborhood: _neighborhoodController.text.trim(),
      city: _cityController.text.trim(),
      state: _stateController.text.trim().toUpperCase(),
      isPrimary: currentAddresses.isEmpty,
    );

    await ref.read(addressesProvider.notifier).addAddress(newAddress);
  }

  // =========================
  // DISPOSE
  // =========================

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();

    _zipCodeController.dispose();
    _streetController.dispose();
    _numberController.dispose();
    _complementController.dispose();
    _neighborhoodController.dispose();
    _cityController.dispose();
    _stateController.dispose();

    _notesController.dispose();

    super.dispose();
  }

  // =========================
  // VALIDAÇÃO
  // =========================

  String? _requiredValidator(
    String? value,
    String message,
  ) {
    if (value == null || value.trim().isEmpty) {
      return message;
    }

    return null;
  }

  // =========================
  // ABRIR PAGAMENTO
  // =========================

  Future<void> _continueToPayment() async {
    final isValid = _formKey.currentState?.validate() ?? false;

    if (!isValid) {
      return;
    }

    final cartItems = ref.read(cartProvider);

    if (cartItems.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Seu carrinho está vazio.',
          ),
        ),
      );

      return;
    }

    final cartNotifier = ref.read(cartProvider.notifier);

    final subtotal = cartNotifier.subtotal;

    const shipping = 15.90;

    final total = subtotal + shipping;

    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) {
        return _PaymentSimulationSheet(
          paymentMethod: _paymentMethod,
          total: total,
        );
      },
    );

    if (!mounted) {
      return;
    }

    if (confirmed == true) {
      await _finishOrder();
    }
  }

  // =========================
  // CRIAR PEDIDO
  // =========================

  Future<void> _finishOrder() async {
    if (_isLoading) {
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      // Simulação de comunicação
      // com gateway/API de pagamento.
      await Future.delayed(
        const Duration(milliseconds: 900),
      );

      final order = await ref.read(ordersActionsProvider).createOrder(
            customerName: _nameController.text.trim(),
            customerPhone: _phoneController.text.trim(),
            zipCode: _zipCodeController.text.trim(),
            street: _streetController.text.trim(),
            number: _numberController.text.trim(),
            complement: _complementController.text.trim(),
            neighborhood: _neighborhoodController.text.trim(),
            city: _cityController.text.trim(),
            state: _stateController.text.trim().toUpperCase(),
            paymentMethod: _paymentMethod,
            notes: _notesController.text.trim().isEmpty
                ? null
                : _notesController.text.trim(),
          );

      // Salva o endereço somente depois
      // que o pedido foi criado com sucesso.
      await _saveCurrentAddressIfNeeded();

      if (!mounted) {
        return;
      }

      await _showSuccessDialog(order.id);

      if (!mounted) {
        return;
      }

      context.go('/orders');
    } catch (e) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Não foi possível finalizar o pedido: $e',
          ),
          backgroundColor: AppColors.error,
          behavior: SnackBarBehavior.floating,
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  // =========================
  // SUCESSO
  // =========================

  Future<void> _showSuccessDialog(
    String orderId,
  ) async {
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) {
        return AlertDialog(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(24),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 76,
                height: 76,
                decoration: BoxDecoration(
                  color: AppColors.success.withOpacity(0.12),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.check_rounded,
                  color: AppColors.success,
                  size: 42,
                ),
              ),
              const SizedBox(height: 20),
              const Text(
                'Compra realizada!',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.bold,
                  color: AppColors.textPrimary,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Seu pagamento foi aprovado e o pedido já foi enviado para a loja.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: AppColors.textSecondary,
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 16),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.background,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(
                  children: [
                    const Text(
                      'Número do pedido',
                      style: TextStyle(
                        color: AppColors.textSecondary,
                        fontSize: 12,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      orderId,
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        color: AppColors.textPrimary,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () {
                    Navigator.pop(dialogContext);
                  },
                  child: const Text(
                    'Acompanhar pedido',
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  // =========================
  // TELA
  // =========================

  @override
  Widget build(BuildContext context) {
    final cartItems = ref.watch(cartProvider);

    final addressesAsync = ref.watch(addressesProvider);

    _loadPrimaryAddress(addressesAsync);

    final cartNotifier = ref.read(cartProvider.notifier);

    final currency = NumberFormat.currency(
      locale: 'pt_BR',
      symbol: 'R\$',
    );

    final subtotal = cartNotifier.subtotal;

    const shipping = 15.90;

    final total = subtotal + shipping;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text(
          'Finalizar compra',
        ),
      ),
      body: cartItems.isEmpty
          ? const Center(
              child: Text(
                'Carrinho vazio',
              ),
            )
          : Column(
              children: [
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.all(16),
                    child: Form(
                      key: _formKey,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // =====================
                          // CLIENTE
                          // =====================

                          const _SectionHeader(
                            icon: Icons.person_outline,
                            title: 'Dados do cliente',
                          ),

                          const SizedBox(
                            height: 16,
                          ),

                          TextFormField(
                            controller: _nameController,
                            textInputAction: TextInputAction.next,
                            decoration: const InputDecoration(
                              labelText: 'Nome completo',
                              prefixIcon: Icon(
                                Icons.person_outline,
                              ),
                            ),
                            validator: (value) => _requiredValidator(
                              value,
                              'Informe seu nome.',
                            ),
                          ),

                          const SizedBox(
                            height: 12,
                          ),

                          TextFormField(
                            controller: _phoneController,
                            keyboardType: TextInputType.phone,
                            textInputAction: TextInputAction.next,
                            decoration: const InputDecoration(
                              labelText: 'Telefone / WhatsApp',
                              prefixIcon: Icon(
                                Icons.phone_outlined,
                              ),
                            ),
                            validator: (value) => _requiredValidator(
                              value,
                              'Informe seu telefone.',
                            ),
                          ),

                          const SizedBox(
                            height: 30,
                          ),

                          // =====================
                          // ENDEREÇO
                          // =====================

                          const _SectionHeader(
                            icon: Icons.location_on_outlined,
                            title: 'Endereço de entrega',
                          ),

                          const SizedBox(
                            height: 16,
                          ),

                          // Indicador de endereço
                          // principal carregado.
                          addressesAsync.when(
                            loading: () => const Padding(
                              padding: EdgeInsets.only(
                                bottom: 12,
                              ),
                              child: LinearProgressIndicator(),
                            ),
                            error: (_, __) => const SizedBox.shrink(),
                            data: (addresses) {
                              if (addresses.isEmpty) {
                                return const SizedBox.shrink();
                              }

                              SavedAddress primary;

                              try {
                                primary = addresses.firstWhere(
                                  (address) => address.isPrimary,
                                );
                              } catch (_) {
                                primary = addresses.first;
                              }

                              return Container(
                                width: double.infinity,
                                margin: const EdgeInsets.only(
                                  bottom: 14,
                                ),
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: AppColors.primary.withOpacity(0.05),
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(
                                    color: AppColors.primary.withOpacity(0.15),
                                  ),
                                ),
                                child: Row(
                                  children: [
                                    const Icon(
                                      Icons.home_outlined,
                                      color: AppColors.primary,
                                    ),
                                    const SizedBox(
                                      width: 10,
                                    ),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            primary.label,
                                            style: const TextStyle(
                                              fontWeight: FontWeight.bold,
                                              color: AppColors.textPrimary,
                                            ),
                                          ),
                                          const SizedBox(
                                            height: 2,
                                          ),
                                          const Text(
                                            'Endereço principal carregado automaticamente',
                                            style: TextStyle(
                                              fontSize: 11,
                                              color: AppColors.textSecondary,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                              );
                            },
                          ),

                          TextFormField(
                            controller: _zipCodeController,
                            keyboardType: TextInputType.number,
                            textInputAction: TextInputAction.next,
                            decoration: const InputDecoration(
                              labelText: 'CEP',
                              prefixIcon: Icon(
                                Icons.markunread_mailbox_outlined,
                              ),
                            ),
                            validator: (value) => _requiredValidator(
                              value,
                              'Informe o CEP.',
                            ),
                          ),

                          const SizedBox(
                            height: 12,
                          ),

                          TextFormField(
                            controller: _streetController,
                            textInputAction: TextInputAction.next,
                            decoration: const InputDecoration(
                              labelText: 'Rua / Avenida',
                              prefixIcon: Icon(
                                Icons.signpost_outlined,
                              ),
                            ),
                            validator: (value) => _requiredValidator(
                              value,
                              'Informe a rua.',
                            ),
                          ),

                          const SizedBox(
                            height: 12,
                          ),

                          Row(
                            children: [
                              Expanded(
                                flex: 2,
                                child: TextFormField(
                                  controller: _numberController,
                                  textInputAction: TextInputAction.next,
                                  decoration: const InputDecoration(
                                    labelText: 'Número',
                                  ),
                                  validator: (value) => _requiredValidator(
                                    value,
                                    'Informe.',
                                  ),
                                ),
                              ),
                              const SizedBox(
                                width: 12,
                              ),
                              Expanded(
                                flex: 3,
                                child: TextFormField(
                                  controller: _complementController,
                                  textInputAction: TextInputAction.next,
                                  decoration: const InputDecoration(
                                    labelText: 'Complemento',
                                    hintText: 'Opcional',
                                  ),
                                ),
                              ),
                            ],
                          ),

                          const SizedBox(
                            height: 12,
                          ),

                          TextFormField(
                            controller: _neighborhoodController,
                            textInputAction: TextInputAction.next,
                            decoration: const InputDecoration(
                              labelText: 'Bairro',
                              prefixIcon: Icon(
                                Icons.map_outlined,
                              ),
                            ),
                            validator: (value) => _requiredValidator(
                              value,
                              'Informe o bairro.',
                            ),
                          ),

                          const SizedBox(
                            height: 12,
                          ),

                          Row(
                            children: [
                              Expanded(
                                flex: 4,
                                child: TextFormField(
                                  controller: _cityController,
                                  textInputAction: TextInputAction.next,
                                  decoration: const InputDecoration(
                                    labelText: 'Cidade',
                                  ),
                                  validator: (value) => _requiredValidator(
                                    value,
                                    'Informe.',
                                  ),
                                ),
                              ),
                              const SizedBox(
                                width: 12,
                              ),
                              Expanded(
                                flex: 2,
                                child: TextFormField(
                                  controller: _stateController,
                                  textCapitalization:
                                      TextCapitalization.characters,
                                  maxLength: 2,
                                  decoration: const InputDecoration(
                                    labelText: 'UF',
                                    counterText: '',
                                  ),
                                  validator: (value) {
                                    if (value == null || value.trim().isEmpty) {
                                      return 'UF';
                                    }

                                    if (value.trim().length != 2) {
                                      return '2 letras';
                                    }

                                    return null;
                                  },
                                ),
                              ),
                            ],
                          ),

                          const SizedBox(
                            height: 8,
                          ),

                          // =====================
                          // SALVAR ENDEREÇO
                          // =====================

                          Container(
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(
                                color: AppColors.border,
                              ),
                            ),
                            child: CheckboxListTile(
                              contentPadding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 2,
                              ),
                              controlAffinity: ListTileControlAffinity.leading,
                              title: const Text(
                                'Salvar este endereço',
                                style: TextStyle(
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              subtitle: const Text(
                                'Use novamente nas próximas compras',
                              ),
                              value: _saveAddress,
                              onChanged: (value) {
                                setState(() {
                                  _saveAddress = value ?? false;
                                });
                              },
                            ),
                          ),

                          if (_saveAddress) ...[
                            const SizedBox(
                              height: 12,
                            ),
                            DropdownButtonFormField<String>(
                              value: _addressLabel,
                              decoration: const InputDecoration(
                                labelText: 'Identificação do endereço',
                                prefixIcon: Icon(
                                  Icons.bookmark_outline,
                                ),
                              ),
                              items: const [
                                DropdownMenuItem(
                                  value: 'Casa',
                                  child: Text(
                                    'Casa',
                                  ),
                                ),
                                DropdownMenuItem(
                                  value: 'Trabalho',
                                  child: Text(
                                    'Trabalho',
                                  ),
                                ),
                                DropdownMenuItem(
                                  value: 'Outro',
                                  child: Text(
                                    'Outro',
                                  ),
                                ),
                              ],
                              onChanged: (value) {
                                if (value == null) {
                                  return;
                                }

                                setState(() {
                                  _addressLabel = value;
                                });
                              },
                            ),
                          ],

                          const SizedBox(
                            height: 16,
                          ),

                          TextFormField(
                            controller: _notesController,
                            maxLines: 2,
                            decoration: const InputDecoration(
                              labelText: 'Observações',
                              hintText: 'Ex.: entregar na portaria',
                              prefixIcon: Icon(
                                Icons.notes_outlined,
                              ),
                            ),
                          ),

                          const SizedBox(
                            height: 30,
                          ),

                          // =====================
                          // PAGAMENTO
                          // =====================

                          const _SectionHeader(
                            icon: Icons.payments_outlined,
                            title: 'Forma de pagamento',
                          ),

                          const SizedBox(
                            height: 16,
                          ),

                          _PaymentOption(
                            icon: Icons.pix,
                            title: 'Pix',
                            subtitle: 'Aprovação imediata',
                            selected: _paymentMethod == 'Pix',
                            onTap: () {
                              setState(() {
                                _paymentMethod = 'Pix';
                              });
                            },
                          ),

                          const SizedBox(
                            height: 10,
                          ),

                          _PaymentOption(
                            icon: Icons.credit_card_outlined,
                            title: 'Cartão de Crédito',
                            subtitle: 'Pagamento simulado',
                            selected: _paymentMethod == 'Cartão de Crédito',
                            onTap: () {
                              setState(() {
                                _paymentMethod = 'Cartão de Crédito';
                              });
                            },
                          ),

                          const SizedBox(
                            height: 10,
                          ),

                          _PaymentOption(
                            icon: Icons.payments_outlined,
                            title: 'Pagamento na entrega',
                            subtitle: 'Demonstração',
                            selected: _paymentMethod == 'Pagamento na entrega',
                            onTap: () {
                              setState(() {
                                _paymentMethod = 'Pagamento na entrega';
                              });
                            },
                          ),

                          const SizedBox(
                            height: 30,
                          ),

                          // =====================
                          // RESUMO
                          // =====================

                          const _SectionHeader(
                            icon: Icons.receipt_long_outlined,
                            title: 'Resumo do pedido',
                          ),

                          const SizedBox(
                            height: 16,
                          ),

                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(18),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(
                                color: AppColors.border,
                              ),
                            ),
                            child: Column(
                              children: [
                                _SummaryRow(
                                  label: 'Subtotal',
                                  value: currency.format(
                                    subtotal,
                                  ),
                                ),
                                const SizedBox(
                                  height: 10,
                                ),
                                _SummaryRow(
                                  label: 'Frete',
                                  value: currency.format(
                                    shipping,
                                  ),
                                ),
                                const Divider(
                                  height: 28,
                                ),
                                _SummaryRow(
                                  label: 'Total',
                                  value: currency.format(
                                    total,
                                  ),
                                  isTotal: true,
                                ),
                              ],
                            ),
                          ),

                          const SizedBox(
                            height: 24,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),

                // =====================
                // BOTÃO INFERIOR
                // =====================

                Container(
                  padding: const EdgeInsets.fromLTRB(
                    16,
                    14,
                    16,
                    16,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.06),
                        blurRadius: 12,
                        offset: const Offset(0, -4),
                      ),
                    ],
                  ),
                  child: SafeArea(
                    top: false,
                    child: SizedBox(
                      width: double.infinity,
                      height: 54,
                      child: ElevatedButton(
                        onPressed: _isLoading ? null : _continueToPayment,
                        child: _isLoading
                            ? const SizedBox(
                                width: 24,
                                height: 24,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2.5,
                                  color: Colors.white,
                                ),
                              )
                            : Text(
                                'Ir para pagamento • ${currency.format(total)}',
                                style: const TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}

// ======================================================
// PAGAMENTO SIMULADO
// ======================================================

class _PaymentSimulationSheet extends StatefulWidget {
  final String paymentMethod;
  final double total;

  const _PaymentSimulationSheet({
    required this.paymentMethod,
    required this.total,
  });

  @override
  State<_PaymentSimulationSheet> createState() =>
      _PaymentSimulationSheetState();
}

class _PaymentSimulationSheetState extends State<_PaymentSimulationSheet> {
  bool _processing = false;

  Future<void> _approvePayment() async {
    setState(() {
      _processing = true;
    });

    await Future.delayed(
      const Duration(milliseconds: 1200),
    );

    if (!mounted) {
      return;
    }

    Navigator.pop(context, true);
  }

  @override
  Widget build(BuildContext context) {
    final currency = NumberFormat.currency(
      locale: 'pt_BR',
      symbol: 'R\$',
    );

    final isPix = widget.paymentMethod == 'Pix';

    final isDelivery = widget.paymentMethod == 'Pagamento na entrega';

    return Container(
      padding: EdgeInsets.fromLTRB(
        24,
        12,
        24,
        24 + MediaQuery.of(context).padding.bottom,
      ),
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(28),
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 42,
            height: 4,
            decoration: BoxDecoration(
              color: AppColors.border,
              borderRadius: BorderRadius.circular(20),
            ),
          ),
          const SizedBox(height: 24),
          Container(
            width: 70,
            height: 70,
            decoration: BoxDecoration(
              color: AppColors.primary.withOpacity(0.08),
              shape: BoxShape.circle,
            ),
            child: Icon(
              isPix
                  ? Icons.pix
                  : isDelivery
                      ? Icons.local_shipping_outlined
                      : Icons.credit_card_outlined,
              size: 34,
              color: AppColors.primary,
            ),
          ),
          const SizedBox(height: 16),
          Text(
            isDelivery ? 'Confirmar pedido' : 'Pagamento de demonstração',
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            widget.paymentMethod,
            style: const TextStyle(
              color: AppColors.textSecondary,
            ),
          ),
          const SizedBox(height: 20),
          Text(
            currency.format(widget.total),
            style: const TextStyle(
              fontSize: 30,
              fontWeight: FontWeight.bold,
              color: AppColors.textPrimary,
            ),
          ),
          if (isPix) ...[
            const SizedBox(height: 20),
            Container(
              width: 170,
              height: 170,
              decoration: BoxDecoration(
                color: AppColors.background,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: AppColors.border,
                ),
              ),
              child: const Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.qr_code_2,
                    size: 105,
                    color: AppColors.textPrimary,
                  ),
                  SizedBox(height: 4),
                  Text(
                    'QR Code demonstrativo',
                    style: TextStyle(
                      fontSize: 11,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.warning.withOpacity(0.08),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(
                  Icons.info_outline,
                  size: 20,
                  color: AppColors.warning,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    isDelivery
                        ? 'Este pedido é apenas uma demonstração. Nenhuma cobrança real será realizada.'
                        : 'Este é um ambiente de demonstração. Nenhuma cobrança real será realizada.',
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.textSecondary,
                      height: 1.4,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 22),
          SizedBox(
            width: double.infinity,
            height: 52,
            child: ElevatedButton.icon(
              onPressed: _processing ? null : _approvePayment,
              icon: _processing
                  ? const SizedBox.shrink()
                  : const Icon(
                      Icons.check_circle_outline,
                    ),
              label: _processing
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.4,
                        color: Colors.white,
                      ),
                    )
                  : Text(
                      isDelivery
                          ? 'Confirmar pedido'
                          : 'Simular pagamento aprovado',
                    ),
            ),
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: _processing
                ? null
                : () {
                    Navigator.pop(
                      context,
                      false,
                    );
                  },
            child: const Text(
              'Voltar',
            ),
          ),
        ],
      ),
    );
  }
}

// ======================================================
// COMPONENTES
// ======================================================

class _SectionHeader extends StatelessWidget {
  final IconData icon;
  final String title;

  const _SectionHeader({
    required this.icon,
    required this.title,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: AppColors.primary.withOpacity(0.08),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(
            icon,
            size: 19,
            color: AppColors.primary,
          ),
        ),
        const SizedBox(width: 10),
        Text(
          title,
          style: const TextStyle(
            fontSize: 17,
            fontWeight: FontWeight.bold,
            color: AppColors.textPrimary,
          ),
        ),
      ],
    );
  }
}

class _PaymentOption extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final bool selected;
  final VoidCallback onTap;

  const _PaymentOption({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.primary.withOpacity(0.05) : Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: selected ? AppColors.primary : AppColors.border,
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: selected
                      ? AppColors.primary.withOpacity(0.1)
                      : AppColors.background,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  icon,
                  color: selected ? AppColors.primary : AppColors.textSecondary,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(
                      height: 2,
                    ),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(
                selected ? Icons.radio_button_checked : Icons.radio_button_off,
                color: selected ? AppColors.primary : AppColors.textLight,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  final String label;
  final String value;
  final bool isTotal;

  const _SummaryRow({
    required this.label,
    required this.value,
    this.isTotal = false,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: TextStyle(
            color: isTotal ? AppColors.textPrimary : AppColors.textSecondary,
            fontWeight: isTotal ? FontWeight.bold : FontWeight.normal,
            fontSize: isTotal ? 16 : 14,
          ),
        ),
        Text(
          value,
          style: TextStyle(
            color: isTotal ? AppColors.primary : AppColors.textPrimary,
            fontWeight: FontWeight.bold,
            fontSize: isTotal ? 19 : 14,
          ),
        ),
      ],
    );
  }
}
