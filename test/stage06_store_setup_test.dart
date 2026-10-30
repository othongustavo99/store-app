import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:loja_roupas/core/config/store_build_contract.dart';
import 'package:loja_roupas/core/network/loja_api.dart';
import 'package:loja_roupas/data/repositories/railway_store_profile_repository.dart';
import 'package:loja_roupas/features/client/widgets/store_connection_gate.dart';
import 'package:loja_roupas/features/admin/store_settings/railway_store_settings_screen.dart';
import 'package:loja_roupas/features/admin/store_settings/store_brand_preview.dart';
import 'package:loja_roupas/features/admin/store_settings/store_preparation_card.dart';
import 'helpers/stage03_fixtures.dart';

const storeId = '10000000-0000-4000-8000-000000000001';
const contract = StoreBuildContract(
    apiBaseUrl: 'https://api.example.invalid',
    slug: 'vila-demo',
    expectedId: storeId,
    expectedMode: 'DEMO',
    environment: 'demo');
Map<String, dynamic> matchingStore() =>
    {'id': storeId, 'slug': 'vila-demo', 'isDemo': true};
Map<String, dynamic> preparation() => {
      'mode': 'LIVE',
      'progress': {'completed': 3, 'total': 6},
      'channels': {
        'pickup': true,
        'offlinePayment': true,
        'onlinePayment': false,
        'localDelivery': false,
        'carrierDelivery': false
      },
      'steps': [
        {
          'id': 'identity',
          'title': 'Identidade da loja',
          'description': 'Nome e logotipo.',
          'done': false,
          'route': '/admin/store-settings'
        },
        {
          'id': 'contacts',
          'title': 'Atendimento',
          'description': 'Telefone ou email para contato com a loja.',
          'done': true,
          'route': '/admin/store-settings'
        },
        {
          'id': 'catalog',
          'title': 'Catálogo disponível',
          'description': 'Peças publicadas com estoque.',
          'done': true,
          'route': '/admin/products'
        },
        {
          'id': 'pickup',
          'title': 'Retirada informada',
          'description': 'Endereço e horário para buscar o pedido.',
          'done': false,
          'route': '/admin/shipping'
        },
        {
          'id': 'checkout',
          'title': 'Forma de pagamento',
          'description':
              'Pagamento local autorizado ou integração online configurada.',
          'done': true,
          'route': '/admin/store-settings'
        },
        {
          'id': 'legal',
          'title': 'Políticas da loja',
          'description': 'Links de privacidade, termos e trocas cadastrados.',
          'done': false,
          'route': '/admin/store-settings'
        },
      ],
      'notice': 'Configuração cadastrada não aprova a loja automaticamente.',
      'limitations': <String>[]
    };

class ProfileSetup extends RailwayStoreProfileRepository {
  int loads = 0, preparationLoads = 0, version = 3;
  bool staff = false,
      demo = false,
      failLoad = false,
      failSave = false,
      failPreparation = false;
  final saved = <Map<String, dynamic>>[];
  @override
  Future<Map<String, dynamic>> adminProfile() async {
    loads++;
    if (failLoad) throw StateError('Erro técnico interno');
    return {
      'store': {
        'id': storeId,
        'slug': 'vila-moda',
        'name': 'Vila Moda',
        'isDemo': demo
      },
      'myRole': staff ? 'STAFF' : 'OWNER',
      'profile': {
        'version': version,
        'displayName': 'Vila Moda',
        'tagline': 'Leveza para vestir o seu dia.',
        'description': 'Peças versáteis, escolhidas de perto.',
        'primaryColor': '#145B55',
        'secondaryColor': '#E9BB76',
        'logoUrl': '',
        'bannerUrl': '',
        'supportEmail': 'contato@example.invalid',
        'supportPhone': '11999999999',
        'instagramUrl': '',
        'privacyUrl': '',
        'termsUrl': '',
        'returnsUrl': '',
        'offlineMethods': demo ? <String>[] : ['PAY_ON_PICKUP']
      }
    };
  }

  @override
  Future<Map<String, dynamic>> readiness() async {
    preparationLoads++;
    if (failPreparation) {
      throw StateError('Serviço temporariamente indisponível');
    }
    return preparation();
  }

  @override
  Future<Map<String, dynamic>> saveProfile(Map<String, dynamic> profile) async {
    saved.add(profile);
    if (failSave) throw const LojaApiException('Versão antiga', 409);
    version++;
    return {'version': version};
  }
}

