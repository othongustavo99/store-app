import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:loja_roupas/data/repositories/railway_integrations_repository.dart';
import 'package:loja_roupas/features/admin/integrations/railway_integrations_screen.dart';

class _PreflightRepository extends RailwayIntegrationsRepository {
  int calls = 0;
  int changes = 0;
  @override
  Future<bool> isOwner() async => true;
  @override
  Future<List<Map<String, dynamic>>> list() async => [{
    'id': '11111111-1111-4111-8111-111111111111',
    'name': 'ERP piloto', 'provider': 'bling', 'deliveryMode': 'POLL',
    'revokedAt': null, 'scopes': ['orders.read'],
  }];
  @override
  Future<Map<String, dynamic>> health(String id) async => {
    'component': 'ORDERS', 'status': 'NO_REPORT',
    'lastResult': null, 'lastReportAt': null, 'lastSummary': null,
  };
  @override
  Future<Map<String, dynamic>> goLivePreflight(String id) async {
    calls++;
    return {
      'status':'NEEDS_ACTION', 'homologated':false,'productionApproved':false,
      'summary':{'passed':1,'total':2,'pending':1},
      'checks':[
        {'code':'TECH_ACTIVE','ok':true,'detail':'Credencial ativa.'},
        {'code':'HOMOLOGATION_ENVIRONMENT','ok':false,
          'detail':'Configure ambiente de homologação.'},
      ],
      'note':'Nenhuma integração foi ativada.',
    };
  }
  @override
  Future<void> revoke(String id) async {changes++;}
}

void main() {
  testWidgets('pré-homologação exibe pendências sem ação de ativação', (tester) async {
    final repo=_PreflightRepository();
    await tester.pumpWidget(MaterialApp(home: RailwayIntegrationsScreen(repository:repo)));
    await tester.pumpAndSettle();
    final action=find.text('Pré-homologação');
    await tester.ensureVisible(action);
    await tester.pumpAndSettle();
    await tester.tap(action);
    await tester.pumpAndSettle();
    expect(find.text('Pré-homologação ERP/PDV'),findsOneWidget);
    expect(find.text('Pendências antes do teste assistido'),findsOneWidget);
    expect(find.text('HOMOLOGATION_ENVIRONMENT'),findsOneWidget);
    expect(find.textContaining('NÃO é homologação comercial'),findsOneWidget);
    expect(repo.calls,1);
    expect(repo.changes,0);
  });
}
