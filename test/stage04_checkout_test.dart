import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:loja_roupas/core/network/loja_api.dart';
import 'package:loja_roupas/data/repositories/address_repository.dart';
import 'package:loja_roupas/data/repositories/cart_repository.dart';
import 'package:loja_roupas/data/repositories/railway_coupon_repository.dart';
import 'package:loja_roupas/data/repositories/railway_order_repository.dart';
import 'package:loja_roupas/data/repositories/railway_shipping_repository.dart';
import 'package:loja_roupas/data/services/shipping_service.dart';
import 'package:loja_roupas/features/client/checkout/railway_checkout_screen.dart';
import 'package:loja_roupas/models/cart_item.dart';
import 'package:loja_roupas/models/saved_address.dart';
import 'package:loja_roupas/providers/cart_providers.dart';
import 'helpers/stage03_fixtures.dart';

class CheckoutOrders extends RailwayOrderRepository {
  bool failLoad = false, failFirst = false, gateway = false;
  final keys = <String>[];
  final requests = <Map<String, dynamic>>[];
  @override
  Future<Map<String, dynamic>> checkoutAvailability() async {
    if (failLoad) throw const LojaApiException('Offline');
    return {
      'enabled': true,
      'realEnabled': gateway,
      'offlineMethods': ['PAY_ON_PICKUP', 'MANUAL_PIX']
    };
  }

  @override
  Future<Map<String, dynamic>> createOrder(
      {required List<CartItem> cart,
      required String customerName,
      required String customerPhone,
      required String idempotencyKey,
      String fulfillment = 'PICKUP',
      String? demoPaymentMethod,
      String? offlineMethod,
      String? couponCode,
      String notes = '',
      String? quoteId,
      String? serviceId,
      Map<String, String>? address}) async {
    keys.add(idempotencyKey);
    requests.add({
      'fulfillment': fulfillment,
      'address': address,
      'notes': notes,
      'offlineMethod': offlineMethod,
      'serviceId': serviceId,
      'name': customerName
    });
    if (failFirst && keys.length == 1) {
      throw const LojaApiException('Falha de conexão. Tente novamente.');
    }
    return {
      'order': {'id': 'pedido-12345'},
      'offlinePending': !gateway,
      if (gateway) 'checkoutUrl': 'https://checkout.example.invalid/order-123'
    };
  }
}

class CheckoutShipping extends RailwayShippingRepository {
  final calls = <String>[];
  Future<Map<String, dynamic>> Function(String)? response;
  @override
  Future<Map<String, dynamic>> availability() async => {
        'localDelivery': true,
        'pickupAddress': 'Rua da Loja, 20 · Centro',
        'pickupHours': 'Seg a sex, 9h às 18h',
        'localFeeCents': 700,
        'localEstimate': 'Até dois dias úteis após confirmação'
      };
  Map<String, dynamic> rate(String zip, {int fee = 700}) => {
        'quoteId': 'quote-$zip',
        'expiresAt':
            DateTime.now().add(const Duration(minutes: 15)).toIso8601String(),
        'sandbox': false,
        'provider': 'LOCAL',
        'options': [
          {
            'id': '0',
            'carrier': 'Entrega local',
            'name': 'Até dois dias úteis após confirmação',
            'priceCents': fee,
            'deliveryDays': 0
          }
        ]
      };
  @override
  Future<Map<String, dynamic>> quote(List<CartItem> items, String postalCode,
      {String mode = 'CARRIER'}) async {
    calls.add('$mode:$postalCode');
    return response == null ? rate(postalCode) : response!(postalCode);
  }
}

class CheckoutAddresses extends AddressRepository {
  @override
  Future<List<SavedAddress>> getAddresses() async => [];
}

class CheckoutCep extends ShippingService {
  @override
  Future<Map<String, dynamic>?> fetchCep(String cep) async => null;
}

class CheckoutCoupons extends RailwayCouponRepository {
  final pending = Completer<Map<String, dynamic>>();
  @override
  Future<Map<String, dynamic>> preview(String code, List<CartItem> cart) =>
      pending.future;
}

