import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'app_back_button.dart';
import 'client_tab_history.dart';
import '../core/network/loja_api.dart';
import '../features/admin/remote_admin_home.dart';
import '../features/admin/coupons/railway_coupons_screen.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:loja_roupas/features/admin/dashboards/admin_dashboard_screen.dart';
import 'package:loja_roupas/features/client/categories/categories_tab_screen.dart';
import 'package:loja_roupas/features/client/discounted/discounted_products_screen.dart';
import '../features/admin/orders/admin_orders_screen.dart';
import '../features/admin/products/admin_products_screen.dart';
import '../features/admin/products/railway_catalog_management_screen.dart';
import '../features/client/home/home_screen.dart';
import '../features/client/favorites/favorites_screen.dart';
import '../features/client/profile/profile_tab_screen.dart';
import '../features/client/account/railway_account_screen.dart';
import '../features/client/cart/cart_screen.dart';
import '../features/client/orders/orders_screen.dart';
import '../features/client/product_detail/product_detail_screen.dart';
import '../features/client/categories/category_screen.dart';
import '../features/client/search/search_screen.dart';
import '../features/client/checkout/checkout_screen.dart';
import '../features/client/checkout/railway_checkout_screen.dart';
import '../features/client/orders/railway_orders_screen.dart';
import '../features/admin/orders/railway_admin_orders_screen.dart';
import '../features/admin/inventory/railway_inventory_screen.dart';
import '../features/admin/team/railway_team_screen.dart';
import '../features/admin/shipping/railway_shipping_screen.dart';
import '../features/admin/store_settings/railway_store_settings_screen.dart';
import '../features/client/invite/railway_accept_invite_screen.dart';
import '../features/admin/login/admin_login_screen.dart';
import '../providers/auth_providers.dart';
import '../providers/cart_providers.dart';
import '../features/client/chat/chat_screen.dart';
import '../features/client/widgets/demo_store_banner.dart';
import '../features/support/railway_support_screen.dart';
import '../features/support/railway_support_conversation_screen.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  // Observa o auth para o redirect reagir ao login/logout
  // Não recriar o roteador quando apenas nome/foto do perfil mudarem.
  // A navegação precisa reagir somente a login/logout e permissão.
  ref.watch(authProvider.select((a) => (a.isLoggedIn, a.role)));
  final auth = ref.read(authProvider);

  return GoRouter(
    initialLocation: '/',
    redirect: (context, state) {
      final loggedIn = auth.isLoggedIn;
      final location = state.matchedLocation;
      final isLogin = location == '/login';
      final isAdminRoute = location.startsWith('/admin');

      // Catálogo, busca, produtos, categorias e carrinho são públicos.
      // Checkout, pedidos, suporte, perfil e painel exigem sessão.
      final requiresLogin = location == '/checkout' ||
          location == '/orders' ||
          location == '/account' ||
          location == '/chat' ||
          location == '/support' ||
          location.startsWith('/support/') ||
          location == '/invite' ||
          isAdminRoute;
      if (!loggedIn && requiresLogin) {
        return '/login?from=${Uri.encodeComponent(state.uri.toString())}';
      }
      if (loggedIn && isLogin) {
        final from = state.uri.queryParameters['from'];
        if (from != null &&
            from.startsWith('/') &&
            !from.startsWith('//') &&
            !from.startsWith('/login')) return from;
        return auth.role == UserRole.admin ? '/admin' : '/';
      }

      // Rotas /admin só para a equipe da loja.
      if (isAdminRoute && auth.role != UserRole.admin) {
        return '/';
      }

      return null;
    },
    routes: [
      // Telas completas mantêm a pilha. Quando abertas diretamente,
      // o botão físico volta a um destino previsível em vez de fechar o app.
      GoRoute(
        path: '/login',
        builder: (context, state) =>
            const AppRouteBackGuard(child: AdminLoginScreen()),
      ),
      GoRoute(
        path: '/account',
        builder: (context, state) => AppRouteBackGuard(
          fallbackLocation: '/profile',
          child: LojaBackend.isRailway
              ? const RailwayAccountScreen()
              : const RemotePendingScreen(),
        ),
      ),
      GoRoute(
        path: '/chat',
        builder: (context, state) => AppRouteBackGuard(
          fallbackLocation: '/profile',
          child: LojaBackend.isRailway
              ? const RailwaySupportScreen(admin: false)
              : const ChatScreen(),
        ),
      ),
      GoRoute(
        path: '/support',
        builder: (context, state) => AppRouteBackGuard(
          fallbackLocation: '/profile',
          child: LojaBackend.isRailway
              ? const RailwaySupportScreen(admin: false)
              : const ChatScreen(),
        ),
      ),
      GoRoute(
        path: '/support/ticket/:id',
        builder: (context, state) => AppRouteBackGuard(
          fallbackLocation: '/support',
          child: LojaBackend.isRailway
              ? RailwaySupportConversationScreen(
                  ticketId: state.pathParameters['id']!, admin: false)
              : const RemotePendingScreen(),
        ),
      ),
      GoRoute(
        path: '/admin/support',
        builder: (context, state) => AppRouteBackGuard(
          fallbackLocation: '/admin',
          child: LojaBackend.isRailway
              ? const RailwaySupportScreen(admin: true)
              : const RemotePendingScreen(),
        ),
      ),
      GoRoute(
        path: '/admin/support/ticket/:id',
        builder: (context, state) => AppRouteBackGuard(
          fallbackLocation: '/admin/support',
          child: LojaBackend.isRailway
              ? RailwaySupportConversationScreen(
                  ticketId: state.pathParameters['id']!, admin: true)
              : const RemotePendingScreen(),
        ),
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
                  path: '/favorites',
                  builder: (context, state) => const FavoritesScreen()),
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
                  path: '/profile',
                  builder: (context, state) => const ProfileTabScreen()),
            ],
          ),
        ],
      ),

      GoRoute(
        path: '/orders',
        builder: (context, state) => AppRouteBackGuard(
          fallbackLocation: '/profile',
          child: LojaBackend.isRailway
              ? const RailwayOrdersScreen()
              : const OrdersScreen(),
        ),
      ),
      GoRoute(
        path: '/product/:id',
        builder: (context, state) => AppRouteBackGuard(
          child: ProductDetailScreen(productId: state.pathParameters['id']!),
        ),
      ),
      GoRoute(
        path: '/category/:id',
        builder: (context, state) => AppRouteBackGuard(
          fallbackLocation: '/categories',
          child: CategoryScreen(categoryId: state.pathParameters['id']!),
        ),
      ),
      GoRoute(
        path: '/search',
        builder: (context, state) =>
            const AppRouteBackGuard(child: SearchScreen()),
      ),
      GoRoute(
        path: '/checkout',
        builder: (context, state) => AppRouteBackGuard(
          fallbackLocation: '/cart',
          child: LojaBackend.isRailway
              ? const RailwayCheckoutScreen()
              : const CheckoutScreen(),
        ),
      ),
      GoRoute(
        path: '/discounted',
        builder: (context, state) =>
            const AppRouteBackGuard(child: DiscountedProductsScreen()),
      ),
      GoRoute(
        path: '/admin',
        builder: (context, state) => AppRouteBackGuard(
          child: LojaBackend.isRailway
              ? const RemoteAdminHome()
              : const AdminDashboardScreen(),
        ),
      ),
      GoRoute(
        path: '/invite',
        builder: (context, state) => AppRouteBackGuard(
          fallbackLocation: '/profile',
          child: LojaBackend.isRailway
              ? const RailwayAcceptInviteScreen()
              : const RemotePendingScreen(),
        ),
      ),
      GoRoute(
        path: '/admin/team',
        builder: (context, state) => AppRouteBackGuard(
          fallbackLocation: '/admin',
          child: LojaBackend.isRailway
              ? const RailwayTeamScreen()
              : const RemotePendingScreen(),
        ),
      ),
      GoRoute(
        path: '/admin/coupons',
        builder: (context, state) => AppRouteBackGuard(
          fallbackLocation: '/admin',
          child: LojaBackend.isRailway
              ? const RailwayCouponsScreen()
              : const RemotePendingScreen(),
        ),
      ),
      GoRoute(
        path: '/admin/orders',
        builder: (context, state) => AppRouteBackGuard(
          fallbackLocation: '/admin',
          child: LojaBackend.isRailway
              ? const RailwayAdminOrdersScreen()
              : const AdminOrdersScreen(),
        ),
      ),
      GoRoute(
        path: '/admin/inventory',
        builder: (context, state) => AppRouteBackGuard(
          fallbackLocation: '/admin',
          child: LojaBackend.isRailway
              ? const RailwayInventoryScreen()
              : const AdminDashboardScreen(),
        ),
      ),
      GoRoute(
        path: '/admin/store-settings',
        builder: (context, state) => AppRouteBackGuard(
          fallbackLocation: '/admin',
          child: LojaBackend.isRailway
              ? const RailwayStoreSettingsScreen()
              : const RemotePendingScreen(),
        ),
      ),
      GoRoute(
        path: '/admin/shipping',
        builder: (context, state) => AppRouteBackGuard(
          fallbackLocation: '/admin',
          child: LojaBackend.isRailway
              ? const RailwayShippingScreen()
              : const RemotePendingScreen(),
        ),
      ),
      GoRoute(
        path: '/admin/products',
        builder: (context, state) => AppRouteBackGuard(
          fallbackLocation: '/admin',
          child: LojaBackend.isRailway
              ? const RailwayCatalogManagementScreen()
              : const AdminProductsScreen(),
        ),
      ),
    ],
  );
});

