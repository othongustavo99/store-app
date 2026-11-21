import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:loja_roupas/data/repositories/railway_integrations_repository.dart';
import 'package:loja_roupas/features/admin/integrations/railway_integrations_screen.dart';

class _HealthRepo extends RailwayIntegrationsRepository {
  _HealthRepo(this.status);
  final String status;
  @override
  Future<bool> isOwner() async => true;
  @override
  Future<List<Map<String,dynamic>>> list() async => [{
    'id':'11111111-1111-4111-8111-111111111111',
    'name':'Conector de testes','provider':'bling','deliveryMode':'POLL',
    'scopes':['orders.read'],'revokedAt':null,
  }];
  @override
  Future<Map<String,dynamic>> health(String integrationId) async => {
    'component':'ORDERS','status':status,'lastResult':'WARNING',
    'lastReportAt':'2026-11-21T08:00:00Z','lastErrorCode':'ORDER_MAPPING_MISSING',
    'lastSummary':{'claimed':3,'acknowledged':2,'review':1,'retry':0,'ackErrors':0},
  };
}

void main() {
  testWidgets('mostra alerta do worker sem afirmar que ERP esta online', (tester) async {
    await tester.pumpWidget(MaterialApp(home:RailwayIntegrationsScreen(repository:_HealthRepo('ATTENTION'))));
    await tester.pumpAndSettle();
    expect(find.text('Último ciclo com alerta'), findsOneWidget);
    expect(find.textContaining('ORDER_MAPPING_MISSING'), findsOneWidget);
    expect(find.textContaining('não a conectividade'), findsOneWidget);
  });
  testWidgets('mostra relatorio atrasado como nao recente', (tester) async {
    await tester.pumpWidget(MaterialApp(home:RailwayIntegrationsScreen(repository:_HealthRepo('STALE'))));
    await tester.pumpAndSettle();
    expect(find.text('Sem relatório recente'), findsOneWidget);
  });
}
