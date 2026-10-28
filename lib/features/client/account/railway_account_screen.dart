import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/loja_api.dart';
import '../../../models/saved_address.dart';
import '../../../providers/address_providers.dart';
import '../../../providers/auth_providers.dart';

/// Dados do cliente ficam na API autenticada; nenhuma senha é salva neste widget.
class RailwayAccountScreen extends ConsumerStatefulWidget {
  const RailwayAccountScreen({super.key});

  @override
  ConsumerState<RailwayAccountScreen> createState() => _RailwayAccountScreenState();
}

class _RailwayAccountScreenState extends ConsumerState<RailwayAccountScreen> {
  bool _busy = false;

  Future<void> _perform(Future<void> Function() action, String message) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
    } on LojaApiException catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Não foi possível salvar. Tente novamente.')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _editName() async {
    final controller = TextEditingController(text: ref.read(authProvider).name);
    final key = GlobalKey<FormState>();
    try {
      final value = await showDialog<String>(context: context, builder: (dialogContext) => AlertDialog(
        title: const Text('Editar nome'),
        content: Form(key: key, child: TextFormField(
          controller: controller,
          autofocus: true,
          textCapitalization: TextCapitalization.words,
          maxLength: 100,
          decoration: const InputDecoration(labelText: 'Nome de exibição'),
          validator: (v) => (v?.trim().length ?? 0) < 2 ? 'Informe pelo menos 2 caracteres.' : null,
        )),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancelar')),
          FilledButton(onPressed: () {
            if (key.currentState!.validate()) Navigator.pop(dialogContext, controller.text.trim());
          }, child: const Text('Salvar')),
        ],
      ));
      if (!mounted || value == null) return;
      await _perform(() => ref.read(authProvider.notifier).updateRailwayName(value),
          'Nome atualizado na sua conta.');
    } finally { controller.dispose(); }
  }

  Future<void> _changePassword() async {
    final old = TextEditingController();
    final fresh = TextEditingController();
    final confirm = TextEditingController();
    final key = GlobalKey<FormState>();
    try {
      final changed = await showDialog<bool>(context: context, builder: (dialogContext) => AlertDialog(
        title: const Text('Alterar senha'),
        content: SizedBox(width: 390, child: Form(key: key, child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextFormField(controller: old, obscureText: true,
              decoration: const InputDecoration(labelText: 'Senha atual'),
              validator: (v) => (v?.isEmpty ?? true) ? 'Informe sua senha atual.' : null),
            const SizedBox(height: 12),
            TextFormField(controller: fresh, obscureText: true,
              decoration: const InputDecoration(labelText: 'Nova senha (12 caracteres ou mais)'),
              validator: (v) => (v?.length ?? 0) < 12 ? 'Use pelo menos 12 caracteres.' : null),
            const SizedBox(height: 12),
            TextFormField(controller: confirm, obscureText: true,
              decoration: const InputDecoration(labelText: 'Confirme a nova senha'),
              validator: (v) => v != fresh.text ? 'As senhas são diferentes.' : null),
          ],
        ))),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancelar')),
          FilledButton(onPressed: () {
            if (key.currentState!.validate()) Navigator.pop(dialogContext, true);
          }, child: const Text('Confirmar')),
        ],
      ));
      if (!mounted || changed != true) return;
      await _perform(() => ref.read(authProvider.notifier)
          .changeRailwayPassword(old.text, fresh.text),
          'Senha alterada. Outras sessões foram encerradas.');
    } finally { old.dispose(); fresh.dispose(); confirm.dispose(); }
  }

  Future<void> _editAddress([SavedAddress? existing]) async {
    final input = await showDialog<SavedAddress>(
      context: context,
      builder: (context) => _AddressEditor(address: existing),
    );
    if (!mounted || input == null) return;
    await _perform(() async {
      if (existing == null) {
        await ref.read(addressesProvider.notifier).addAddress(input);
      } else {
        await ref.read(addressesProvider.notifier).updateAddress(input);
      }
    }, 'Endereço salvo na sua conta.');
  }

  Future<void> _removeAddress(SavedAddress address) async {
    final yes = await showDialog<bool>(context: context, builder: (dialogContext) => AlertDialog(
      title: const Text('Excluir endereço?'),
      content: Text('Deseja remover o endereço “${address.label}” da sua conta?'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancelar')),
        FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Excluir')),
      ],
    ));
    if (yes != true || !mounted) return;
    await _perform(() => ref.read(addressesProvider.notifier).removeAddress(address.id),
        'Endereço removido.');
  }

  Future<void> _requestDeletion() async {
    final formKey = GlobalKey<FormState>();
    final password = TextEditingController();
    try {
      final confirmed = await showDialog<bool>(context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Excluir minha conta'),
          content: SizedBox(width: 390, child: Form(key: formKey,
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Text('A exclusão é irreversível. Seus dados de perfil e endereços serão removidos. '
                'Registros de pedidos necessários para obrigações legais poderão ser mantidos. '
                'Se houver pedidos em andamento ou vínculos administrativos, a solicitação ficará pendente.'),
              const SizedBox(height: 16),
              TextFormField(controller: password, obscureText: true,
                autofillHints: const [AutofillHints.password],
                decoration: const InputDecoration(labelText: 'Confirme sua senha'),
                validator: (text) => (text?.isNotEmpty ?? false) ? null : 'Informe sua senha.'),
            ]))),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext,false),
              child: const Text('Manter conta')),
            FilledButton(onPressed: () {
              if(formKey.currentState!.validate()) Navigator.pop(dialogContext,true);
            }, child: const Text('Solicitar exclusão')),
          ],
        ));
      if(confirmed!=true || !mounted) return;
      setState(() => _busy = true);
      try {
        final response = await LojaApi.instance.request('POST','/v1/me/deletion',
          body: {'password':password.text}, authenticated:true);
        if(!mounted) return;
        final complete = response['status']=='COMPLETED';
        final message = response['message']?.toString() ?? 'Solicitação registrada.';
        if(complete) {
          await ref.read(authProvider.notifier).logout();
          if(mounted) context.go('/login');
        }
        if(mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(message), duration: const Duration(seconds: 8)));
      } on LojaApiException catch(e) {
        if(mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      } finally { if(mounted) setState(() => _busy = false); }
    } finally { password.dispose(); }
  }

  Future<void> _logout() async {
    final yes = await showDialog<bool>(context: context, builder: (dialogContext) => AlertDialog(
      title: const Text('Sair da conta?'),
      content: const Text('Você poderá entrar novamente com seu e-mail e senha.'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancelar')),
        FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Sair')),
      ],
    ));
    if (yes != true || !mounted) return;
    await ref.read(authProvider.notifier).logout();
    if (mounted) context.go('/login');
  }

  @override
  Widget build(BuildContext context) {
    final account = ref.watch(authProvider);
    final addresses = ref.watch(addressesProvider);
    final textTheme = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Minha conta')),
      body: Center(child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 760),
        child: ListView(padding: const EdgeInsets.fromLTRB(16, 16, 16, 32), children: [
          Card(child: Padding(padding: const EdgeInsets.all(18), child: Row(children: [
            CircleAvatar(radius: 28, child: Text(
              (account.name.isNotEmpty ? account.name.substring(0, 1) : 'C').toUpperCase(),
              style: textTheme.headlineSmall)),
            const SizedBox(width: 16),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(account.name.isEmpty ? 'Cliente' : account.name,
                  style: textTheme.titleLarge, maxLines: 2, overflow: TextOverflow.ellipsis),
              Text(account.email ?? '', style: textTheme.bodyMedium,
                  maxLines: 2, overflow: TextOverflow.ellipsis),
            ])),
            IconButton(tooltip: 'Editar nome', onPressed: _busy ? null : _editName,
                icon: const Icon(Icons.edit_outlined)),
          ]))),
          const SizedBox(height: 16),
          Text('Seu atendimento e suas compras', style: textTheme.titleMedium),
          const SizedBox(height: 8),
          Card(child: Column(children: [
            ListTile(leading: const Icon(Icons.receipt_long_outlined), title: const Text('Meus pedidos'),
              subtitle: const Text('Acompanhe pagamentos, entregas e devoluções'),
              trailing: const Icon(Icons.chevron_right), onTap: () => context.push('/orders')),
            const Divider(height: 1),
            ListTile(leading: const Icon(Icons.support_agent_outlined), title: const Text('Atendimento'),
              subtitle: const Text('Converse com a loja'),
              trailing: const Icon(Icons.chevron_right), onTap: () => context.push('/support')),
          ])),
          const SizedBox(height: 20),
          Row(children: [
            Expanded(child: Text('Endereços salvos', style: textTheme.titleMedium)),
            TextButton.icon(onPressed: _busy ? null : () => _editAddress(),
              icon: const Icon(Icons.add), label: const Text('Adicionar')),
          ]),
          const SizedBox(height: 8),
          addresses.when(
            loading: () => const Card(child: Padding(padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator()))),
            error: (error, stack) => Card(child: ListTile(
              title: const Text('Não foi possível carregar os endereços.'),
              subtitle: const Text('Verifique a conexão e tente novamente.'),
              trailing: IconButton(tooltip: 'Tentar novamente',
                onPressed: () => ref.read(addressesProvider.notifier).load(),
                icon: const Icon(Icons.refresh)))),
            data: (items) => items.isEmpty
                ? const Card(child: Padding(padding: EdgeInsets.all(20),
                    child: Text('Nenhum endereço cadastrado. Salve um para usar em novas compras.')))
                : Column(children: items.map((address) => Card(child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6), child: Column(children: [
                    ListTile(leading: Icon(address.isPrimary ? Icons.home : Icons.place_outlined),
                      title: Text(address.isPrimary ? '${address.label} • Principal' : address.label),
                      subtitle: Text(address.formattedAddress), isThreeLine: true),
                    Wrap(spacing: 6, children: [
                      if (!address.isPrimary)
                        TextButton(onPressed: _busy ? null : () => _perform(
                          () => ref.read(addressesProvider.notifier).setPrimary(address.id),
                          'Endereço principal atualizado.'),
                          child: const Text('Definir principal')),
                      TextButton(onPressed: _busy ? null : () => _editAddress(address),
                          child: const Text('Editar')),
                      TextButton(onPressed: _busy ? null : () => _removeAddress(address),
                          child: const Text('Excluir')),
                    ]),
                  ])))).toList()),
          ),
          const SizedBox(height: 20),
          Text('Segurança', style: textTheme.titleMedium),
          const SizedBox(height: 8),
          Card(child: Column(children: [
            ListTile(leading: const Icon(Icons.lock_outline), title: const Text('Alterar senha'),
              subtitle: const Text('Encerra as outras sessões conectadas'),
              trailing: const Icon(Icons.chevron_right),
              onTap: _busy ? null : _changePassword),
            const Divider(height: 1),
            ListTile(leading: const Icon(Icons.logout), title: const Text('Sair da conta'),
              onTap: _busy ? null : _logout),
            const Divider(height: 1),
            ListTile(leading: const Icon(Icons.person_remove_outlined),
              title: const Text('Excluir minha conta'),
              subtitle: const Text('Solicite a remoção dos seus dados pessoais'),
              onTap: _busy ? null : _requestDeletion),
          ])),
          if (_busy) const Padding(padding: EdgeInsets.all(10),
              child: Center(child: CircularProgressIndicator())),
        ]),
      )),
    );
  }
}

