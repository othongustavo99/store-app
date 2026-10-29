import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/network/loja_api.dart';
import 'railway_search_screen.dart';
import '../../../models/product.dart';
import '../../../providers/product_providers.dart';
import '../widgets/empty_state.dart';
import '../widgets/product_card.dart';

enum _SortOrder { relevance, lowestPrice, highestPrice, newest }

class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final _controller = TextEditingController();
  String _query = '';
  _SortOrder _sort = _SortOrder.relevance;
  bool _onlyAvailable = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  List<Product> _results(List<Product> all) {
    final found = ref.read(productsActionsProvider).search(all, _query).toList();
    if (_onlyAvailable) found.removeWhere((product) => !product.isAvailable);
    switch (_sort) {
      case _SortOrder.lowestPrice:
        found.sort((a, b) => a.price.compareTo(b.price));
        break;
      case _SortOrder.highestPrice:
        found.sort((a, b) => b.price.compareTo(a.price));
        break;
      case _SortOrder.newest:
        found.sort((a, b) => b.createdAt.compareTo(a.createdAt));
        break;
      case _SortOrder.relevance:
        break;
    }
    return found;
  }

  @override
  Widget build(BuildContext context) {
    if (LojaBackend.isRailway) return const RailwaySearchScreen();
    final products = ref.watch(productsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Buscar produtos'),
      ),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1200),
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                child: TextField(
                  controller: _controller,
                  autofocus: true,
                  textInputAction: TextInputAction.search,
                  decoration: InputDecoration(
                    hintText: 'Nome ou descrição do produto',
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: _query.isEmpty
                        ? null
                        : IconButton(
                            tooltip: 'Limpar busca',
                            icon: const Icon(Icons.close),
                            onPressed: () {
                              _controller.clear();
                              setState(() => _query = '');
                            },
                          ),
                  ),
                  onChanged: (value) => setState(() => _query = value.trim()),
                ),
              ),
              if (_query.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                  child: Row(
                    children: [
                      Expanded(
                        child: DropdownButtonFormField<_SortOrder>(
                          initialValue: _sort,
                          isExpanded: true,
                          decoration: const InputDecoration(
                            labelText: 'Ordenar por',
                            contentPadding: EdgeInsets.symmetric(
                              horizontal: 12, vertical: 10,
                            ),
                          ),
                          items: const [
                            DropdownMenuItem(value: _SortOrder.relevance,
                                child: Text('Relevância')),
                            DropdownMenuItem(value: _SortOrder.lowestPrice,
                                child: Text('Menor preço')),
                            DropdownMenuItem(value: _SortOrder.highestPrice,
                                child: Text('Maior preço')),
                            DropdownMenuItem(value: _SortOrder.newest,
                                child: Text('Mais recentes')),
                          ],
                          onChanged: (value) {
                            if (value != null) setState(() => _sort = value);
                          },
                        ),
                      ),
                      const SizedBox(width: 12),
                      FilterChip(
                        label: const Text('Disponíveis'),
                        selected: _onlyAvailable,
                        onSelected: (selected) =>
                            setState(() => _onlyAvailable = selected),
                      ),
                    ],
                  ),
                ),
              Expanded(
                child: products.when(
                  loading: () => const Center(child: CircularProgressIndicator()),
                  error: (error, stackTrace) => EmptyState(
                    icon: Icons.wifi_off_outlined,
                    title: 'Não foi possível pesquisar',
                    subtitle: 'Verifique sua conexão e tente novamente.',
                    buttonLabel: 'Tentar novamente',
                    onButtonPressed: () => ref.invalidate(productsProvider),
                  ),
                  data: (all) {
                    if (_query.isEmpty) {
                      return const EmptyState(
                        icon: Icons.search_rounded,
                        title: 'Encontre o que combina com você',
                        subtitle: 'Pesquise pelo nome ou descrição do produto.',
                      );
                    }
                    final results = _results(all);
                    if (results.isEmpty) {
                      return EmptyState(
                        icon: Icons.search_off_rounded,
                        title: 'Nenhum produto encontrado',
                        subtitle: 'Tente buscar por outro termo ou retirar o filtro.',
                        buttonLabel: 'Limpar filtros',
                        onButtonPressed: () {
                          _controller.clear();
                          setState(() {
                            _query = '';
                            _onlyAvailable = false;
                            _sort = _SortOrder.relevance;
                          });
                        },
                      );
                    }
                    return CustomScrollView(
                      slivers: [
                        SliverToBoxAdapter(
                          child: Padding(
                            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                            child: Text(
                              '${results.length} ${results.length == 1 ? 'produto encontrado' : 'produtos encontrados'}',
                              style: const TextStyle(
                                color: AppColors.textSecondary,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ),
                        SliverPadding(
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                          sliver: SliverGrid(
                            delegate: SliverChildBuilderDelegate(
                              (context, index) => ProductCard(product: results[index]),
                              childCount: results.length,
                            ),
                            gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                              maxCrossAxisExtent: 235,
                              mainAxisExtent: 318,
                              mainAxisSpacing: 14,
                              crossAxisSpacing: 14,
                            ),
                          ),
                        ),
                      ],
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
