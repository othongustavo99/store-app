import 'package:flutter/material.dart';
import '../../../data/repositories/railway_store_profile_repository.dart';

/// Configurações próprias de cada loja. Não gerencia credenciais financeiras.
class RailwayStoreSettingsScreen extends StatefulWidget {
  const RailwayStoreSettingsScreen({super.key});
  @override
  State<RailwayStoreSettingsScreen> createState() => _RailwayStoreSettingsScreenState();
}

class _RailwayStoreSettingsScreenState extends State<RailwayStoreSettingsScreen> {
  final repo = RailwayStoreProfileRepository();
  final controllers = <String, TextEditingController>{
    for (final key in <String>[
      'displayName', 'tagline', 'description', 'logoUrl', 'bannerUrl', 'primaryColor', 'secondaryColor',
      'supportEmail', 'supportPhone', 'instagramUrl', 'privacyUrl',
      'termsUrl', 'returnsUrl',
    ]) key: TextEditingController(),
  };
  late Future<Map<String, dynamic>> _profile;
  late Future<Map<String, dynamic>> _readiness;
  final Set<String> offlineMethods = {};
  int version = 1;
  bool canEdit = false;
  bool busy = false;

  @override
  void initState() { super.initState(); _reload(); }
  void _reload() {
    _profile = repo.adminProfile();
    _readiness = repo.readiness();
    _profile.then((data) {
      if (!mounted) return;
      final profile = Map<String, dynamic>.from(data['profile'] as Map);
      for (final entry in controllers.entries) {
        entry.value.text = profile[entry.key]?.toString() ?? '';
      }
      offlineMethods..clear()..addAll((profile['offlineMethods'] as List? ?? []).map((e) => '$e'));
      version = int.tryParse('${profile['version']}') ?? 1;
      setState(() => canEdit = data['myRole'] == 'OWNER' || data['myRole'] == 'MANAGER');
    }).catchError((Object _) {});
  }
  void refresh() { setState(_reload); }
  @override
  void dispose() {
    for (final c in controllers.values) { c.dispose(); }
    super.dispose();
  }
  void message(String text) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }
  Future<void> save() async {
    if (!canEdit || busy) return;
    final color = controllers['primaryColor']!.text.trim();
    if (!RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(color)) {
      message('A cor deve estar no formato #1C1B2F.'); return;
    }
    if (!RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(controllers['secondaryColor']!.text.trim())) {
      message('A cor secundária deve estar no formato #E94560.'); return;
    }
    final urls = ['logoUrl','bannerUrl','instagramUrl','privacyUrl','termsUrl','returnsUrl'];
    for (final key in urls) {
      final value = controllers[key]!.text.trim();
      final uri = Uri.tryParse(value);
      if (value.isNotEmpty && (uri == null || uri.scheme != 'https' || !uri.hasAuthority)) {
        message('Use HTTPS no campo ${_labels[key]}.'); return;
      }
    }
    final phone = controllers['supportPhone']!.text.trim();
    if (phone.isNotEmpty && !RegExp(r'^\d{10,15}$').hasMatch(phone)) {
      message('Telefone: use 10 a 15 dígitos, sem símbolos.'); return;
    }
    setState(() => busy = true);
    try {
      await repo.saveProfile({
        'expectedVersion': version,
        'offlineMethods': offlineMethods.toList(),
        for (final entry in controllers.entries) entry.key: entry.value.text.trim(),
      });
      message('Perfil da loja atualizado.');
      refresh();
    } catch (e) { message('$e'); }
    finally { if (mounted) setState(() => busy = false); }
  }

  static const _labels = <String, String>{
    'displayName': 'Nome exibido da loja', 'tagline': 'Slogan', 'description': 'Descrição da loja',
    'logoUrl': 'URL HTTPS do logotipo', 'bannerUrl': 'URL HTTPS do banner',
    'primaryColor': 'Cor principal (#RRGGBB)',
    'secondaryColor': 'Cor secundária (#RRGGBB)',
    'supportEmail': 'Email público de atendimento',
    'supportPhone': 'WhatsApp (apenas dígitos, com DDD)',
    'instagramUrl': 'URL HTTPS do Instagram',
    'privacyUrl': 'URL HTTPS da política de privacidade',
    'termsUrl': 'URL HTTPS dos termos de uso',
    'returnsUrl': 'URL HTTPS da política de trocas',
  };

  Widget _input(String key, {int lines = 1}) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: TextField(
      controller: controllers[key], enabled: canEdit && !busy,
      maxLines: lines, maxLength: key == 'description' ? 1200 : key == 'tagline' ? 140 : null,
      decoration: InputDecoration(
        labelText: _labels[key], border: const OutlineInputBorder(),
      ),
    ),
  );

  Widget _readinessSection() => FutureBuilder<Map<String, dynamic>>(
    future: _readiness,
    builder: (context, snapshot) {
      if (!snapshot.hasData) return Padding(
        padding: const EdgeInsets.all(16),
        child: snapshot.hasError ? Text('Não foi possível consultar preparação: ${snapshot.error}')
            : const Center(child: CircularProgressIndicator()),
      );
      final info = snapshot.data!;
      final checks = Map<String, dynamic>.from(info['checks'] as Map);
      final labels = <String, String>{
        'identity': 'Logotipo e email de atendimento',
        'legal': 'Privacidade, termos e trocas',
        'catalog': 'Pelo menos um produto publicado',
        'shippingOrigin': 'CEP de origem cadastrado',
        'shippingDimensions': 'Embalagens dos produtos publicados',
        'shippingPilotConnected': 'Frete externo conectado (loja piloto)',
        'paymentPilotCredentialsPresent': 'Credenciais de pagamento piloto cadastradas',
        'merchantPaymentsReady': 'Recebimento próprio do lojista habilitado',
      };
      return Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Preparação para comercialização', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          const Text('Este checklist não libera cobranças nem considera a loja aprovada automaticamente.'),
          for (final entry in labels.entries) ListTile(
            contentPadding: EdgeInsets.zero, dense: true,
            leading: Icon(checks[entry.key] == true ? Icons.check_circle_outline : Icons.radio_button_unchecked,
              color: checks[entry.key] == true ? Colors.green : null),
            title: Text(entry.value),
          ),
          const SizedBox(height: 6),
          const Text('Pagamentos e frete de diferentes lojistas exigem autorizações individuais. ' 
            'Não compartilhe o token da loja-piloto com outras lojas.',
            style: TextStyle(fontSize: 12)),
        ],
      )));
    },
  );

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Identidade e preparação da loja'), actions: [
      IconButton(tooltip: 'Atualizar', onPressed: busy ? null : refresh,
        icon: const Icon(Icons.refresh)),
    ]),
    body: FutureBuilder<Map<String, dynamic>>(
      future: _profile,
      builder: (context, snapshot) {
        if (!snapshot.hasData) return Center(child: snapshot.hasError
          ? Text('Falha ao carregar perfil: ${snapshot.error}')
          : const CircularProgressIndicator());
        final store = Map<String, dynamic>.from(snapshot.data!['store'] as Map);
        return Center(child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 900),
          child: ListView(padding: const EdgeInsets.all(20), children: [
            Text('${store['name']} • ${store['slug']}',
              style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 8),
            const Text('Cada loja possui sua própria identidade e contatos. ' 
              'Logotipo e banner devem ser URLs HTTPS de imagens já enviadas ao Cloudinary.'),
            const SizedBox(height: 16),
            Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _input('displayName'), _input('tagline'), _input('description', lines: 3),
                _input('logoUrl'), _input('bannerUrl'), _input('primaryColor'), _input('secondaryColor'),
                const SizedBox(height: 12),
                const Text('Pedidos locais (sem gateway): precisam de conferência manual pelo responsável. Não são pagamentos confirmados.'),
                for (final method in const {
                  'PAY_ON_PICKUP': 'Pagar na retirada',
                  'MANUAL_PIX': 'Pix manual (confirmar fora do aplicativo)',
                  'WHATSAPP': 'Combinar pelo WhatsApp',
                }.entries) SwitchListTile.adaptive(
                  title: Text(method.value), value: offlineMethods.contains(method.key),
                  onChanged: canEdit && !busy ? (on) => setState(() {
                    if (on) { offlineMethods.add(method.key); } else { offlineMethods.remove(method.key); }
                  }) : null),
                _input('supportEmail'), _input('supportPhone'), _input('instagramUrl'),
                _input('privacyUrl'), _input('termsUrl'), _input('returnsUrl'),
                FilledButton.icon(onPressed: busy || !canEdit ? null : save,
                  icon: const Icon(Icons.save_outlined),
                  label: Text(busy ? 'Salvando...' : 'Salvar perfil da loja')),
              ],
            ))),
            const SizedBox(height: 14),
            _readinessSection(),
          ]),
        ));
      },
    ),
  );
}