class _AddressEditor extends StatefulWidget {
  const _AddressEditor({this.address});
  final SavedAddress? address;
  @override
  State<_AddressEditor> createState() => _AddressEditorState();
}
class _AddressEditorState extends State<_AddressEditor> {
  final _key = GlobalKey<FormState>();
  final _fields = <String, TextEditingController>{};
  bool _primary = false;
  @override
  void initState() {
    super.initState();
    final a = widget.address;
    final values = {
      'label': a?.label ?? 'Casa', 'zip': a?.zipCode ?? '',
      'street': a?.street ?? '', 'number': a?.number ?? '',
      'complement': a?.complement ?? '', 'neighborhood': a?.neighborhood ?? '',
      'city': a?.city ?? '', 'state': a?.state ?? '',
    };
    values.forEach((key, value) {
      _fields[key] = TextEditingController(text: value);
    });
    _primary = a?.isPrimary ?? false;
  }
  @override
  void dispose() {
    for (final item in _fields.values) { item.dispose(); }
    super.dispose();
  }
  Widget _field(String key, String title, {bool optional = false,
      TextInputType keyboard = TextInputType.text, int maxLength = 120}) =>
      Padding(padding: const EdgeInsets.only(bottom: 10), child: TextFormField(
        controller: _fields[key], keyboardType: keyboard, maxLength: maxLength,
        decoration: InputDecoration(labelText: title, counterText: ''),
        validator: (value) => !optional && (value?.trim().isEmpty ?? true)
            ? 'Preencha este campo.' : null,
      ));

