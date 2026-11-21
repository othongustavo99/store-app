import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:loja_roupas/data/repositories/railway_integrations_repository.dart';
import 'package:loja_roupas/features/admin/integrations/railway_integrations_screen.dart';

class _FakeRepository extends RailwayIntegrationsRepository {
  _FakeRepository({this.owner = true, this.entries = const [],
      this.eventType = 'catalog.product.changed'});
  final bool owner;
  final String eventType;
  final List<Map<String, dynamic>> entries;
  String? retriedEvent;

  @override
  Future<bool> isOwner() async => owner;
  @override
  Future<List<Map<String, dynamic>>> list() async => entries;
  @override
  Future<Map<String, dynamic>> health(String id) async => {
    'component': 'ORDERS', 'status': 'NO_REPORT', 'lastResult': null,
    'lastReportAt': null, 'lastSummary': null,
  };
  @override
  Future<Map<String, dynamic>> delivery(String id) async => {
    'deliveryMode': 'LEASED',
    'unmaterializedEvents': 2,
    'counts': {'PENDING': 1, 'DEAD': 1, 'ACKED': 3},
    'recentFailures': [
      {
        'eventId': '42', 'type': eventType,
        'status': 'DEAD', 'attempts': 8,
        'lastErrorCode': 'PROVIDER_UNAVAILABLE',
      },
    ],
  };
  @override
  Future<void> retryEvent(String integrationId, String eventId) async {
    retriedEvent = eventId;
  }
}

void main() {
  testWidgets('restringe a central para contas de proprietario', (tester) async {
    final repo = _FakeRepository(owner: false);
    await tester.pumpWidget(MaterialApp(
      home: RailwayIntegrationsScreen(repository: repo)));
    await tester.pumpAndSettle();
    expect(find.text('Acesso exclusivo do proprietário'), findsOneWidget);
    expect(find.text('Nova integração'), findsNothing);
  });

  testWidgets('permite visualizar central sem integracoes', (tester) async {
    final repo = _FakeRepository();
    await tester.pumpWidget(MaterialApp(
      home: RailwayIntegrationsScreen(repository: repo)));
    await tester.pumpAndSettle();
    expect(find.text('Nova integração'), findsOneWidget);
    expect(find.textContaining('Nenhum ERP/PDV conectado'), findsOneWidget);
  });

  testWidgets('nao oferece reenvio de pedidos sem conciliacao',
      (tester) async {
    final repo = _FakeRepository(eventType: 'order.changed', entries: [{
      'id': '11111111-1111-4111-8111-111111111111',
      'name': 'ERP de teste', 'provider': 'generic',
      'tokenPrefix': 'f40i_exemplo', 'deliveryMode': 'LEASED',
      'scopes': ['orders.read'], 'revokedAt': null,
    }]);
    await tester.pumpWidget(MaterialApp(
      home: RailwayIntegrationsScreen(repository: repo)));
    await tester.pumpAndSettle();
    expect(find.text('Revisão manual'), findsOneWidget);
    expect(find.text('Reprocessar'), findsNothing);
  });

  testWidgets('exibe falhas e pede confirmacao antes de reprocessar',
      (tester) async {
    final repo = _FakeRepository(entries: [{
      'id': '11111111-1111-4111-8111-111111111111',
      'name': 'Bling teste', 'provider': 'bling',
      'tokenPrefix': 'f40i_exemplo', 'deliveryMode': 'LEASED',
      'scopes': ['catalog.read', 'orders.read'], 'revokedAt': null,
    }]);
    await tester.pumpWidget(MaterialApp(
      home: RailwayIntegrationsScreen(repository: repo)));
    await tester.pumpAndSettle();
    expect(find.text('Bling teste'), findsOneWidget);
    expect(find.text('Falhas definitivas: 1'), findsOneWidget);
    // A lista de integrações pode ultrapassar os 600px do viewport de teste.
    // Arrastamos a lista antes do toque para que o botão receba o evento.
    await tester.drag(find.byType(ListView), const Offset(0, -450));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Reprocessar'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Reprocessar'));
    await tester.pumpAndSettle();
    expect(find.text('Reprocessar evento 42?'), findsOneWidget);
    expect(repo.retriedEvent, isNull);
    await tester.tap(find.text('Colocar na fila'));
    await tester.pumpAndSettle();
    expect(repo.retriedEvent, '42');
  });
}
