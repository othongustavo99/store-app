import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:loja_roupas/data/repositories/railway_order_repository.dart';
import 'package:loja_roupas/data/repositories/railway_after_sales_repository.dart';
import 'package:loja_roupas/features/admin/orders/railway_admin_orders_screen.dart';
import 'package:loja_roupas/features/client/orders/widgets/order_receiving_info.dart';
import 'helpers/stage03_fixtures.dart';

Map<String, dynamic> pickupOrder() => {
      'id': '10000000-0000-4000-8000-000000000001',
      'status': 'PENDING_PAYMENT',
      'paymentProvider': 'offline',
      'paymentStatus': 'PENDING',
      'fulfillment': 'PICKUP',
      'pickupPreparation': 'NONE',
      'totalCents': '8990',
      'reservationExpiresAt':
          DateTime.now().add(const Duration(hours: 2)).toIso8601String(),
      'customerContact': {
        'name': 'Ana Silva',
        'phone': '11999999999',
        'offlineMethod': 'PAY_ON_PICKUP',
        'pickupAddress': 'Rua da Loja, 20',
        'pickupHours': 'Seg a sex, 9h às 18h'
      },
      'items': [
        {'name': 'Camisa de linho', 'sku': 'CAM-AZ-M', 'quantity': 1}
      ],
    };

class AdminOrders extends RailwayOrderRepository {
  final order = pickupOrder();
  final stages = <String>[];
  int confirmations = 0;
  @override
  Future<List<Map<String, dynamic>>> adminOrders() async => [Map.of(order)];
  @override
  Future<Map<String, dynamic>> preparePickup(
      String orderId, String stage) async {
    stages.add(stage);
    order['pickupPreparation'] = stage;
    return Map.of(order);
  }

  @override
  Future<Map<String, dynamic>> confirmOffline(String orderId) async {
    confirmations++;
    order['paymentStatus'] = 'APPROVED';
    order['status'] =
        order['pickupPreparation'] == 'READY' ? 'SHIPPED' : 'PAID';
    return Map.of(order);
  }
}

class AdminPermissions extends RailwayAfterSalesRepository {
  AdminPermissions(this.allowed);
  final bool allowed;
  @override
  Future<bool> canReview() async => allowed;
}

class NoRefunds extends RailwayRefundRepository {
  @override
  Future<bool> canRefund() async => false;
  @override
  Future<Map<String, dynamic>> list() async =>
      {'enabled': false, 'refunds': []};
}

Future<void> ordersApp(WidgetTester tester, AdminOrders repo,
    {bool manager = true, double width = 390, double textScale = 1}) async {
  tester.view.physicalSize = Size(width, 980);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.runAsync(seedPreviewImages);
  await tester.pumpWidget(previewApp(
      RailwayAdminOrdersScreen(
          repository: repo,
          afterSales: AdminPermissions(manager),
          refunds: NoRefunds(),
          changes: const Stream<int>.empty()),
      textScale: textScale));
  await tester.pumpAndSettle();
}

Future<void> tapVisible(WidgetTester tester, String text) async {
  final finder = find.text(text);
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  testWidgets(
      'gestor prepara e marca pronto mantendo pagamento pendente até a confirmação explícita',
      (tester) async {
    final repo = AdminOrders();
    await ordersApp(tester, repo);
    await tapVisible(tester, 'Preparar · pagamento na retirada');
    expect(repo.stages, ['PREPARING']);
    expect(repo.order['paymentStatus'], 'PENDING');
    await tapVisible(tester, 'Pronto · pagamento na retirada');
    expect(repo.stages, ['PREPARING']);
    await tester.tap(find.text('Está separado'));
    await tester.pumpAndSettle();
    expect(repo.stages, ['PREPARING', 'READY']);
    expect(repo.confirmations, 0);
    expect(
        find.text('Pronto para retirada · pagamento pendente'), findsWidgets);
    await savePreview(tester, 'admin-retirada-pronta');
    await tapVisible(tester, 'Confirmar recebimento manual');
    expect(find.textContaining('89,90'), findsWidgets);
    await tester.tap(find.text('Voltar'));
    await tester.pumpAndSettle();
    expect(repo.confirmations, 0);
    await tapVisible(tester, 'Confirmar recebimento manual');
    await tester.tap(find.text('Conferi o recebimento'));
    await tester.pumpAndSettle();
    expect(repo.confirmations, 1);
    expect(repo.order['status'], 'SHIPPED');
    expect(find.text('Concluir pedido'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
      'funcionário consulta mas não confirma recebimento nem muda preparo',
      (tester) async {
    final repo = AdminOrders();
    await ordersApp(tester, repo, manager: false);
    expect(find.text('Confirmar recebimento manual'), findsNothing);
    expect(find.text('Preparar · pagamento na retirada'), findsNothing);
    expect(find.textContaining('Pedido 10000000'), findsOneWidget);
  });
  testWidgets(
      'filtros e busca encontram cliente e mostram vazio sem esconder controles',
      (tester) async {
    await ordersApp(tester, AdminOrders());
    await tester.enterText(
        find.widgetWithText(TextField, 'Buscar pedido, cliente ou produto'),
        'Ana Silva');
    await tester.pumpAndSettle();
    expect(find.textContaining('1 de 1 pedido'), findsOneWidget);
    await tester.enterText(
        find.widgetWithText(TextField, 'Buscar pedido, cliente ou produto'),
        'inexistente');
    await tester.pumpAndSettle();
    expect(find.text('Nenhum pedido para esta busca.'), findsOneWidget);
    await tester.enterText(
        find.widgetWithText(TextField, 'Buscar pedido, cliente ou produto'),
        '');
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.widgetWithText(ChoiceChip, 'A preparar'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ChoiceChip, 'A preparar'));
    await tester.pumpAndSettle();
    expect(find.textContaining('1 de 1 pedido'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets('pedidos administrativos cabem em 320 pixels com texto ampliado',
      (tester) async {
    await ordersApp(tester, AdminOrders(), width: 320, textScale: 1.3);
    await tapVisible(tester, 'Preparar · pagamento na retirada');
    expect(tester.takeException(), isNull);
  });
  testWidgets(
      'cliente pronto para retirada continua vendo pagamento pendente e reserva vencida não promete retirada',
      (tester) async {
    final order = pickupOrder()..['pickupPreparation'] = 'READY';
    await tester.runAsync(seedPreviewImages);
    await tester.pumpWidget(
        previewApp(Scaffold(body: OrderReceivingInfo(order: order))));
    await tester.pumpAndSettle();
    expect(
        find.text(
            'Confira o horário e pague ao retirar. Seu pagamento ainda não foi confirmado.'),
        findsOneWidget);
    expect(orderStatusLabel('PICKUP_READY'),
        'Pronto para retirada · pagamento pendente');
    order['reservationExpiresAt'] =
        DateTime.now().subtract(const Duration(minutes: 1)).toIso8601String();
    expect(unpaidPickupLabel(order), isNull);
  });
}
