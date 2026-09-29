import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:loja_roupas/features/admin/dashboards/admin_dashboard_screen.dart';
import 'package:loja_roupas/features/client/categories/categories_tab_screen.dart';
import 'package:loja_roupas/features/client/discounted/discounted_products_screen.dart';
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
import '../features/client/chat/chat_screen.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  // Observa o auth para o redirect reagir ao login/logout
  final auth = ref.watch(authProvider);

  return GoRouter(
    initialLocation: '/login',
    redirect: (context, state) {
      final loggedIn = auth.isLoggedIn;
      final location = state.matchedLocation;
      final isLogin = location == '/login';
      final isAdminRoute = location.startsWith('/admin');

      // 1) Sem login → só pode ficar na tela de login
      if (!loggedIn) {
        return isLogin ? null : '/login';
      }

      // 2) Já logado e tentando abrir /login → manda pro destino certo
      if (loggedIn && isLogin) {
        return auth.role == UserRole.admin ? '/admin' : '/';
      }

      // 3) Rotas /admin só para admin
      if (isAdminRoute && auth.role != UserRole.admin) {
        return '/';
      }

      return null;
    },
    routes: [
      // ========== LOGIN (primeira tela) ==========
      GoRoute(
        path: '/login',
        builder: (context, state) => const AdminLoginScreen(),
      ),

      GoRoute(
        path: '/chat',
        builder: (context, state) => const ChatScreen(),
      ),

      // ========== ÁREA DO CLIENTE ==========
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) {
          return ClientShell(navigationShell: navigationShell);
        },
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/',
                builder: (context, state) => const HomeScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/categories',
                builder: (context, state) => const CategoriesTabScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/cart',
                builder: (context, state) => const CartScreen(),
              ),
            ],
          ),
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
      GoRoute(
        path: '/discounted',
        builder: (context, state) => const DiscountedProductsScreen(),
      ),

      // ========== ÁREA ADMINISTRATIVA ==========
      GoRoute(
        path: '/admin',
        builder: (context, state) => const AdminDashboardScreen(),
      ),
      GoRoute(
        path: '/admin/orders',
        builder: (context, state) => const AdminOrdersScreen(),
      ),
      GoRoute(
        path: '/admin/products',
        builder: (context, state) => const AdminProductsScreen(),
      ),
    ],
  );
});

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