Future<CartRepository> setup(
    WidgetTester tester, CheckoutOrders orders, CheckoutShipping shipping,
    {double width = 390,
    double textScale = 1,
    CheckoutCoupons? coupons,
    bool paymentOpens = false}) async {
  tester.view.physicalSize = Size(width, 980);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.runAsync(seedPreviewImages);
  final cart = CartRepository(
      loadProductsByIds: (ids) async =>
          previewProducts.where((p) => ids.contains(p.id)).toList());
  cart.addItem(product: previewProducts.first, color: 'Areia', size: 'M');
  await tester.pumpWidget(previewApp(
      ProviderScope(
          overrides: [cartProvider.overrideWith((ref) => CartNotifier(cart))],
          child: RailwayCheckoutScreen(
              orders: orders,
              shipping: shipping,
              coupons: coupons,
              addresses: CheckoutAddresses(),
              cepService: CheckoutCep(),
              openPayment: (_) async => paymentOpens)),
      textScale: textScale));
  await tester.pumpAndSettle();
  return cart;
}

Future<void> fill(WidgetTester tester, String label, String value) async {
  final field = find.widgetWithText(TextFormField, label);
  await tester.ensureVisible(field);
  await tester.pump(const Duration(milliseconds: 300));
  await tester.enterText(field, value);
  await tester.pump();
}

Future<void> contact(WidgetTester tester) async {
  await fill(tester, 'Nome completo', 'Maria da Silva');
  await fill(tester, 'Telefone com DDD', '11999999999');
}

Future<void> next(WidgetTester tester) async {
  await tester.tap(find.text('Continuar'));
  await tester.pumpAndSettle();
}

Future<void> localAddress(WidgetTester tester) async {
  await tester.ensureVisible(find.text('Entrega local').first);
  await tester.pumpAndSettle();
  await tester.tap(find.text('Entrega local').first);
  await tester.pumpAndSettle();
  await contact(tester);
  await fill(tester, 'CEP', '01000000');
  await fill(tester, 'Logradouro', 'Rua de Casa');
  await fill(tester, 'Número', '10');
  await fill(tester, 'Bairro', 'Centro');
  await fill(tester, 'Cidade', 'São Paulo');
  await fill(tester, 'UF', 'SP');
}

