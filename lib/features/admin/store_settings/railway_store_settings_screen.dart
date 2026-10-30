import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import '../../../data/repositories/railway_store_profile_repository.dart';
import '../../../providers/store_profile_providers.dart' show storeHex;
import '../admin_dialog.dart';
import 'store_brand_preview.dart';
import 'store_preparation_card.dart';

class RailwayStoreSettingsScreen extends StatefulWidget {
  const RailwayStoreSettingsScreen({super.key, this.repository});
  final RailwayStoreProfileRepository? repository;
  @override
  State<RailwayStoreSettingsScreen> createState() =>
      _RailwayStoreSettingsScreenState();
}

class _RailwayStoreSettingsScreenState
    extends State<RailwayStoreSettingsScreen> {
  late final _repo = widget.repository ?? RailwayStoreProfileRepository();
  final _form = GlobalKey<FormState>(), _scroll = ScrollController();
  final _fields = <String, TextEditingController>{
    for (final key in _labels.keys) key: TextEditingController()
  };
  final _offline = <String>{};
  Map<String, dynamic> _store = {};
  Map<String, dynamic> _savedFields = {};
  Map<String, dynamic>? _readiness;
  int _version = 1, _revision = 0;
  bool _loading = true,
      _busy = false,
      _dirty = false,
      _populating = false,
      _canEdit = false;
  bool _preparing = false, _preparationError = false;
  String? _loadError, _saveError;
  String _previewLogo = '', _previewBanner = '';
  static const _labels = {
    'displayName': 'Nome exibido da loja',
    'tagline': 'Slogan',
    'description': 'Descrição da loja',
    'logoUrl': 'URL HTTPS do logotipo',
    'bannerUrl': 'URL HTTPS do banner',
    'primaryColor': 'Cor principal (#RRGGBB)',
    'secondaryColor': 'Cor secundária (#RRGGBB)',
    'supportEmail': 'Email de atendimento',
    'supportPhone': 'WhatsApp com DDD (somente números)',
    'instagramUrl': 'URL HTTPS do Instagram',
    'privacyUrl': 'URL HTTPS da política de privacidade',
    'termsUrl': 'URL HTTPS dos termos de uso',
    'returnsUrl': 'URL HTTPS da política de trocas',
  };
  static const _limits = {
    'displayName': 120,
    'tagline': 140,
    'description': 1200,
    'logoUrl': 2048,
    'bannerUrl': 2048,
    'primaryColor': 7,
    'secondaryColor': 7,
    'supportEmail': 254,
    'supportPhone': 15,
    'instagramUrl': 2048,
    'privacyUrl': 2048,
    'termsUrl': 2048,
    'returnsUrl': 2048
  };
  @override
  void initState() {
    super.initState();
    for (final c in _fields.values) {
      c.addListener(_changed);
    }
    _load();
  }

  void _changed() {
    if (!_populating && mounted) setState(() => _dirty = true);
  }

  Future<void> _load() async {
    final revision = ++_revision;
    setState(() {
      _loading = true;
      _loadError = null;
      _saveError = null;
    });
    try {
      final data = await _repo.adminProfile();
      if (!mounted || revision != _revision) return;
      final profile = Map<String, dynamic>.from(data['profile'] as Map);
      _populating = true;
      for (final item in _fields.entries) {
        item.value.text = '${profile[item.key] ?? ''}';
      }
      _offline
        ..clear()
        ..addAll((profile['offlineMethods'] as List? ?? []).map((v) => '$v'));
      _version = (profile['version'] as num?)?.toInt() ??
          int.tryParse('${profile['version']}') ??
          1;
      _store = Map<String, dynamic>.from(data['store'] as Map);
      _savedFields = {
        for (final item in _fields.entries) item.key: item.value.text,
        'offlineMethods': _offline.toList()
      };
      _canEdit = ['OWNER', 'MANAGER'].contains(data['myRole']);
      _dirty = false;
      _populating = false;
      _previewLogo = _fields['logoUrl']!.text;
      _previewBanner = _fields['bannerUrl']!.text;
      if (_canEdit) {
        _loadReadiness();
      }
    } catch (_) {
      if (mounted && revision == _revision) {
        _loadError = 'Não foi possível carregar os dados da loja.';
      }
    } finally {
      _populating = false;
      if (mounted && revision == _revision) setState(() => _loading = false);
    }
  }

  Future<void> _loadReadiness() async {
    if (!mounted || !_canEdit) return;
    setState(() {
      _preparing = true;
      _preparationError = false;
    });
    try {
      final data = await _repo.readiness();
      if (mounted) setState(() => _readiness = data);
    } catch (_) {
      if (mounted) setState(() => _preparationError = true);
    } finally {
      if (mounted) setState(() => _preparing = false);
    }
  }

  Future<bool> _discard() async {
    if (!_dirty) return true;
    final accepted = await showAdminDialog<bool>(
            context: context,
            builder: (ctx) => AlertDialog(
                    title: const Text('Descartar alterações?'),
                    content: const Text(
                        'Há alterações no perfil que ainda não foram salvas.'),
                    actions: [
                      TextButton(
                          onPressed: () => Navigator.pop(ctx, false),
                          child: const Text('Continuar editando')),
                      FilledButton(
                          onPressed: () => Navigator.pop(ctx, true),
                          child: const Text('Descartar'))
                    ])) ==
        true;
    if (accepted && mounted) setState(_restoreSaved);
    return accepted;
  }

  void _restoreSaved() {
    _populating = true;
    for (final item in _fields.entries) {
      item.value.text = '${_savedFields[item.key] ?? ''}';
    }
    _offline
      ..clear()
      ..addAll(
          (_savedFields['offlineMethods'] as List? ?? []).map((v) => '$v'));
    _previewLogo = _fields['logoUrl']!.text;
    _previewBanner = _fields['bannerUrl']!.text;
    _dirty = false;
    _populating = false;
  }

  Future<void> _back() async {
    if (_busy || !await _discard() || !mounted) return;
    setState(() => _dirty = false);
    if (GoRouter.of(context).canPop()) {
      context.pop();
    } else {
      context.go('/admin');
    }
  }

  Future<void> _refresh() async {
    if (_busy || !await _discard() || !mounted) return;
    await _load();
  }

  Future<void> _open(String route) async {
    if (_busy) return;
    if (route == '/admin/store-settings') {
      if (_scroll.hasClients) {
        _scroll.animateTo(0,
            duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
      }
      return;
    }
    if (!await _discard() || !mounted) return;
    setState(() => _dirty = false);
    context.push(route);
  }

  Future<void> _save() async {
    if (_busy || !_canEdit) return;
    if (_form.currentState?.validate() != true) {
      if (_scroll.hasClients) {
        _scroll.animateTo(0,
            duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
      }
      return;
    }
    FocusScope.of(context).unfocus();
    final payload = <String, dynamic>{
      'expectedVersion': _version,
      'offlineMethods': _offline.toList(),
      for (final item in _fields.entries) item.key: item.value.text.trim()
    };
    setState(() {
      _busy = true;
      _saveError = null;
    });
    try {
      final result = await _repo.saveProfile(payload);
      if (!mounted) return;
      setState(() {
        _version = (result['version'] as num?)?.toInt() ?? _version + 1;
        _dirty = false;
        _savedFields = Map<String, dynamic>.from(payload);
        _previewLogo = _fields['logoUrl']!.text.trim();
        _previewBanner = _fields['bannerUrl']!.text.trim();
      });
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content:
              Text('Perfil salvo. A vitrine usará a identidade atualizada.')));
      _loadReadiness();
    } catch (e) {
      if (mounted) {
        setState(() => _saveError =
            'Não foi possível salvar. Se o perfil mudou em outro dispositivo, atualize e confira os dados antes de repetir.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String? _validate(String key, String? raw) {
    final value = (raw ?? '').trim();
    if (key == 'displayName') {
      return value.length >= 2 ? null : 'Informe pelo menos dois caracteres.';
    }
    if (key.endsWith('Color')) {
      return RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(value)
          ? null
          : 'Use # seguido de seis dígitos de cor.';
    }
    if (value.isEmpty) return null;
    if (key.endsWith('Url')) {
      final uri = Uri.tryParse(value);
      return uri?.scheme == 'https' && uri?.hasAuthority == true
          ? null
          : 'Informe uma URL HTTPS válida.';
    }
    if (key == 'supportPhone') {
      return RegExp(r'^\d{10,15}$').hasMatch(value)
          ? null
          : 'Use de 10 a 15 números com DDD.';
    }
    if (key == 'supportEmail') {
      return RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(value)
          ? null
          : 'Informe um email válido.';
    }
    return null;
  }

  Widget _field(String key, {int lines = 1}) => Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: TextFormField(
          controller: _fields[key],
          enabled: _canEdit && !_busy,
          maxLength: _limits[key],
          maxLines: lines,
          keyboardType: key == 'supportPhone'
              ? TextInputType.phone
              : key == 'supportEmail'
                  ? TextInputType.emailAddress
                  : null,
          decoration: InputDecoration(labelText: _labels[key]),
          validator: (v) => _validate(key, v)));
  Widget _section(String title, List<Widget> children) => Card(
      child: Padding(
          padding: const EdgeInsets.all(18),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(title, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 16),
            ...children
          ])));
  Widget _identity() => _section('Identidade visual', [
        _field('displayName'),
        _field('tagline'),
        _field('description', lines: 3),
        _field('logoUrl'),
        _field('bannerUrl'),
        const Text(
            'Use fotos já hospedadas em HTTPS. A prévia permite conferir nome, cores e recorte antes de salvar.'),
        const SizedBox(height: 12),
        _field('primaryColor'),
        _field('secondaryColor'),
        Wrap(spacing: 8, runSpacing: 6, children: [
          for (final palette in const {
            'Verde': ['#145B55', '#E9BB76'],
            'Vinho': ['#7A2843', '#EAD6C7'],
            'Azul': ['#224D79', '#D9B88F'],
            'Neutro': ['#292A2D', '#D6B99A'],
          }.entries)
            OutlinedButton(
                onPressed: !_canEdit || _busy
                    ? null
                    : () {
                        _fields['primaryColor']!.text = palette.value[0];
                        _fields['secondaryColor']!.text = palette.value[1];
                      },
                child: Text(palette.key))
        ]),
        const SizedBox(height: 12),
        Text(
            _dirty
                ? 'Prévia local · salve para aplicar'
                : 'Prévia da identidade',
            style: const TextStyle(fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        StoreBrandPreview(
            name: _fields['displayName']!.text,
            tagline: _fields['tagline']!.text,
            logoUrl: _previewLogo,
            bannerUrl: _previewBanner,
            primary: storeHex(
                _fields['primaryColor']!.text, const Color(0xFF145B55)),
            secondary: storeHex(
                _fields['secondaryColor']!.text, const Color(0xFFE9BB76))),
        TextButton(
            onPressed: _busy
                ? null
                : () => setState(() {
                      _previewLogo =
                          _validate('logoUrl', _fields['logoUrl']!.text) == null
                              ? _fields['logoUrl']!.text.trim()
                              : '';
                      _previewBanner =
                          _validate('bannerUrl', _fields['bannerUrl']!.text) ==
                                  null
                              ? _fields['bannerUrl']!.text.trim()
                              : '';
                    }),
            child: const Text('Atualizar fotos da prévia')),
      ]);
  Widget _environment() {
    final demo = _store['isDemo'] == true;
    const environment = String.fromEnvironment('LOJA_ENVIRONMENT');
    return _section('Loja e ambiente', [
      Text(
          demo
              ? 'Demonstração · sem cobrança real'
              : _store['isDemo'] == false
                  ? 'Loja operacional · pagamentos conforme configuração'
                  : 'Modo indisponível · confira a versão do servidor',
          style: const TextStyle(fontWeight: FontWeight.w700)),
      const SizedBox(height: 8),
      Text('${_store['name']} · ${_store['slug']}'),
      if (environment.isNotEmpty) Text('Ambiente do APK: $environment'),
      SelectableText('UUID: ${_store['id']}',
          style: Theme.of(context).textTheme.bodySmall),
      const SizedBox(height: 10),
      OutlinedButton.icon(
          onPressed: () async {
            await Clipboard.setData(ClipboardData(text: '${_store['id']}'));
            if (mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('UUID da loja copiado.')));
            }
          },
          icon: const Icon(Icons.copy_outlined),
          label: const Text('Copiar UUID para configuração')),
      if (demo)
        const Text(
            'Produtos e pedidos desta loja são usados para apresentação. Não combine recebimentos reais nesta demonstração.'),
      if (!_canEdit)
        const Text(
            'Consulta da equipe. Somente proprietário ou gerente pode salvar alterações.'),
    ]);
  }

  @override
  void dispose() {
    _revision++;
    for (final c in _fields.values) {
      c.removeListener(_changed);
      c.dispose();
    }
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => PopScope(
      canPop: !_busy && !_dirty,
      onPopInvokedWithResult: (popped, result) async {
        if (popped || _busy) return;
        if (await _discard() && mounted) {
          setState(() => _dirty = false);
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) {
              if (GoRouter.of(context).canPop()) {
                context.pop();
              } else {
                context.go('/admin');
              }
            }
          });
        }
      },
      child: Scaffold(
        appBar: AppBar(
            leading: _busy
                ? const SizedBox.shrink()
                : IconButton(
                    tooltip: 'Voltar',
                    onPressed: _back,
                    icon: const Icon(Icons.arrow_back)),
            title: const Text('Identidade da loja'),
            actions: [
              IconButton(
                  tooltip: 'Atualizar perfil',
                  onPressed: _busy ? null : _refresh,
                  icon: const Icon(Icons.refresh))
            ]),
        bottomNavigationBar: _loading || _loadError != null || !_canEdit
            ? null
            : Material(
                color: Theme.of(context).colorScheme.surface,
                child: SafeArea(
                    top: false,
                    child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Column(
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              if (_saveError != null)
                                Padding(
                                    padding: const EdgeInsets.only(bottom: 8),
                                    child: Text(_saveError!,
                                        style: TextStyle(
                                            color: Theme.of(context)
                                                .colorScheme
                                                .error))),
                              FilledButton.icon(
                                  onPressed: _busy || !_dirty ? null : _save,
                                  icon: const Icon(Icons.save_outlined),
                                  label: Text(_busy
                                      ? 'Salvando…'
                                      : 'Salvar perfil da loja')),
                            ])))),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : _loadError != null
                ? Center(
                    child: Padding(
                        padding: const EdgeInsets.all(24),
                        child:
                            Column(mainAxisSize: MainAxisSize.min, children: [
                          Text(_loadError!),
                          TextButton(
                              onPressed: _load,
                              child: const Text('Tentar novamente')),
                        ])))
                : Form(
                    key: _form,
                    child: ListView(
                        controller: _scroll,
                        padding: const EdgeInsets.all(16),
                        children: [
                          Center(
                              child: ConstrainedBox(
                                  constraints:
                                      const BoxConstraints(maxWidth: 850),
                                  child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.stretch,
                                      children: [
                                        _environment(),
                                        const SizedBox(height: 14),
                                        _identity(),
                                        const SizedBox(height: 14),
                                        _section('Atendimento', [
                                          _field('supportEmail'),
                                          _field('supportPhone'),
                                          _field('instagramUrl')
                                        ]),
                                        const SizedBox(height: 14),
                                        _section('Pedidos e pagamento', [
                                          Text(_store['isDemo'] == true
                                              ? 'Modo demonstração usa somente pagamentos simulados. As opções abaixo não criam cobranças.'
                                              : _store['isDemo'] == false
                                                  ? 'Habilite somente as formas que a equipe consegue conferir. O pagamento combinado permanece pendente até confirmação.'
                                                  : 'Atualize o servidor para confirmar o modo desta loja antes de configurar pagamentos.'),
                                          for (final method in const {
                                            'PAY_ON_PICKUP':
                                                'Pagar na retirada',
                                            'MANUAL_PIX':
                                                'Pix combinado com a loja',
                                            'WHATSAPP': 'Combinar pelo WhatsApp'
                                          }.entries)
                                            SwitchListTile(
                                                contentPadding: EdgeInsets.zero,
                                                title: Text(method.value),
                                                value: _offline
                                                    .contains(method.key),
                                                onChanged: !_canEdit ||
                                                        _busy ||
                                                        _store['isDemo'] !=
                                                            false
                                                    ? null
                                                    : (on) => setState(() {
                                                          _dirty = true;
                                                          if (on) {
                                                            _offline.add(
                                                                method.key);
                                                          } else {
                                                            _offline.remove(
                                                                method.key);
                                                          }
                                                        })),
                                        ]),
                                        const SizedBox(height: 14),
                                        _section('Políticas da loja', [
                                          _field('privacyUrl'),
                                          _field('termsUrl'),
                                          _field('returnsUrl')
                                        ]),
                                        if (_canEdit) ...[
                                          const SizedBox(height: 14),
                                          if (_preparing)
                                            const Padding(
                                                padding: EdgeInsets.all(20),
                                                child: Center(
                                                    child:
                                                        CircularProgressIndicator()))
                                          else if (_preparationError)
                                            Card(
                                                child: Padding(
                                                    padding:
                                                        const EdgeInsets.all(
                                                            18),
                                                    child: Column(children: [
                                                      const Text(
                                                          'Não foi possível consultar a preparação.'),
                                                      TextButton(
                                                          onPressed:
                                                              _loadReadiness,
                                                          child: const Text(
                                                              'Consultar novamente')),
                                                    ])))
                                          else if (_readiness != null)
                                            StorePreparationCard(
                                                data: _readiness!,
                                                onOpen: _open),
                                        ],
                                      ])))
                        ])),
      ));
}
