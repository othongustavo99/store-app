import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:loja_roupas/features/admin/dashboards/admin_dashboard_screen.dart';
import 'package:loja_roupas/features/client/categories/categories_tab_screen.dart';
import '../features/admin/orders/admin_orders_screen.dart';
import '../features/admin/products/admin_products_screen.dart';
import '../features/client/home/home_screen.dart';
import '../features/client/cart/cart_screen.dart';
import '../features/client/orders/orders_screen.dart';
import '../features/client/product_detail/product_detail_screen.dart';
import '../features/client/categories/category_screen.dart';
import '../features/client/search/search_screen.dart';
import '../features/client/checkout/checkout_screen.dart';
import '../features/admin/login/admin_login_screen.dart';
import '../providers/auth_providers.dart';
import '../providers/cart_providers.dart';

// Shell do Cliente (com bottom navigation)
final _clientShellNavigatorKey = GlobalKey<NavigatorState>();

final appRouterProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/',
    routes: [
      // ========== ÁREA DO CLIENTE ==========
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) {
          return ClientShell(navigationShell: navigationShell);
        },
        branches: [
          // Home
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/',
                builder: (context, state) => const HomeScreen(),
              ),
            ],
          ),
          // Categorias (vamos usar a Home por enquanto e depois expandir)
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/categories',
                builder: (context, state) => const CategoriesTabScreen(),
              ),
            ],
          ),
          // Carrinho
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/cart',
                builder: (context, state) => const CartScreen(),
              ),
            ],
          ),
          // Pedidos
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/orders',
                builder: (context, state) => const OrdersScreen(),
              ),
            ],
          ),
        ],
      ),

      // Rotas que ficam fora do shell (detalhes, busca, checkout...)
      GoRoute(
        path: '/product/:id',
        builder: (context, state) {
          final id = state.pathParameters['id']!;
          return ProductDetailScreen(productId: id);
        },
      ),
      GoRoute(
        path: '/category/:id',
        builder: (context, state) {
          final id = state.pathParameters['id']!;
          return CategoryScreen(categoryId: id);
        },
      ),
      GoRoute(
        path: '/search',
        builder: (context, state) => const SearchScreen(),
      ),
      GoRoute(
        path: '/checkout',
        builder: (context, state) => const CheckoutScreen(),
      ),

      // ========== ÁREA ADMINISTRATIVA ==========
      GoRoute(
        path: '/admin/login',
        builder: (context, state) => const AdminLoginScreen(),
      ),
      GoRoute(
        path: '/admin',
        builder: (context, state) => const AdminDashboardScreen(),
        redirect: (context, state) {
          final auth = ref.read(authProvider);
          if (!auth.isLoggedIn || auth.role != UserRole.admin) {
            return '/admin/login';
          }
          return null;
        },
      ),
      GoRoute(
        path: '/admin/orders',
        builder: (context, state) => const AdminOrdersScreen(),
        redirect: (context, state) {
          final auth = ref.read(authProvider);
          if (!auth.isLoggedIn || auth.role != UserRole.admin) {
            return '/admin/login';
          }
          return null;
        },
      ),
      GoRoute(
        path: '/admin/products',
        builder: (context, state) => const AdminProductsScreen(),
        redirect: (context, state) {
          final auth = ref.read(authProvider);
          if (!auth.isLoggedIn || auth.role != UserRole.admin) {
            return '/admin/login';
          }
          return null;
        },
      ),
    ],
  );
});

// ==================== SHELL DO CLIENTE ====================
class ClientShell extends ConsumerWidget {
  final StatefulNavigationShell navigationShell;

  const ClientShell({super.key, required this.navigationShell});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cartCount = ref.watch(cartItemCountProvider);

    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: navigationShell.currentIndex,
        onDestinationSelected: (index) {
          navigationShell.goBranch(
            index,
            initialLocation: index == navigationShell.currentIndex,
          );
        },
        destinations: [
          const NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home),
            label: 'Início',
          ),
          const NavigationDestination(
            icon: Icon(Icons.grid_view_outlined),
            selectedIcon: Icon(Icons.grid_view),
            label: 'Categorias',
          ),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: cartCount > 0,
              label: Text(
                cartCount > 99 ? '99+' : '$cartCount',
                style: const TextStyle(fontSize: 10),
              ),
              child: const Icon(Icons.shopping_cart_outlined),
            ),
            selectedIcon: Badge(
              isLabelVisible: cartCount > 0,
              label: Text(
                cartCount > 99 ? '99+' : '$cartCount',
                style: const TextStyle(fontSize: 10),
              ),
              child: const Icon(Icons.shopping_cart),
            ),
            label: 'Carrinho',
          ),
          const NavigationDestination(
            icon: Icon(Icons.receipt_long_outlined),
            selectedIcon: Icon(Icons.receipt_long),
            label: 'Pedidos',
          ),
        ],
      ),
    );
  }
}