  void _save() {
    if (!_key.currentState!.validate()) return;
    final value = (String key) => _fields[key]!.text.trim();
    final zip = value('zip').replaceAll(RegExp(r'\D'), '');
    if (zip.length != 8) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('CEP deve ter 8 números.')));
      return;
    }
    final uf = value('state').toUpperCase();
    const states = {'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
      'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'};
    if (!states.contains(uf)) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Informe uma UF válida (ex.: SP).')));
      return;
    }
    Navigator.of(context).pop(SavedAddress(
      id: widget.address?.id ?? '', label: value('label'), zipCode: zip,
      street: value('street'), number: value('number'), complement: value('complement'),
      neighborhood: value('neighborhood'), city: value('city'), state: uf,
      isPrimary: _primary,
    ));
  }
  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(widget.address == null ? 'Novo endereço' : 'Editar endereço'),
    content: SizedBox(width: 470, child: SingleChildScrollView(child: Form(key: _key,
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        _field('label', 'Apelido (Casa, Trabalho)', maxLength: 60),
        _field('zip', 'CEP', keyboard: TextInputType.number, maxLength: 9),
        _field('street', 'Rua / avenida', maxLength: 160),
        _field('number', 'Número', maxLength: 30),
        _field('complement', 'Complemento', optional: true, maxLength: 120),
        _field('neighborhood', 'Bairro', maxLength: 100),
        _field('city', 'Cidade', maxLength: 100),
        _field('state', 'UF (ex.: SP)', maxLength: 2),
        SwitchListTile.adaptive(title: const Text('Endereço principal'),
          value: _primary, onChanged: (v) => setState(() => _primary = v)),
      ])))),
    actions: [
      TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancelar')),
      FilledButton(onPressed: _save, child: const Text('Salvar')),
    ],
  );
}