class ClientShell extends ConsumerStatefulWidget {
  final StatefulNavigationShell navigationShell;

  const ClientShell({super.key, required this.navigationShell});

  @override
  ConsumerState<ClientShell> createState() => _ClientShellState();
}

class _ClientShellState extends ConsumerState<ClientShell> {
  late final ClientTabHistory _history;
  final DoubleBackExitGuard _exitGuard = DoubleBackExitGuard();

  @override
  void initState() {
    super.initState();
    _history =
        ClientTabHistory(initialIndex: widget.navigationShell.currentIndex);
  }

  @override
  void didUpdateWidget(covariant ClientShell oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Também registra trocas de aba vindas de context.go('/cart'),
    // links externos e outras ações, além dos botões da NavigationBar.
    final index = widget.navigationShell.currentIndex;
    if (index != _history.current) {
      _history.visit(index);
      _exitGuard.reset();
    }
  }

  void _navigate(int index) {
    if (index == widget.navigationShell.currentIndex) {
      widget.navigationShell.goBranch(index, initialLocation: true);
      return;
    }
    _history.visit(index);
    _exitGuard.reset();
    widget.navigationShell.goBranch(index);
  }

  void _backFromTabOrExit() {
    if (_history.canGoBack) {
      _exitGuard.reset();
      final previous = _history.back();
      widget.navigationShell.goBranch(previous);
      return;
    }
    // Se a Home foi aberta diretamente como outra aba, retorna à Home.
    if (widget.navigationShell.currentIndex != 0) {
      _exitGuard.reset();
      widget.navigationShell.goBranch(0);
      return;
    }

    // Somente na Home, após esgotar o histórico de abas, pede dois toques.
    if (_exitGuard.register(DateTime.now())) {
      if (Theme.of(context).platform == TargetPlatform.android) {
        SystemNavigator.pop();
      } else {
        // iOS e desktop não devem ser fechados por SystemNavigator.pop.
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Você está na página inicial.')),
        );
      }
      return;
    }
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(const SnackBar(
        content: Text('Pressione voltar novamente para sair'),
        duration: Duration(seconds: 2),
      ));
  }

  @override
  Widget build(BuildContext context) {
    final cartCount = ref.watch(cartItemCountProvider);
    final cartLabel = cartCount > 99 ? '99+' : '$cartCount';

    final cartIcon = Badge(
      isLabelVisible: cartCount > 0,
      label: Text(cartLabel, style: const TextStyle(fontSize: 10)),
      child: const Icon(Icons.shopping_cart_outlined),
    );
    final activeCartIcon = Badge(
      isLabelVisible: cartCount > 0,
      label: Text(cartLabel, style: const TextStyle(fontSize: 10)),
      child: const Icon(Icons.shopping_cart),
    );

    return LayoutBuilder(
      builder: (context, constraints) {
        // Navegação lateral apenas em tablets largos e Windows.
        if (constraints.maxWidth >= 850) {
          final expanded = constraints.maxWidth >= 1180;
          return ClientTabBackScope(
            goBack: _backFromTabOrExit,
            child: PopScope(
              canPop: false,
              onPopInvokedWithResult: (didPop, _) {
                if (!didPop) _backFromTabOrExit();
              },
              child: Scaffold(
                body: Row(
                  children: [
                    NavigationRail(
                      extended: expanded,
                      minExtendedWidth: 214,
                      labelType: expanded
                          ? NavigationRailLabelType.none
                          : NavigationRailLabelType.selected,
                      selectedIndex: widget.navigationShell.currentIndex,
                      onDestinationSelected: _navigate,
                      leading: const Padding(
                        padding: EdgeInsets.symmetric(vertical: 20),
                        child: Icon(Icons.storefront_outlined, size: 28),
                      ),
                      destinations: [
                        const NavigationRailDestination(
                          icon: Icon(Icons.home_outlined),
                          selectedIcon: Icon(Icons.home),
                          label: Text('Início'),
                        ),
                        const NavigationRailDestination(
                          icon: Icon(Icons.grid_view_outlined),
                          selectedIcon: Icon(Icons.grid_view),
                          label: Text('Categorias'),
                        ),
                        const NavigationRailDestination(
                          icon: Icon(Icons.favorite_border),
                          selectedIcon: Icon(Icons.favorite),
                          label: Text('Favoritos'),
                        ),
                        NavigationRailDestination(
                          icon: cartIcon,
                          selectedIcon: activeCartIcon,
                          label: const Text('Carrinho'),
                        ),
                        const NavigationRailDestination(
                          icon: Icon(Icons.person_outline),
                          selectedIcon: Icon(Icons.person),
                          label: Text('Perfil'),
                        ),
                      ],
                    ),
                    const VerticalDivider(width: 1),
                    Expanded(
                        child: SafeArea(
                            bottom: false,
                            child: Column(children: [
                              const DemoStoreBanner(),
                              Expanded(child: widget.navigationShell),
                            ]))),
                  ],
                ),
              ),
            ),
          );
        }
        return ClientTabBackScope(
          goBack: _backFromTabOrExit,
          child: PopScope(
            canPop: false,
            onPopInvokedWithResult: (didPop, _) {
              if (!didPop) _backFromTabOrExit();
            },
            child: Scaffold(
              body: SafeArea(
                  bottom: false,
                  child: Column(children: [
                    const DemoStoreBanner(),
                    Expanded(child: widget.navigationShell),
                  ])),
              bottomNavigationBar: NavigationBar(
                selectedIndex: widget.navigationShell.currentIndex,
                onDestinationSelected: _navigate,
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
                  const NavigationDestination(
                    icon: Icon(Icons.favorite_border),
                    selectedIcon: Icon(Icons.favorite),
                    label: 'Favoritos',
                  ),
                  NavigationDestination(
                    icon: cartIcon,
                    selectedIcon: activeCartIcon,
                    label: 'Carrinho',
                  ),
                  const NavigationDestination(
                    icon: Icon(Icons.person_outline),
                    selectedIcon: Icon(Icons.person),
                    label: 'Perfil',
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
