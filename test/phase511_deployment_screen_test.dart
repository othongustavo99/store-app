import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:loja_roupas/data/repositories/railway_integrations_repository.dart';
import 'package:loja_roupas/features/admin/integrations/railway_integrations_screen.dart';

class _DeploymentRepository extends RailwayIntegrationsRepository {
  int saveCalls = 0;
  int? savedRevision;
  String? savedEnvironment;
  String? savedAlias;
  Map<String, bool>? savedChecks;

  @override
  Future<bool> isOwner() async => true;

  @override
  Future<List<Map<String, dynamic>>> list() async => [{
    'id': '11111111-1111-4111-8111-111111111111',
    'name': 'ERP da loja piloto', 'provider': 'bling',
    'deliveryMode': 'POLL', 'revokedAt': null,
    'scopes': ['orders.read'],
  }];

  @override
  Future<Map<String, dynamic>> health(String id) async => {
    'component': 'ORDERS', 'status': 'NO_REPORT',
    'lastResult': null, 'lastReportAt': null, 'lastSummary': null,
  };

  @override
  Future<Map<String, dynamic>> deployment(String integrationId) async => {
    'environment': 'HOMOLOGATION', 'workerAlias': null, 'revision': 0,
    'checks': {
      'credentialsSecured': false, 'providerAccessChecked': false,
      'catalogChecked': false, 'ordersChecked': false,
      'reconciliationChecked': false,
    },
  };

  @override
  Future<Map<String, dynamic>> saveDeployment(String integrationId, {
    required int expectedRevision,
    required String environment,
    required String? workerAlias,
    required Map<String, bool> checks,
  }) async {
    saveCalls += 1;
    savedRevision = expectedRevision;
    savedEnvironment = environment;
    savedAlias = workerAlias;
    savedChecks = Map.of(checks);
    return {'revision': expectedRevision + 1};
  }
}

void main() {
  testWidgets('implantacao e declaratoria, salva por loja sem ativar conector',
      (tester) async {
    final repo = _DeploymentRepository();
    await tester.pumpWidget(MaterialApp(home: RailwayIntegrationsScreen(
      repository: repo)));
    await tester.pumpAndSettle();
    final action = find.text('Implantação');
    await tester.ensureVisible(action);
    await tester.pumpAndSettle();
    await tester.tap(action);
    await tester.pumpAndSettle();
    expect(find.textContaining('não ativa vendas automáticas'), findsOneWidget);
    final save = find.text('Salvar checklist');
    await tester.tap(save);
    await tester.pumpAndSettle();
    expect(repo.saveCalls, 1);
    expect(repo.savedRevision, 0);
    expect(repo.savedEnvironment, 'HOMOLOGATION');
    expect(repo.savedAlias, isNull);
    expect(repo.savedChecks?['ordersChecked'], false);
  });
}
