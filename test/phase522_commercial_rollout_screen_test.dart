import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:loja_roupas/data/repositories/railway_commercial_rollout_repository.dart';
import 'package:loja_roupas/features/admin/commercial/railway_commercial_rollout_screen.dart';

class FakeCommercialRollout implements CommercialRolloutSource {
  FakeCommercialRollout({this.role = 'OWNER'});
  final String role;
  int saves = 0;
  Map<String, dynamic>? lastPayload;

  Map<String,dynamic> get payload => {
    'revision': saves,
    'myRole': role,
    'plan': {
      'paymentProvider': saves > 0 ? lastPayload!['paymentProvider'] : 'NONE',
      'paymentStage': saves > 0 ? lastPayload!['paymentStage'] : 'NOT_PLANNED',
      'paymentEnvironment':'SANDBOX',
      'refundStage':'NOT_PLANNED',
      'carrierProvider':'NONE',
      'carrierStage':'NOT_PLANNED',
      'carrierEnvironment':'SANDBOX',
    },
    'legacyPilot': {'paymentPilot':false, 'carrierPilot':false, 'refundPilot':false},
    'nextSteps': ['Definir pagamento online', 'Homologação pendente'],
  };

  @override
  Future<Map<String,dynamic>> load() async => payload;

  @override
  Future<Map<String,dynamic>> save(Map<String,dynamic> body) async {
    saves++;
    lastPayload=Map.of(body);
    return payload;
  }
}

void main(){
  testWidgets('exibe aviso de segurança e situação de homologação', (tester) async {
    final repo=FakeCommercialRollout();
    await tester.pumpWidget(MaterialApp(home:RailwayCommercialRolloutScreen(repository:repo)));
    await tester.pumpAndSettle();
    expect(find.text('Configuração apenas preparatória'),findsOneWidget);
    expect(find.textContaining('não são cadastrados aqui'),findsOneWidget);
    await tester.scrollUntilVisible(find.textContaining('Homologação pendente'),240);
    expect(find.textContaining('Homologação pendente'),findsOneWidget);
    expect(repo.saves,0);
  });
  testWidgets('funcionário autorizado a ler mas não proprietário não altera plano', (tester) async {
    final repo=FakeCommercialRollout(role:'MANAGER');
    await tester.pumpWidget(MaterialApp(home:RailwayCommercialRolloutScreen(repository:repo)));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Somente o proprietário pode editar este planejamento.'),240);
    expect(find.text('Somente o proprietário pode editar este planejamento.'),findsOneWidget);
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton,'Salvar planejamento')).onPressed,isNull);
    expect(repo.saves,0);
  });
  testWidgets('proprietário registra intenção de pagamento sem credencial e sem ativar gateway', (tester) async {
    final repo=FakeCommercialRollout();
    await tester.pumpWidget(MaterialApp(home:RailwayCommercialRolloutScreen(repository:repo)));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('paymentProvider')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Mercado Pago').last);
    await tester.pumpAndSettle();
    final save=find.widgetWithText(FilledButton,'Salvar planejamento');
    expect(save, findsOneWidget);
    expect(tester.widget<FilledButton>(save).onPressed, isNotNull);
    // O botao ja existe na arvore (Column dentro de ListView), mesmo fora
    // da viewport. scrollUntilVisible pode parar sem rolar nesse caso.
    await tester.ensureVisible(save);
    await tester.pumpAndSettle();
    await tester.tap(save);
    await tester.pumpAndSettle();
    expect(repo.saves,1);
    expect(repo.lastPayload?['expectedRevision'],0);
    expect(repo.lastPayload?['paymentProvider'],'MERCADOPAGO');
    expect(repo.lastPayload?['paymentStage'],'PLANNED');
    expect(repo.lastPayload?.containsKey('token'),false);
    expect(find.textContaining('Nenhuma integração real foi ativada'),findsOneWidget);
  });
}
