import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:loja_roupas/data/repositories/railway_order_repository.dart';
import 'package:loja_roupas/data/repositories/railway_shipping_repository.dart';
import 'package:loja_roupas/features/admin/shipping/local_fulfillment_settings.dart';
import 'package:loja_roupas/features/client/orders/railway_orders_screen.dart';
import 'package:loja_roupas/features/client/orders/widgets/order_receiving_info.dart';
import 'package:loja_roupas/features/support/railway_order_timeline_dialog.dart';
import 'helpers/stage03_fixtures.dart';

final localOrder = <String, dynamic>{
  'id': 'pedido-local-123',
  'status': 'SHIPPED',
  'fulfillment': 'DELIVERY',
  'shippingServiceId': '0',
  'createdAt': '2026-10-29T12:00:00Z',
  'totalCents': '9690',
  'paymentProvider': 'offline',
  'paymentStatus': 'APPROVED',
  'customerContact': {
    'deliveryMode': 'LOCAL',
    'street': 'Rua de Casa',
    'number': '10',
    'neighborhood': 'Centro',
    'city': 'São Paulo',
    'state': 'SP',
    'postalCode': '01000000',
    'deliveryEstimate': 'Até dois dias úteis após confirmação',
    'notes': 'Portão azul'
  },
  'items': [
    {
      'name': 'Camisa de linho',
      'quantity': 1,
      'attributes': {'color': 'Azul', 'size': 'M'}
    }
  ],
};

class ReceivingOrders extends RailwayOrderRepository {
  int timelineCalls = 0, calls = 0;
  bool failTimeline = false;
  @override
  Future<List<Map<String, dynamic>>> myOrders() async {
    calls++;
    return [Map.of(localOrder)];
  }

  @override
  Future<Map<String, dynamic>> timeline(String orderId,
      {required bool admin}) async {
    timelineCalls++;
    if (failTimeline) throw StateError('Detalhe interno que não deve aparecer');
    return {
      'order': localOrder,
      'events': [
        {'status': 'PAID', 'createdAt': '2026-10-29T12:00:00Z'},
        {'status': 'PREPARING', 'createdAt': '2026-10-29T12:10:00Z'},
        {
          'status': 'SHIPPED',
          'createdAt': '2026-10-29T13:00:00Z',
          'notes': 'Entregador saiu da loja'
        },
      ]
    };
  }
}

class ReceivingShipping extends RailwayShippingRepository {
  final saved = <Map<String, dynamic>>[];
  @override
  Future<void> saveFulfillment(Map<String, dynamic> settings) async {
    saved.add(settings);
  }
}