Future<void> setupApp(WidgetTester tester, ProfileSetup repo,
    {double width = 390, double textScale = 1}) async {
  tester.view.physicalSize = Size(width, 1000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.runAsync(seedPreviewImages);
  await tester.pumpWidget(previewApp(
      RailwayStoreSettingsScreen(repository: repo),
      textScale: textScale));
  await tester.pumpAndSettle();
}

Future<void> enter(WidgetTester tester, String label, String value) async {
  final finder = find.widgetWithText(TextFormField, label);
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.enterText(finder, value);
  await tester.pump();
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test(
      'vínculo aceita somente UUID, slug e modo previstos e mantém builds antigos sem obrigatoriedade',
      () {
    contract.validateStore(matchingStore());
    for (final store in [
      matchingStore()..['id'] = '20000000-0000-4000-8000-000000000001',
      matchingStore()..['slug'] = 'outra-loja',
      matchingStore()..['isDemo'] = false,
      matchingStore()..remove('isDemo')
    ]) {
      expect(() => contract.validateStore(store), throwsStateError);
    }
    expect(
        const StoreBuildContract(
                apiBaseUrl: 'https://api.example.invalid', slug: 'loja-antiga')
            .bound,
        false);
  });
  test(
      'build rejeita URL com credenciais ou protocolo incorreto e ambiente contraditório',
      () {
    for (final url in [
      'http://api.example.invalid',
      'https://user:pass@api.example.invalid',
      'https://api.example.invalid?secret=x'
    ]) {
      expect(
          () => StoreBuildContract(apiBaseUrl: url, slug: 'vila-demo')
              .validateConfiguration(),
          throwsStateError);
    }
    expect(
        () => const StoreBuildContract(
                apiBaseUrl: 'https://api.example.invalid',
                slug: 'vila-demo',
                expectedMode: 'LIVE',
                environment: 'demo')
            .validateConfiguration(),
        throwsStateError);
  });
  testWidgets('loja protegida só é montada depois da conferência',
      (tester) async {
    final pending = Completer<Map<String, dynamic>>();
    await tester.pumpWidget(StoreConnectionGate(
        enabled: true,
        contract: contract,
        verify: () => pending.future,
        child: const MaterialApp(home: Text('Catálogo protegido'))));
    await tester.pump();
    expect(find.text('Catálogo protegido'), findsNothing);
    pending.complete(matchingStore());
    await tester.pumpAndSettle();
    expect(find.text('Catálogo protegido'), findsOneWidget);
  });
  testWidgets(
      'modo ou loja incorretos bloqueiam catálogo; nova tentativa pode recuperar',
      (tester) async {
    var attempts = 0;
    await tester.pumpWidget(StoreConnectionGate(
        enabled: true,
        contract: contract,
        verify: () async {
          attempts++;
          if (attempts == 1) {
            return matchingStore()..['isDemo'] = false;
          }
          return matchingStore();
        },
        child: const MaterialApp(home: Text('Catálogo protegido'))));
    await tester.pumpAndSettle();
    expect(find.text('Catálogo protegido'), findsNothing);
    expect(find.text('Não foi possível abrir a loja'), findsOneWidget);
    expect(find.textContaining('ambiente esperado'), findsNothing);
    await tester.tap(find.text('Tentar novamente'));
    await tester.pumpAndSettle();
    expect(find.text('Catálogo protegido'), findsOneWidget);
    expect(attempts, 2);
  });
  testWidgets(
      'nome e paleta atualizam prévia local e salvar preserva a versão sem sobrescrever o formulário',
      (tester) async {
    final repo = ProfileSetup();
    await setupApp(tester, repo);
    await enter(tester, 'Nome exibido da loja', 'Vila Moda Centro');
    await tester.ensureVisible(find.text('Vinho'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Vinho'));
    await tester.pumpAndSettle();
    final preview =
        tester.widget<StoreBrandPreview>(find.byType(StoreBrandPreview));
    expect(preview.name, 'Vila Moda Centro');
    expect(preview.primary, const Color(0xFF7A2843));
    await savePreview(tester, 'identidade-previa');
    await tester.tap(find.text('Salvar perfil da loja'));
    await tester.pumpAndSettle();
    expect(repo.saved.single['expectedVersion'], 3);
    expect(repo.saved.single['primaryColor'], '#7A2843');
    expect(repo.loads, 1);
    await enter(tester, 'Slogan', 'Coleção da sua cidade');
    await tester.tap(find.text('Salvar perfil da loja'));
    await tester.pumpAndSettle();
    expect(repo.saved.last['expectedVersion'], 4);
    expect(tester.takeException(), isNull);
  });
  testWidgets('atualizar pede confirmação e cancelar preserva o rascunho',
      (tester) async {
    final repo = ProfileSetup();
    await setupApp(tester, repo);
    await enter(tester, 'Nome exibido da loja', 'Nome ainda não salvo');
    await tester.tap(find.byTooltip('Atualizar perfil'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Continuar editando'));
    await tester.pumpAndSettle();
    expect(repo.loads, 1);
    expect(
        tester
            .widget<TextFormField>(
                find.widgetWithText(TextFormField, 'Nome exibido da loja'))
            .controller!
            .text,
        'Nome ainda não salvo');
    await tester.tap(find.byTooltip('Atualizar perfil'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Descartar'));
    await tester.pumpAndSettle();
    expect(repo.loads, 2);
    expect(
        tester
            .widget<TextFormField>(
                find.widgetWithText(TextFormField, 'Nome exibido da loja'))
            .controller!
            .text,
        'Vila Moda');
    expect(tester.takeException(), isNull);
  });
  testWidgets(
      'erro ao salvar mantém os dados editados e permite atualizar depois',
      (tester) async {
    final repo = ProfileSetup()..failSave = true;
    await setupApp(tester, repo);
    await enter(tester, 'Nome exibido da loja', 'Minha Marca');
    await tester.tap(find.text('Salvar perfil da loja'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Não foi possível salvar.'), findsOneWidget);
    expect(
        tester
            .widget<TextFormField>(
                find.widgetWithText(TextFormField, 'Nome exibido da loja'))
            .controller!
            .text,
        'Minha Marca');
    expect(tester.takeException(), isNull);
  });
  testWidgets(
      'funcionário só consulta e não dispara consulta de preparação sem permissão',
      (tester) async {
    final repo = ProfileSetup()..staff = true;
    await setupApp(tester, repo);
    expect(find.text('Salvar perfil da loja'), findsNothing);
    expect(repo.preparationLoads, 0);
    expect(
        tester
            .widget<TextFormField>(
                find.widgetWithText(TextFormField, 'Nome exibido da loja'))
            .enabled,
        false);
  });
  testWidgets('demo é identificada e não habilita formas de pagamento local',
      (tester) async {
    await setupApp(tester, ProfileSetup()..demo = true);
    expect(find.text('Demonstração · sem cobrança real'), findsOneWidget);
    await tester.ensureVisible(
        find.widgetWithText(SwitchListTile, 'Pagar na retirada'));
    await tester.pumpAndSettle();
    expect(
        tester
            .widget<SwitchListTile>(
                find.widgetWithText(SwitchListTile, 'Pagar na retirada'))
            .onChanged,
        isNull);
  });
  testWidgets(
      'falha ao carregar oferece nova tentativa sem exibir erro interno',
      (tester) async {
    final repo = ProfileSetup()..failLoad = true;
    await setupApp(tester, repo);
    expect(find.textContaining('Erro técnico'), findsNothing);
    repo.failLoad = false;
    await tester.tap(find.text('Tentar novamente'));
    await tester.pumpAndSettle();
    expect(find.text('Loja e ambiente'), findsOneWidget);
  });
  testWidgets(
      'preparação mostra progresso e atalhos sem declarar aprovação comercial',
      (tester) async {
    tester.view.physicalSize = const Size(390, 1100);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    String? opened;
    await tester.runAsync(seedPreviewImages);
    await tester.pumpWidget(previewApp(Scaffold(
        body: SingleChildScrollView(
            child: StorePreparationCard(
                data: preparation(), onOpen: (r) => opened = r)))));
    await tester.pumpAndSettle();
    expect(find.text('3 de 6 configurações cadastradas'), findsOneWidget);
    await tester.tap(find.text('Catálogo disponível'));
    expect(opened, '/admin/products');
    await savePreview(tester, 'preparacao-loja');
    expect(tester.takeException(), isNull);
  });
  testWidgets('configurações cabem em 320 pixels com texto ampliado',
      (tester) async {
    await setupApp(tester, ProfileSetup(), width: 320, textScale: 1.3);
    await enter(tester, 'Nome exibido da loja', 'Vila Moda');
    await tester.ensureVisible(find.byType(StoreBrandPreview));
    await tester.pumpAndSettle();
    await savePreview(tester, 'identidade-celular');
    expect(tester.takeException(), isNull);
  });
}
