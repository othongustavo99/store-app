import 'dart:async';
import 'package:flutter/material.dart';
import '../../../router/app_back_button.dart';
import '../../../data/repositories/railway_catalog_repository.dart';
import '../../../models/product.dart';
import '../../../models/category.dart';
import '../../../models/catalog_page.dart';
import '../widgets/product_card.dart';
import '../widgets/empty_state.dart';

class RailwaySearchScreen extends StatefulWidget {
  const RailwaySearchScreen(
      {super.key, this.repository, this.initialFilters = const {}});
  final RailwayCatalogRepository? repository;
  final Map<String, String> initialFilters;
  @override
  State<RailwaySearchScreen> createState() => _RailwaySearchScreenState();
}

class _RailwaySearchScreenState extends State<RailwaySearchScreen> {
  late final RailwayCatalogRepository _repository;
  final _text = TextEditingController();
  final _scroll = ScrollController();
  Timer? _debounce;
  List<Product> _items = [];
  List<Category> _categories = [];
  CatalogFilters _facets = const CatalogFilters();
  String? _cursor, _category, _color, _size;
  String _sort = 'newest', _min = '', _max = '';
  bool _available = false, _discounted = false, _new = false, _featured = false;
  bool _loading = false, _loaded = false, _metadataLoading = false;
  String? _error, _metadataError;
  int _revision = 0;