Future<void> viewport(WidgetTester tester, {double width = 390}) async {
  tester.view.physicalSize = Size(width, 980);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.runAsync(seedPreviewImages);
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test(
      'rótulos distinguem entrega local, transportadora e retirada sem alterar estados financeiros',
      () {
    expect(orderStatusLabel('SHIPPED', delivery: true, local: true),
        'Saiu para entrega local');
    expect(orderStatusLabel('SHIPPED', delivery: true), 'Postado para entrega');
    expect(orderStatusLabel('SHIPPED'), 'Pronto para retirada');
    expect(orderStatusLabel('PENDING_PAYMENT'), 'Aguardando pagamento');
  });
  testWidgets(
      'pedidos exibem entrega local, endereço, variante e pagamento confirmado em tela estreita',
      (tester) async {
    await viewport(tester, width: 320);
    final repo = ReceivingOrders();
    await tester.pumpWidget(previewApp(
        RailwayOrdersScreen(
            repository: repo, changes: const Stream<int>.empty()),
        textScale: 1.3));
    await tester.pumpAndSettle();
    expect(find.text('Saiu para entrega local'), findsOneWidget);
    expect(find.text('Pagamento confirmado pela loja.'), findsOneWidget);
    expect(find.textContaining('Rua de Casa, 10'), findsOneWidget);
    expect(find.textContaining('Camisa de linho · Azul · M'), findsOneWidget);
    await savePreview(tester, 'pedido-entrega-local');
    expect(tester.takeException(), isNull);
  });
  testWidgets(
      'retirada em preparação orienta aguardar e pedido pronto informa horário',
      (tester) async {
    await viewport(tester);
    final pickup = {
      'fulfillment': 'PICKUP',
      'status': 'PREPARING',
      'customerContact': {
        'pickupAddress': 'Rua da Loja, 20',
        'pickupHours': 'Seg a sex, 9h às 18h'
      }
    };
    await tester.pumpWidget(
        previewApp(Scaffold(body: OrderReceivingInfo(order: pickup))));
    await tester.pumpAndSettle();
    expect(find.text('Aguarde o aviso de que está pronto antes de buscar.'),
        findsOneWidget);
    pickup['status'] = 'SHIPPED';
    await tester.pumpWidget(
        previewApp(Scaffold(body: OrderReceivingInfo(order: pickup))));
    await tester.pumpAndSettle();
    expect(find.text('Seu pedido está pronto. Confira o horário de retirada.'),
        findsOneWidget);
    expect(find.text('Rua da Loja, 20'), findsOneWidget);
  });
  testWidgets(
      'histórico permite nova tentativa e não reinicia consulta em rebuild',
      (tester) async {
    await viewport(tester);
    final repo = ReceivingOrders()..failTimeline = true;
    await tester.pumpWidget(previewApp(Scaffold(
        body: Builder(
            builder: (context) => TextButton(
                onPressed: () => showRailwayOrderTimeline(context,
                    orderId: 'pedido-local-123',
                    admin: false,
                    repository: repo),
                child: const Text('Abrir histórico'))))));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Abrir histórico'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Detalhe interno'), findsNothing);
    expect(repo.timelineCalls, 1);
    repo.failTimeline = false;
    await tester.tap(find.text('Tentar novamente'));
    await tester.pumpAndSettle();
    expect(repo.timelineCalls, 2);
    expect(find.text('Saiu para entrega local'), findsNWidgets(2));
    expect(find.textContaining('29/10/2026'), findsWidgets);
    await savePreview(tester, 'historico-entrega-local');
    await tester.pump();
    expect(repo.timelineCalls, 2);
    expect(tester.takeException(), isNull);
  });
  testWidgets('configuração rejeita faixa invertida antes de chamar API',
      (tester) async {
    await viewport(tester);
    final repo = ReceivingShipping();
    await tester.pumpWidget(previewApp(Scaffold(
        body: SingleChildScrollView(
            child: LocalFulfillmentSettings(repository: repo, settings: const {
      'localEnabled': true,
      'localEstimate': 'Até dois dias úteis',
      'localFeeCents': 700,
      'localPostalRanges': [
        {'start': '02000000', 'end': '01000000'}
      ]
    })))));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Salvar retirada e entrega local'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Salvar retirada e entrega local'));
    await tester.pumpAndSettle();
    expect(repo.saved, isEmpty);
    expect(
        find.text('Use início-fim, oito números em cada CEP, até 30 faixas.'),
        findsOneWidget);
  });
  testWidgets('configuração salva taxa zero e CEPs com zero inicial',
      (tester) async {
    await viewport(tester, width: 1200);
    final repo = ReceivingShipping();
    await tester.pumpWidget(previewApp(Scaffold(
        body: SingleChildScrollView(
            child: Center(
                child: SizedBox(
                    width: 760,
                    child: LocalFulfillmentSettings(
                        repository: repo,
                        settings: const {
                          'pickupAddress': 'Rua da Loja, 20',
                          'pickupHours': 'Seg a sex, 9h às 18h',
                          'localEnabled': true,
                          'localFeeCents': 0,
                          'localEstimate':
                              'Até dois dias úteis após confirmação',
                          'localPostalRanges': [
                            {'start': '01000000', 'end': '01999999'}
                          ]
                        })))))));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Salvar retirada e entrega local'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Salvar retirada e entrega local'));
    await tester.pumpAndSettle();
    expect(repo.saved.single['localFeeCents'], 0);
    expect(repo.saved.single['localPostalRanges'], [
      {'start': '01000000', 'end': '01999999'}
    ]);
    await savePreview(tester, 'admin-recebimento-local');
    expect(tester.takeException(), isNull);
  });
}
