import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../providers/product_providers.dart';
import '../widgets/empty_state.dart';
import '../widgets/product_card.dart';

class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final _controller = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final asyncProducts = ref.watch(productsProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: TextField(
          controller: _controller,
          autofocus: true,
          style: const TextStyle(fontSize: 16),
          decoration: const InputDecoration(
            hintText: 'Buscar produtos...',
            border: InputBorder.none,
            hintStyle: TextStyle(color: AppColors.textLight),
          ),
          onChanged: (value) {
            setState(() => _query = value.trim());
          },
        ),
        actions: [
          if (_query.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.clear),
              onPressed: () {
                _controller.clear();
                setState(() => _query = '');
              },
            ),
        ],
      ),
      body: asyncProducts.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Erro: $e')),
        data: (all) {
          if (_query.isEmpty) {
            return const EmptyState(
              icon: Icons.search,
              title: 'Busque por produtos',
              subtitle: 'Digite o nome de uma camiseta,\ncalça ou tênis',
            );
          }

          final results = ref.read(productsActionsProvider).search(all, _query);

          if (results.isEmpty) {
            return EmptyState(
              icon: Icons.search_off,
              title: 'Nenhum produto encontrado',
              subtitle: 'Não encontramos resultados para “$_query”',
              iconColor: AppColors.warning,
            );
          }

          return GridView.builder(
            padding: const EdgeInsets.all(16),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              mainAxisSpacing: 16,
              crossAxisSpacing: 16,
              childAspectRatio: 0.68,
            ),
            itemCount: results.length,
            itemBuilder: (context, index) {
              return ProductCard(product: results[index]);
            },
          );
        },
      ),
    );
  }
}