  @override
  void initState() {
    super.initState();
    _repository = widget.repository ?? RailwayCatalogRepository();
    _category = widget.initialFilters['categoryId'];
    _discounted = widget.initialFilters['discounted'] == 'true';
    _new = widget.initialFilters['new'] == 'true';
    _featured = widget.initialFilters['featured'] == 'true';
    _text.text = widget.initialFilters['q'] ?? '';
    _scroll.addListener(() {
      if (_scroll.hasClients &&
          _scroll.position.extentAfter < 450 &&
          !_loading &&
          _cursor != null) {
        _loadPage();
      }
    });
    _loadMetadata();
    _reset();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _text.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _loadMetadata() async {
    if (_metadataLoading) return;
    setState(() => _metadataLoading = true);
    try {
      final results = await Future.wait(
          [_repository.getCategories(), _repository.getFilters()]);
      if (!mounted) return;
      setState(() {
        _categories = results[0] as List<Category>;
        _facets = results[1] as CatalogFilters;
        _metadataError = null;
      });
    } catch (_) {
      if (mounted) {
        setState(() =>
            _metadataError = 'Não foi possível carregar cores e tamanhos.');
      }
    } finally {
      if (mounted) setState(() => _metadataLoading = false);
    }
  }

  Future<void> _reset() {
    _debounce?.cancel();
    if (_scroll.hasClients) _scroll.jumpTo(0);
    _revision++;
    setState(() {
      _cursor = null;
      _items = [];
      _loaded = false;
      _error = null;
      _loading = false;
    });
    return _loadPage();
  }

  Future<void> _loadPage() async {
    if (_loading || (_loaded && _cursor == null)) return;
    final revision = _revision;
    setState(() => _loading = true);
    try {
      final query = <String, String>{'limit': '20', 'sort': _sort};
      if (_text.text.trim().isNotEmpty) query['q'] = _text.text.trim();
      if (_category != null) query['categoryId'] = _category!;
      if (_color != null) query['color'] = _color!;
      if (_size != null) query['size'] = _size!;
      if (_available) query['available'] = 'true';
      if (_discounted) query['discounted'] = 'true';
      if (_new) query['new'] = 'true';
      if (_featured) query['featured'] = 'true';
      if (_min.isNotEmpty) query['minPrice'] = _min.replaceAll(',', '.');
      if (_max.isNotEmpty) query['maxPrice'] = _max.replaceAll(',', '.');
      if (_cursor != null) query['cursor'] = _cursor!;
      final page = await _repository.search(query);
      if (!mounted || revision != _revision) return;
      setState(() {
        final existing = _items.map((product) => product.id).toSet();
        _items
            .addAll(page.products.where((product) => existing.add(product.id)));
        _cursor = page.nextCursor;
        _loaded = true;
        _error = null;
      });
      // Também preenche uma tela larga cuja primeira página não permite rolar.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted &&
            revision == _revision &&
            _scroll.hasClients &&
            _scroll.position.extentAfter < 150 &&
            _cursor != null &&
            _error == null) {
          _loadPage();
        }
      });
    } catch (_) {
      if (mounted && revision == _revision) {
        setState(() =>
            _error = 'Não foi possível buscar os produtos. Tente novamente.');
      }
    } finally {
      if (mounted && revision == _revision) setState(() => _loading = false);
    }
  }

  void _clearFilters() {
    setState(() {
      _category = null;
      _color = null;
      _size = null;
      _available = false;
      _discounted = false;
      _new = false;
      _featured = false;
      _min = '';
      _max = '';
    });
    _reset();
  }

  int get _filterCount => [
        _category != null,
        _color != null,
        _size != null,
        _available,
        _discounted,
        _new,
        _featured,
        _min.isNotEmpty || _max.isNotEmpty
      ].where((value) => value).length;

  Future<void> _openFilters() async {
    var category = _category, color = _color, size = _size;
    var available = _available,
        discounted = _discounted,
        isNew = _new,
        featured = _featured;
    var min = _min, max = _max;
    var fieldRevision = 0;
    String? error;
    final applied = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => StatefulBuilder(builder: (context, update) {
        Widget select(
            String label,
            String? value,
            List<DropdownMenuItem<String>> items,
            ValueChanged<String?> changed) {
          return DropdownButtonFormField<String>(
            key: ValueKey('$label:$value'),
            initialValue: value,
            isExpanded: true,
            decoration: InputDecoration(labelText: label),
            items: [
              const DropdownMenuItem<String>(value: null, child: Text('Todos')),
              ...items,
              if (value != null && !items.any((item) => item.value == value))
                DropdownMenuItem<String>(
                    value: value,
                    child: Text(label == 'Categoria'
                        ? 'Categoria selecionada'
                        : value)),
            ],
            onChanged: (value) => update(() => changed(value)),
          );
        }

        return Padding(
          padding:
              EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
          child: SizedBox(
            height: MediaQuery.sizeOf(context).height * .88,
            child: Column(children: [
              Padding(
                  padding: const EdgeInsets.fromLTRB(20, 12, 8, 0),
                  child: Row(children: [
                    Expanded(
                        child: Column(
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                          Text('Encontre a peça certa',
                              style: Theme.of(context).textTheme.titleLarge),
                          if (error != null)
                            Padding(
                                padding: const EdgeInsets.only(top: 8),
                                child: Text(error!,
                                    style: TextStyle(
                                        color: Theme.of(context)
                                            .colorScheme
                                            .error))),
                        ])),
                    IconButton(
                        tooltip: 'Fechar filtros',
                        onPressed: () => Navigator.pop(context, false),
                        icon: const Icon(Icons.close)),
                  ])),
              Expanded(
                  child: ListView(padding: const EdgeInsets.all(20), children: [
                if (_metadataLoading) const LinearProgressIndicator(),
                if (_metadataError != null) Text(_metadataError!),
                select(
                    'Categoria',
                    category,
                    [
                      for (final item in _categories)
                        DropdownMenuItem(value: item.id, child: Text(item.name))
                    ],
                    (value) => category = value),
                const SizedBox(height: 16),
                Row(children: [
                  Expanded(
                      child: select(
                          'Cor',
                          color,
                          [
                            for (final item in _facets.colors)
                              DropdownMenuItem(value: item, child: Text(item))
                          ],
                          (value) => color = value)),
                  const SizedBox(width: 12),
                  Expanded(
                      child: select(
                          'Tamanho',
                          size,
                          [
                            for (final item in _facets.sizes)
                              DropdownMenuItem(value: item, child: Text(item))
                          ],
                          (value) => size = value)),
                ]),
                const SizedBox(height: 16),
                Row(children: [
                  Expanded(
                      child: TextFormField(
                          key: ValueKey('minimum-price-$fieldRevision'),
                          initialValue: min,
                          onChanged: (value) => min = value,
                          keyboardType: const TextInputType.numberWithOptions(
                              decimal: true),
                          decoration: const InputDecoration(
                              labelText: 'Preço mínimo', prefixText: 'R\$ '))),
                  const SizedBox(width: 12),
                  Expanded(
                      child: TextFormField(
                          key: ValueKey('maximum-price-$fieldRevision'),
                          initialValue: max,
                          onChanged: (value) => max = value,
                          keyboardType: const TextInputType.numberWithOptions(
                              decimal: true),
                          decoration: const InputDecoration(
                              labelText: 'Preço máximo', prefixText: 'R\$ '))),
                ]),
                const SizedBox(height: 12),
                SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Somente em estoque'),
                    value: available,
                    onChanged: (value) => update(() => available = value)),
                SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Em promoção'),
                    value: discounted,
                    onChanged: (value) => update(() => discounted = value)),
                SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Novidades'),
                    value: isNew,
                    onChanged: (value) => update(() => isNew = value)),
                SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Seleção da loja'),
                    value: featured,
                    onChanged: (value) => update(() => featured = value)),
              ])),
              SafeArea(
                  top: false,
                  child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(children: [
                        TextButton(
                            onPressed: () => update(() {
                                  category = null;
                                  color = null;
                                  size = null;
                                  available = false;
                                  discounted = false;
                                  isNew = false;
                                  featured = false;
                                  min = '';
                                  fieldRevision++;
                                  max = '';
                                  error = null;
                                }),
                            child: const Text('Limpar')),
                        const SizedBox(width: 12),
                        Expanded(
                            child: FilledButton(
                                onPressed: () {
                                  double? money(String value) =>
                                      double.tryParse(
                                          value.trim().replaceAll(',', '.'));
                                  final low = money(min), high = money(max);
                                  if ((min.trim().isNotEmpty &&
                                          (low == null ||
                                              !low.isFinite ||
                                              low < 0 ||
                                              low > 1000000)) ||
                                      (max.trim().isNotEmpty &&
                                          (high == null ||
                                              !high.isFinite ||
                                              high < 0 ||
                                              high > 1000000))) {
                                    update(() => error =
                                        'Informe preços válidos, usando vírgula ou ponto para centavos.');
                                    return;
                                  }
                                  if (low != null &&
                                      high != null &&
                                      low > high) {
                                    update(() => error =
                                        'O preço mínimo deve ser menor que o máximo.');
                                    return;
                                  }
                                  _min = low?.toString() ?? '';
                                  _max = high?.toString() ?? '';
                                  Navigator.pop(context, true);
                                },
                                child: const Text('Ver produtos'))),
                      ]))),
            ]),
          ),
        );
      }),
    );
    if (!mounted || applied != true) return;
    setState(() {
      _category = category;
      _color = color;
      _size = size;
      _available = available;
      _discounted = discounted;
      _new = isNew;
      _featured = featured;
    });
    await _reset();
  }

  @override
  Widget build(BuildContext context) {
    final scale = MediaQuery.textScalerOf(context).scale(14) / 14;
    return Scaffold(
      appBar: AppBar(
          leading: const AppBackButton(),
          title: const Text('Explore a coleção')),
      body: Center(
          child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 1200),
              child: Column(children: [
                Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                    child: TextField(
                      controller: _text,
                      textInputAction: TextInputAction.search,
                      onChanged: (_) {
                        _debounce?.cancel();
                        _debounce =
                            Timer(const Duration(milliseconds: 350), _reset);
                      },
                      onSubmitted: (_) => _reset(),
                      decoration: InputDecoration(
                          prefixIcon: const Icon(Icons.search),
                          hintText: 'Busque uma peça ou estilo',
                          suffixIcon: _text.text.isEmpty
                              ? null
                              : IconButton(
                                  tooltip: 'Limpar busca',
                                  onPressed: () {
                                    _text.clear();
                                    _reset();
                                  },
                                  icon: const Icon(Icons.close))),
                    )),
                Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Row(children: [
                      OutlinedButton.icon(
                          onPressed: _metadataLoading ? null : _openFilters,
                          icon: const Icon(Icons.tune, size: 20),
                          label: Text(_filterCount == 0
                              ? 'Filtrar'
                              : 'Filtros ($_filterCount)')),
                      const SizedBox(width: 12),
                      Expanded(
                          child: DropdownButtonFormField<String>(
                        key: ValueKey(_sort),
                        initialValue: _sort,
                        isExpanded: true,
                        decoration: const InputDecoration(
                            labelText: 'Ordenar',
                            contentPadding: EdgeInsets.symmetric(
                                horizontal: 12, vertical: 10)),
                        items: const [
                          DropdownMenuItem(
                              value: 'newest', child: Text('Mais recentes')),
                          DropdownMenuItem(
                              value: 'price_asc', child: Text('Menor preço')),
                          DropdownMenuItem(
                              value: 'price_desc', child: Text('Maior preço')),
                        ],
                        onChanged: (value) {
                          if (value == null) return;
                          setState(() => _sort = value);
                          _reset();
                        },
                      )),
                    ])),
                if (_metadataError != null)
                  Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Row(children: [
                        Expanded(
                            child: Text(_metadataError!,
                                style: Theme.of(context).textTheme.bodySmall)),
                        TextButton(
                            onPressed: _loadMetadata,
                            child: const Text('Tentar novamente'))
                      ])),
                Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                    child: Row(children: [
                      Expanded(
                          child: Text(
                              _loading && _items.isEmpty
                                  ? 'Buscando peças…'
                                  : '${_items.length}${_cursor != null ? '+' : ''} peças',
                              style: Theme.of(context).textTheme.bodySmall)),
                      if (_filterCount > 0)
                        TextButton(
                            onPressed: _clearFilters,
                            child: const Text('Limpar filtros')),
                    ])),
                Expanded(
                    child: _items.isEmpty
                        ? _loading
                            ? const Center(child: CircularProgressIndicator())
                            : EmptyState(
                                icon: _error != null
                                    ? Icons.wifi_off_outlined
                                    : Icons.search_off_outlined,
                                title: _error != null
                                    ? 'Vamos tentar novamente?'
                                    : 'Nenhuma peça por aqui',
                                subtitle: _error ??
                                    'Experimente outra busca ou ajuste os filtros.',
                                buttonLabel: _error != null
                                    ? 'Tentar novamente'
                                    : 'Limpar busca e filtros',
                                onButtonPressed: () {
                                  if (_error == null) _text.clear();
                                  _error != null ? _reset() : _clearFilters();
                                })
                        : RefreshIndicator(
                            onRefresh: _reset,
                            child:
                                CustomScrollView(controller: _scroll, slivers: [
                              SliverPadding(
                                  padding: const EdgeInsets.all(16),
                                  sliver: SliverGrid(
                                      delegate: SliverChildBuilderDelegate(
                                          (context, index) => ProductCard(
                                              product: _items[index]),
                                          childCount: _items.length),
                                      gridDelegate:
                                          SliverGridDelegateWithMaxCrossAxisExtent(
                                              maxCrossAxisExtent: 235,
                                              mainAxisExtent: 318 +
                                                  ((scale - 1) * 80)
                                                      .clamp(0, 120),
                                              mainAxisSpacing: 14,
                                              crossAxisSpacing: 14))),
                              SliverToBoxAdapter(
                                  child: Center(
                                      child: _loading
                                          ? const Padding(
                                              padding: EdgeInsets.all(16),
                                              child:
                                                  CircularProgressIndicator())
                                          : _error != null
                                              ? TextButton(
                                                  onPressed: _loadPage,
                                                  child: const Text(
                                                      'Carregar mais — tentar novamente'))
                                              : const Padding(
                                                  padding: EdgeInsets.all(20),
                                                  child: Text(
                                                      'Você viu todas as peças desta busca.')))),
                            ]))),
              ]))),
    );
  }
}
