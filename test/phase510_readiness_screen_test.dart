import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:loja_roupas/data/repositories/railway_integrations_repository.dart';
import 'package:loja_roupas/features/admin/integrations/railway_integrations_screen.dart';

class _ReadinessRepository extends RailwayIntegrationsRepository {
  @override
  Future<bool> isOwner() async => true;

  @override
  Future<List<Map<String, dynamic>>> list() async => [{
    'id': '11111111-1111-4111-8111-111111111111',
    'name': 'ERP da loja piloto', 'provider': 'omie',
    'deliveryMode': 'POLL', 'revokedAt': null,
    'scopes': ['orders.read'],
  }];

  @override
  Future<Map<String, dynamic>> health(String id) async => {
    'component': 'ORDERS', 'status': 'NO_REPORT',
    'lastResult': null, 'lastReportAt': null, 'lastSummary': null,
  };

  @override
  Future<Map<String, dynamic>> readiness(String id) async => {
    'status': 'NEEDS_ACTION', 'homologated': false,
    'checks': [
      {'code': 'LEASED_QUEUE', 'ok': false,
        'detail': 'A entrega por lease deve ser habilitada pelo proprietário.'},
    ],
  };
}

void main() {
  testWidgets('exibe diagnostico como nao homologado e nao executa integracoes',
      (tester) async {
    await tester.pumpWidget(MaterialApp(home: RailwayIntegrationsScreen(
      repository: _ReadinessRepository())));
    await tester.pumpAndSettle();
    final action = find.text('Diagnóstico de implantação');
    await tester.ensureVisible(action);
    await tester.pumpAndSettle();
    await tester.tap(action);
    await tester.pumpAndSettle();
    expect(find.text('Existem pendências para exportação de pedidos'), findsOneWidget);
    expect(find.textContaining('NÃO significa integração homologada'), findsOneWidget);
    expect(find.text('LEASED_QUEUE'), findsOneWidget);
  });
}