Future<void> quoteDelivery(WidgetTester tester) async {
  await tester.ensureVisible(find.text('Consultar entrega'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Consultar entrega'));
  await tester.pumpAndSettle();
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  testWidgets(
      'retirada mostra endereço e revisão confirma contato e itens antes de registrar',
      (tester) async {
    final orders = CheckoutOrders();
    final cart = await setup(tester, orders, CheckoutShipping());
    expect(find.text('Rua da Loja, 20 · Centro'), findsOneWidget);
    await next(tester);
    expect(find.text('Informe seu nome.'), findsOneWidget);
    await contact(tester);
    await next(tester);
    await next(tester);
    expect(find.text('Confira antes de confirmar'), findsOneWidget);
    expect(find.text('Maria da Silva'), findsOneWidget);
    await savePreview(tester, 'checkout-revisao');
    await tester.tap(find.text('Confirmar pedido · pagamento pendente'));
    await tester.pumpAndSettle();
    expect(find.text('Pedido registrado'), findsOneWidget);
    expect(orders.requests.single['fulfillment'], 'PICKUP');
    expect(cart.items, isEmpty);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
      'falha ao registrar preserva carrinho e reutiliza a mesma chave na nova tentativa',
      (tester) async {
    final orders = CheckoutOrders()..failFirst = true;
    final cart = await setup(tester, orders, CheckoutShipping());
    await contact(tester);
    await next(tester);
    await next(tester);
    final button = find.text('Confirmar pedido · pagamento pendente');
    await tester.tap(button);
    await tester.pumpAndSettle();
    expect(cart.items, hasLength(1));
    await tester.tap(button);
    await tester.pumpAndSettle();
    expect(orders.keys, hasLength(2));
    expect(orders.keys[0], orders.keys[1]);
    expect(find.text('Pedido registrado'), findsOneWidget);
  });
  testWidgets(
      'entrega local exige consulta, inclui endereço e exclui pagar na retirada',
      (tester) async {
    final orders = CheckoutOrders(), shipping = CheckoutShipping();
    await setup(tester, orders, shipping);
    await localAddress(tester);
    await next(tester);
    expect(find.text('Etapa 1 de 3 · Recebimento'), findsOneWidget);
    await quoteDelivery(tester);
    await next(tester);
    expect(find.text('Pagar na retirada'), findsNothing);
    expect(find.text('Pix combinado com a loja'), findsOneWidget);
    await next(tester);
    expect(find.textContaining('Rua de Casa, 10'), findsOneWidget);
    await tester.tap(find.text('Confirmar pedido · pagamento pendente'));
    await tester.pumpAndSettle();
    expect(orders.requests.single['serviceId'], '0');
    expect(orders.requests.single['offlineMethod'], 'MANUAL_PIX');
    expect(orders.requests.single['address']['postalCode'], '01000000');
    expect(shipping.calls.single, 'LOCAL:01000000');
    expect(tester.takeException(), isNull);
  });
  testWidgets('resposta atrasada não associa cotação ao novo CEP',
      (tester) async {
    final orders = CheckoutOrders(), shipping = CheckoutShipping();
    final pending = Completer<Map<String, dynamic>>();
    shipping.response = (_) => pending.future;
    await setup(tester, orders, shipping);
    await localAddress(tester);
    await tester.ensureVisible(find.text('Consultar entrega'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Consultar entrega'));
    await tester.pump();
    await fill(tester, 'CEP', '02000000');
    pending.complete(shipping.rate('01000000'));
    await tester.pumpAndSettle();
    await next(tester);
    expect(find.text('Etapa 1 de 3 · Recebimento'), findsOneWidget);
    expect(find.textContaining('selecione uma opção válida'), findsOneWidget);
    expect(orders.requests, isEmpty);
  });
  testWidgets('mudança no carrinho invalida cotação antes de registrar',
      (tester) async {
    final orders = CheckoutOrders(), shipping = CheckoutShipping();
    await setup(tester, orders, shipping);
    await localAddress(tester);
    await quoteDelivery(tester);
    await next(tester);
    await next(tester);
    final context = tester.element(find.byType(RailwayCheckoutScreen));
    final container = ProviderScope.containerOf(context);
    final line = container.read(cartProvider).single;
    container.read(cartProvider.notifier).updateQuantity(line.id, 2);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Confirmar pedido · pagamento pendente'));
    await tester.pumpAndSettle();
    expect(orders.requests, isEmpty);
    expect(find.text('Etapa 1 de 3 · Recebimento'), findsOneWidget);
  });
  testWidgets(
      'cupom removido durante consulta não reaparece ao receber resposta antiga',
      (tester) async {
    final orders = CheckoutOrders(), coupons = CheckoutCoupons();
    await setup(tester, orders, CheckoutShipping(), coupons: coupons);
    await contact(tester);
    await next(tester);
    await next(tester);
    final input = find.widgetWithText(TextField, 'Cupom de desconto');
    await tester.ensureVisible(input);
    await tester.enterText(input, 'ANTIGO');
    await tester.ensureVisible(find.text('Aplicar cupom'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Aplicar cupom'));
    await tester.pump();
    await tester.tap(find.byTooltip('Remover cupom'));
    await tester.pump();
    coupons.pending.complete({'discountCents': 1000});
    await tester.pumpAndSettle();
    expect(find.textContaining('Desconto · ANTIGO'), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
      'falha ao abrir pagamento conserva confirmação e não cria outro pedido',
      (tester) async {
    final orders = CheckoutOrders()..gateway = true;
    await setup(tester, orders, CheckoutShipping());
    await contact(tester);
    await next(tester);
    await next(tester);
    await tester.tap(find.text('Registrar e seguir para pagamento'));
    await tester.pumpAndSettle();
    expect(find.text('Pedido registrado'), findsOneWidget);
    await tester.tap(find.text('Abrir pagamento seguro'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Seu pedido está salvo.'), findsOneWidget);
    expect(orders.requests, hasLength(1));
    await savePreview(tester, 'checkout-confirmacao');
  });
  testWidgets('falha na disponibilidade permite tentar novamente',
      (tester) async {
    final orders = CheckoutOrders()..failLoad = true;
    await setup(tester, orders, CheckoutShipping());
    expect(find.text('Não foi possível preparar a compra'), findsOneWidget);
    orders.failLoad = false;
    await tester.tap(find.text('Tentar novamente'));
    await tester.pumpAndSettle();
    expect(find.text('Como deseja receber?'), findsOneWidget);
  });
  testWidgets('recebimento cabe em 320 pixels com texto ampliado',
      (tester) async {
    await setup(tester, CheckoutOrders(), CheckoutShipping(),
        width: 320, textScale: 1.3);
    await contact(tester);
    await next(tester);
    await next(tester);
    await savePreview(tester, 'checkout-celular-estreito');
    expect(tester.takeException(), isNull);
  });
}
