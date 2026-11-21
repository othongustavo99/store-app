import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../core/network/loja_api.dart';
import '../../../data/repositories/railway_integrations_repository.dart';
import '../../../router/app_back_button.dart';

/// Central de Integrações — monitoramento do Store App, restrito ao proprietário.
/// Os relatórios de conciliação dos conectores ainda são executados no servidor
/// do conector. Esta tela mostra somente dados fornecidos pelas APIs administrativas.
class RailwayIntegrationsScreen extends StatefulWidget {
  const RailwayIntegrationsScreen({super.key, this.repository});

  final RailwayIntegrationsRepository? repository;

  @override
  State<RailwayIntegrationsScreen> createState() =>
      _RailwayIntegrationsScreenState();
}

class _RailwayIntegrationsScreenState extends State<RailwayIntegrationsScreen> {
  late final RailwayIntegrationsRepository _repo =
      widget.repository ?? RailwayIntegrationsRepository();
  late Future<List<Map<String, dynamic>>> _data;
  final Map<String, Future<Map<String, dynamic>>> _details = {};
  final Map<String, Future<Map<String, dynamic>>> _health = {};
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _reloadData();
  }

  Future<List<Map<String, dynamic>>> _fetch() async {
    if (!await _repo.isOwner()) throw const _NotOwner();
    return _repo.list();
  }

  void _reloadData() {
    _details.clear();
    _health.clear();
    _data = _fetch();
  }

  Future<void> _refresh() async {
    setState(_reloadData);
    try {
      await _data;
    } catch (_) {
      // Erro apresentado na tela; não registrar credenciais ou dados privados.
    }
  }

  void _message(String text) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  Future<bool> _confirm(String title, String message, String action) async {
    return await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 480),
          child: Text(message),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Voltar')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true),
              child: Text(action)),
        ],
      ),
    ) ?? false;
  }

  Future<void> _retry(Map<String, dynamic> integration,
      Map<String, dynamic> failure) async {
    final name = '${integration['name'] ?? 'Integração'}';
    final eventId = '${failure['eventId'] ?? ''}';
    if (failure['type'] == 'order.changed' ||
        failure['type'] == 'EXTERNAL_ORDER_SYNCED') {
      _message('Pedidos exigem conciliação no ERP antes de reprocessar.');
      return;
    }
    if (!RegExp(r'^[1-9][0-9]{0,17}$').hasMatch(eventId)) return;
    final yes = await _confirm('Reprocessar evento $eventId?',
        'Integração: $name. Reenviar eventos pode repetir operações no ERP '
        'caso a causa da falha não tenha sido resolvida. Confirme antes '
        'que a operação original não ficou incerta no destino.',
        'Colocar na fila');
    if (!yes || !mounted) return;
    setState(() => _busy = true);
    try {
      await _repo.retryEvent('${integration['id']}', eventId);
      _message('Evento recolocado na fila.');
      await _refresh();
    } catch (e) {
      _message('Não foi possível reprocessar: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Diagnóstico informativo: nunca dispara o worker ou envios ao ERP.
  Future<void> _diagnose(Map<String, dynamic> integration) async {
    setState(() => _busy = true);
    try {
      final report = await _repo.readiness('${integration['id']}');
      if (!mounted) return;
      final checks = (report['checks'] as List? ?? const [])
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e)).toList();
      final passed = report['status'] == 'CHECKLIST_OK';
      await showDialog<void>(context: context, builder: (ctx) => AlertDialog(
        title: const Text('Diagnóstico de implantação'),
        content: SizedBox(width: 510, child: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(passed ? 'Checklist técnico atendido' :
                  'Existem pendências para exportação de pedidos',
                  style: Theme.of(ctx).textTheme.titleMedium),
              const SizedBox(height: 8),
              const Text('Este resultado NÃO significa integração homologada. '
                  'Os testes reais com o ERP e a conferência fiscal ainda são obrigatórios.'),
              const SizedBox(height: 12),
              for (final item in checks) ListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                leading: Icon(item['ok'] == true
                    ? Icons.check_circle_outline : Icons.error_outline,
                    color: item['ok'] == true ? Colors.green : Colors.orange),
                title: Text('${item['code'] ?? ''}'),
                subtitle: Text('${item['detail'] ?? ''}'),
              ),
            ],
          ),
        )),
        actions: [TextButton(
          onPressed: () => Navigator.pop(ctx),
          child: const Text('Fechar'),
        )],
      ));
    } catch (_) {
      _message('Não foi possível consultar o diagnóstico desta integração.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Checklist operacional manual; não instala ou habilita o conector.
  Future<void> _configureDeployment(Map<String, dynamic> integration) async {
    setState(() => _busy = true);
    try {
      final profile = await _repo.deployment('${integration['id']}');
      if (!mounted) return;
      var environment = '${profile['environment'] ?? 'HOMOLOGATION'}';
      final rawChecks = profile['checks'];
      final existing = rawChecks is Map
          ? Map<String, dynamic>.from(rawChecks) : <String, dynamic>{};
      final checks = <String, bool>{
        'credentialsSecured': existing['credentialsSecured'] == true,
        'providerAccessChecked': existing['providerAccessChecked'] == true,
        'catalogChecked': existing['catalogChecked'] == true,
        'ordersChecked': existing['ordersChecked'] == true,
        'reconciliationChecked': existing['reconciliationChecked'] == true,
      };
      final alias = TextEditingController(text: '${profile['workerAlias'] ?? ''}');
      Map<String, dynamic>? edited;
      try {
        edited = await showDialog<Map<String, dynamic>>(
          context: context,
          builder: (dialogContext) => StatefulBuilder(
            builder: (dialogContext, update) => AlertDialog(
              title: const Text('Implantação do conector'),
              content: SizedBox(width: 520, child: SingleChildScrollView(
                child: Column(mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Text('Registro administrativo da instalação. '
                        'Não digite senhas, tokens ou dados pessoais. '
                        'Marcar os itens não ativa vendas automáticas '
                        'nem comprova homologação.'),
                    const SizedBox(height: 16),
                    DropdownButtonFormField<String>(
                      initialValue: environment,
                      decoration: const InputDecoration(
                        labelText: 'Ambiente do conector',
                        border: OutlineInputBorder()),
                      items: const [
                        DropdownMenuItem(value: 'HOMOLOGATION',
                            child: Text('Homologação')),
                        DropdownMenuItem(value: 'PRODUCTION',
                            child: Text('Produção (registro apenas)')),
                      ],
                      onChanged: (value) => update(() =>
                          environment = value ?? 'HOMOLOGATION'),
                    ),
                    const SizedBox(height: 12),
                    TextField(controller: alias, maxLength: 48,
                      decoration: const InputDecoration(
                        border: OutlineInputBorder(),
                        labelText: 'Identificador do worker (opcional)',
                        helperText: '3 a 48 caracteres minúsculos, números e hífens'),
                    ),
                    const Text('Conferências realizadas pelo responsável:',
                      style: TextStyle(fontWeight: FontWeight.w600)),
                    for (final entry in const <(String, String)>[
                      ('credentialsSecured', 'Credenciais protegidas fora do app'),
                      ('providerAccessChecked', 'Acesso ao fornecedor verificado'),
                      ('catalogChecked', 'Produtos e estoque conferidos'),
                      ('ordersChecked', 'Fluxo de pedidos conferido'),
                      ('reconciliationChecked', 'Reconciliação e falhas conferidas'),
                    ]) CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(entry.$2),
                      value: checks[entry.$1] ?? false,
                      onChanged: (value) => update(() =>
                          checks[entry.$1] = value ?? false),
                    ),
                  ],
                ),
              )),
              actions: [
                TextButton(onPressed: () => Navigator.pop(dialogContext),
                    child: const Text('Cancelar')),
                FilledButton(onPressed: () {
                  final value = alias.text.trim();
                  if (value.isNotEmpty &&
                      !RegExp(r'^[a-z0-9][a-z0-9-]{2,47}$').hasMatch(value)) {
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                      content: Text('Identificador inválido: use letras minúsculas, números e hífens.')));
                    return;
                  }
                  Navigator.pop(dialogContext, {
                    'environment': environment,
                    'workerAlias': value.isEmpty ? null : value,
                    'checks': Map<String, bool>.from(checks),
                  });
                }, child: const Text('Salvar checklist')),
              ],
            ),
          ),
        );
      } finally {
        alias.dispose();
      }
      if (edited == null || !mounted) return;
      await _repo.saveDeployment('${integration['id']}',
        expectedRevision: (profile['revision'] as num?)?.toInt() ?? 0,
        environment: '${edited['environment']}',
        workerAlias: edited['workerAlias'] as String?,
        checks: Map<String, bool>.from(edited['checks'] as Map),
      );
      _message('Checklist de implantação salvo. Não ativa a integração.');
      await _refresh();
    } catch (_) {
      _message('Falha ao salvar implantação. Reabra e confira se outra edição foi salva.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _revoke(Map<String, dynamic> integration) async {
    final name = '${integration['name']}';
    final yes = await _confirm('Revogar integração?',
        'A integração "$name" perderá acesso à API imediatamente. '
        'Isso pode interromper sincronizações. A credencial não será recuperável.',
        'Revogar acesso');
    if (!yes || !mounted) return;
    setState(() => _busy = true);
    try {
      await _repo.revoke('${integration['id']}');
      _message('Integração revogada.');
      await _refresh();
    } catch (e) {
      _message('Falha ao revogar: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _create() async {
    final nameController = TextEditingController();
    var provider = 'generic';
    var catalog = false;
    var stock = false;
    var orders = false;
    var customer = false;
    Map<String, dynamic>? form;
    try {
      form = await showDialog<Map<String, dynamic>>(
        context: context,
        builder: (ctx) => StatefulBuilder(builder: (ctx, update) => AlertDialog(
          title: const Text('Nova integração'),
          content: SizedBox(
            width: 480,
            child: SingleChildScrollView(child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Crie a credencial somente quando houver um '
                    'conector configurado para esta loja. A conexão não '
                    'começa automaticamente.'),
                const SizedBox(height: 16),
                TextField(
                  controller: nameController,
                  maxLength: 100,
                  decoration: const InputDecoration(
                    labelText: 'Nome da integração',
                    hintText: 'Ex.: ERP da loja',
                    border: OutlineInputBorder(),
                  ),
                ),
                DropdownButtonFormField<String>(
                  initialValue: provider,
                  decoration: const InputDecoration(
                    labelText: 'Fornecedor', border: OutlineInputBorder()),
                  items: const [
                    DropdownMenuItem(value: 'generic', child: Text('Outro / genérico')),
                    DropdownMenuItem(value: 'omie', child: Text('Omie')),
                    DropdownMenuItem(value: 'bling', child: Text('Bling')),
                    DropdownMenuItem(value: 'olist', child: Text('Olist / Tiny')),
                  ],
                  onChanged: (v) => update(() => provider = v ?? 'generic'),
                ),
                const SizedBox(height: 12),
                const Text('Permissões de escrita (desligadas por padrão):'),
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Controlar produtos e preços'),
                  value: catalog,
                  onChanged: (v) => update(() => catalog = v ?? false),
                ),
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Controlar estoque'),
                  value: stock,
                  onChanged: (v) => update(() => stock = v ?? false),
                ),
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Atualizar vínculo de pedidos'),
                  value: orders,
                  onChanged: (v) => update(() => orders = v ?? false),
                ),
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Permitir dados pessoais do comprador'),
                  subtitle: const Text('Somente quando necessários ao ERP.'),
                  value: customer,
                  onChanged: (v) => update(() => customer = v ?? false),
                ),
                const Text('Uma única integração por loja pode ser '
                    'responsável por cada categoria de escrita.'),
              ],
            )),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx),
                child: const Text('Cancelar')),
            FilledButton(onPressed: () {
              final name = nameController.text.trim();
              if (name.length < 3 || name.length > 100) return;
              Navigator.pop(ctx, {
                'name': name,
                'provider': provider,
                'catalogAuthority': catalog,
                'stockAuthority': stock,
                'orderAuthority': orders,
                'customerDataAccess': customer,
              });
            }, child: const Text('Criar credencial')),
          ],
        )),
      );
    } finally {
      nameController.dispose();
    }
    if (form == null || !mounted) return;
    final proceed = await _confirm('Confirmar permissões?',
        'A integração terá acesso de leitura a catálogo, pedidos e eventos. '
        'As permissões adicionais escolhidas serão concedidas imediatamente. '
        'A chave será exibida uma única vez.', 'Confirmar criação');
    if (!proceed || !mounted) return;
    setState(() => _busy = true);
    try {
      final created = await _repo.create(
        name: '${form['name']}',
        provider: '${form['provider']}',
        catalogAuthority: form['catalogAuthority'] == true,
        stockAuthority: form['stockAuthority'] == true,
        orderAuthority: form['orderAuthority'] == true,
        customerDataAccess: form['customerDataAccess'] == true,
      );
      if (!mounted) return;
      final token = '${created['token'] ?? ''}';
      await showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (ctx) => AlertDialog(
          title: const Text('Chave criada — guarde agora'),
          content: SizedBox(
            width: 480,
            child: Column(mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Esta chave dá acesso à loja conforme as permissões. '
                    'Será exibida somente agora. Armazene no ambiente privado '
                    'do conector, nunca no código nem em screenshots.'),
                const SizedBox(height: 14),
                SelectableText(token),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: () async {
                    await Clipboard.setData(ClipboardData(text: token));
                    if (ctx.mounted) {
                      ScaffoldMessenger.of(ctx).showSnackBar(
                          const SnackBar(content: Text('Chave copiada.')));
                    }
                  },
                  icon: const Icon(Icons.copy_outlined),
                  label: const Text('Copiar chave'),
                ),
                const SizedBox(height: 6),
                const Text('A área de transferência também pode ser lida '
                    'por outros aplicativos no dispositivo.'),
              ],
            ),
          ),
          actions: [
            FilledButton(onPressed: () => Navigator.pop(ctx),
                child: const Text('Já guardei a chave')),
          ],
        ),
      );
      await _refresh();
    } catch (e) {
      _message('Falha ao criar integração: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      leading: const AppBackButton(fallbackLocation: '/admin'),
      title: const Text('Central de Integrações'),
      actions: [
        IconButton(
          tooltip: 'Atualizar',
          onPressed: _busy ? null : _refresh,
          icon: const Icon(Icons.refresh_rounded),
        ),
      ],
    ),
    body: FutureBuilder<List<Map<String, dynamic>>>(
      future: _data,
      builder: (ctx, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          final error = snapshot.error;
          final forbidden = error is _NotOwner ||
              error is LojaApiException && error.status == 403;
          final disabled = error is LojaApiException && error.status == 503;
          return _InformationState(
            icon: forbidden ? Icons.lock_outline : Icons.cloud_off_outlined,
            title: forbidden ? 'Acesso exclusivo do proprietário'
                : disabled ? 'Integrações desativadas no backend'
                : 'Falha ao carregar integrações',
            message: forbidden ? 'Entre com a conta proprietária da loja.'
                : disabled ? 'Ative apenas após validar as migrations e '
                    'o ambiente de homologação.'
                : 'Verifique a conexão com o backend e tente novamente.',
            onRetry: _refresh,
          );
        }
        final integrations = snapshot.data ?? const <Map<String, dynamic>>[];
        final active = integrations.where((i) => i['revokedAt'] == null).length;
        return RefreshIndicator(
          onRefresh: _refresh,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 20, 16, 36),
            children: [
              Center(child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 1000),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Conexões comerciais',
                        style: Theme.of(context).textTheme.headlineSmall),
                    const SizedBox(height: 5),
                    const Text('Acompanhe os acessos, a fila e o último '
                        'ciclo dos conectores. Um relatório recente do '
                        'worker não comprova que o ERP esteja disponível.'),
                    const SizedBox(height: 18),
                    Wrap(spacing: 12, runSpacing: 12,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Chip(avatar: const Icon(Icons.link_rounded, size: 18),
                            label: Text('$active ativa(s)')),
                        Chip(avatar: const Icon(Icons.layers_outlined, size: 18),
                            label: Text('${integrations.length} cadastrada(s)')),
                        FilledButton.icon(
                          onPressed: _busy ? null : _create,
                          icon: const Icon(Icons.add_link_rounded),
                          label: const Text('Nova integração'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 18),
                    if (integrations.isEmpty)
                      const Card(child: Padding(
                        padding: EdgeInsets.all(28),
                        child: Text('Nenhum ERP/PDV conectado. Você pode '
                            'cadastrar uma credencial quando preparar o '
                            'primeiro cliente.'),
                      )),
                    for (final integration in integrations)
                      _integrationCard(context, integration),
                    const SizedBox(height: 16),
                    const Text('O modo POLL é legado; seus contadores de '
                        'fila não representam o processamento total. '
                        'Ações de reenvio existem apenas para eventos '
                        'marcados como DEAD no modo LEASED.'),
                  ],
                ),
              )),
            ],
          ),
        );
      },
    ),
  );

  Widget _integrationCard(BuildContext context, Map<String, dynamic> item) {
    final id = '${item['id']}';
    final revoked = item['revokedAt'] != null;
    final mode = '${item['deliveryMode'] ?? 'POLL'}';
    final scopes = (item['scopes'] as List? ?? const [])
        .map((value) => value.toString()).toList();
    return Card(
      margin: const EdgeInsets.only(bottom: 14),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Wrap(spacing: 12, runSpacing: 10,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Icon(revoked ? Icons.link_off_rounded : Icons.hub_outlined),
              Text('${item['name'] ?? 'Integração'}',
                  style: Theme.of(context).textTheme.titleMedium),
              Chip(label: Text(_providerLabel('${item['provider']}'))),
              Chip(label: Text(revoked ? 'Revogada' : 'Ativa')),
              Chip(label: Text('Entrega: $mode')),
            ],
          ),
          const SizedBox(height: 8),
          Text('Identificador da chave: ${item['tokenPrefix'] ?? '—'}'),
          const SizedBox(height: 4),
          Text('Permissões: ${scopes.isEmpty ? 'nenhuma' : scopes.join(', ')}',
              style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 12),
          if (!revoked) ...[
            FutureBuilder<Map<String, dynamic>>(
              future: _health.putIfAbsent(id, () => _repo.health(id)),
              builder: (context, snapshot) {
                if (snapshot.hasError) {
                  return const Text('Não foi possível consultar o último ciclo do conector.');
                }
                if (!snapshot.hasData) return const LinearProgressIndicator();
                return _healthDetails(snapshot.data!);
              },
            ),
            const SizedBox(height: 12),
            if (mode == 'LEASED')
              FutureBuilder<Map<String, dynamic>>(
                future: _details.putIfAbsent(id, () => _repo.delivery(id)),
                builder: (context, snapshot) {
                  if (!snapshot.hasData) {
                    return snapshot.hasError
                        ? Row(children: [
                            const Expanded(child: Text('Não foi possível consultar a fila.')),
                            TextButton(onPressed: _busy ? null : () {
                              setState(() => _details.remove(id));
                            }, child: const Text('Tentar novamente')),
                          ])
                        : const LinearProgressIndicator();
                  }
                  return _deliveryDetails(item, snapshot.data!);
                },
              )
            else
              const Text('Modo de consulta antigo: sem diagnóstico '
                  'detalhado de eventos em fila.'),
          ],
          if (!revoked) ...[
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerRight,
              child: Wrap(spacing: 8, runSpacing: 8, children: [
                OutlinedButton.icon(
                  onPressed: _busy ? null : () => _diagnose(item),
                  icon: const Icon(Icons.fact_check_outlined),
                  label: const Text('Diagnóstico de implantação'),
                ),
                OutlinedButton.icon(
                  onPressed: _busy ? null : () => _configureDeployment(item),
                  icon: const Icon(Icons.settings_outlined),
                  label: const Text('Implantação'),
                ),
                OutlinedButton.icon(
                  onPressed: _busy ? null : () => _revoke(item),
                  icon: const Icon(Icons.link_off_rounded),
                  label: const Text('Revogar'),
                ),
              ]),
            ),
          ],
        ]),
      ),
    );
  }

  Widget _healthDetails(Map<String, dynamic> info) {
    final status = '${info['status'] ?? 'NO_REPORT'}';
    final details = switch (status) {
      'REPORTING' => ('Relatório recente', Icons.check_circle_outline),
      'ATTENTION' => ('Último ciclo com alerta', Icons.warning_amber_rounded),
      'STALE' => ('Sem relatório recente', Icons.schedule_rounded),
      'REVOKED' => ('Credencial revogada', Icons.link_off_rounded),
      _ => ('Sem relatório de execução', Icons.help_outline_rounded),
    };
    final raw = info['lastSummary'];
    final summary = raw is Map ? Map<String, dynamic>.from(raw) : <String, dynamic>{};
    final last = DateTime.tryParse('${info['lastReportAt'] ?? ''}');
    final stamp = last == null ? 'Nunca' : last.toLocal().toString().split('.').first;
    final result = '${info['lastResult'] ?? '—'}';
    final errorCode = info['lastErrorCode']?.toString();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('Processo de pedidos', style: TextStyle(fontWeight: FontWeight.w600)),
      const SizedBox(height: 5),
      Wrap(spacing: 8, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          Chip(avatar: Icon(details.$2, size: 18), label: Text(details.$1)),
          if (status != 'NO_REPORT') Chip(label: Text('Último resultado: $result')),
        ],
      ),
      Text('Último ciclo recebido: $stamp', style: Theme.of(context).textTheme.bodySmall),
      if (errorCode != null && errorCode.isNotEmpty)
        Text('Código de ocorrência: $errorCode', style: Theme.of(context).textTheme.bodySmall),
      if (summary.isNotEmpty) ...[
        const SizedBox(height: 5),
        Text('Último lote: ${summary['claimed'] ?? 0} evento(s) · '
             '${summary['acknowledged'] ?? 0} confirmado(s) · '
             '${summary['review'] ?? 0} revisão(ões) · '
             '${summary['retry'] ?? 0} nova(s) tentativa(s)',
             style: Theme.of(context).textTheme.bodySmall),
      ],
      const SizedBox(height: 4),
      Text('Este indicador informa o último ciclo do worker, não a '
          'conectividade ou a homologação do ERP.',
          style: Theme.of(context).textTheme.bodySmall),
    ]);
  }

  Widget _deliveryDetails(Map<String, dynamic> integration,
      Map<String, dynamic> details) {
    final raw = details['counts'];
    final counts = raw is Map ? Map<String, dynamic>.from(raw) : <String, dynamic>{};
    final failures = (details['recentFailures'] as List? ?? const [])
        .whereType<Map>()
        .map((entry) => Map<String, dynamic>.from(entry))
        .toList();
    int count(String key) => int.tryParse('${counts[key] ?? 0}') ?? 0;
    final waiting = int.tryParse('${details['unmaterializedEvents'] ?? 0}') ?? 0;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Wrap(spacing: 8, runSpacing: 8, children: [
        Chip(label: Text('Ainda não enfileirados: $waiting')),
        Chip(label: Text('Pendentes: ${count('PENDING')}')),
        Chip(label: Text('Em execução: ${count('IN_FLIGHT')}')),
        Chip(label: Text('Concluídos: ${count('ACKED')}')),
        Chip(label: Text('Falhas definitivas: ${count('DEAD')}')),
      ]),
      if (failures.isNotEmpty) ...[
        const SizedBox(height: 12),
        Text('Ocorrências recentes',
            style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 4),
        for (final failure in failures) ...[
          const Divider(height: 1),
          ListTile(
            contentPadding: EdgeInsets.zero,
            dense: true,
            title: Text('Evento ${failure['eventId']} · ${failure['type']}'),
            subtitle: Text('Situação: ${failure['status']} · '
                'Tentativas: ${failure['attempts']} · '
                'Código: ${failure['lastErrorCode'] ?? '—'}'),
            trailing: failure['status'] == 'DEAD' &&
                failure['type'] != 'order.changed' &&
                failure['type'] != 'EXTERNAL_ORDER_SYNCED'
                ? TextButton(
                    onPressed: _busy ? null : () => _retry(integration, failure),
                    child: const Text('Reprocessar'))
                : failure['status'] == 'DEAD'
                    ? const Text('Revisão manual') : null,
          ),
        ],
      ],
    ]);
  }

  String _providerLabel(String provider) {
    switch (provider) {
      case 'omie': return 'Omie';
      case 'bling': return 'Bling';
      case 'olist': return 'Olist / Tiny';
      default: return provider == 'generic' ? 'Outro ERP' : provider;
    }
  }
}

class _NotOwner implements Exception {
  const _NotOwner();
}

class _InformationState extends StatelessWidget {
  const _InformationState({
    required this.icon,
    required this.title,
    required this.message,
    required this.onRetry,
  });

  final IconData icon;
  final String title;
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 48),
        const SizedBox(height: 14),
        Text(title, style: Theme.of(context).textTheme.titleLarge,
            textAlign: TextAlign.center),
        const SizedBox(height: 8),
        Text(message, textAlign: TextAlign.center),
        const SizedBox(height: 14),
        OutlinedButton(onPressed: onRetry, child: const Text('Tentar novamente')),
      ]),
    ),
  );
}
