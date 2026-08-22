import 'package:flutter/material.dart';

import '../core/app_theme.dart';
import '../main.dart';
import '../widgets/common.dart';
import 'account_screen.dart';
import 'cart_screen.dart';
import 'catalog_screen.dart';
import 'home_screen.dart';

class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  var _index = 0;
  final _catalogKey = GlobalKey<CatalogScreenState>();
  void _openShop([String? categoryId]) {
    setState(() => _index = 1);
    _catalogKey.currentState?.selectCategory(categoryId);
  }

  late final _pages = <Widget>[
    HomeScreen(onShop: _openShop),
    CatalogScreen(key: _catalogKey),
    CartScreen(onShop: _openShop),
    const AccountScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    if (state.loading) {
      return const Scaffold(
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              NovaLogo(),
              SizedBox(height: 28),
              CircularProgressIndicator(),
            ],
          ),
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(
        title: const NovaLogo(compact: true),
        actions: const [StoreSelector(), SizedBox(width: 6)],
        bottom: state.usingFallbackCatalog
            ? const PreferredSize(
                preferredSize: Size.fromHeight(30),
                child: ColoredBox(
                  color: AppColors.warm,
                  child: SizedBox(
                    height: 30,
                    width: double.infinity,
                    child: Center(
                      child: Text(
                        'Offline preview · connect the StoreSync API for live stock',
                        style: TextStyle(
                            fontSize: 11, fontWeight: FontWeight.w700),
                      ),
                    ),
                  ),
                ),
              )
            : null,
      ),
      body: IndexedStack(index: _index, children: _pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (value) => setState(() => _index = value),
        destinations: [
          const NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home),
            label: 'Home',
          ),
          const NavigationDestination(
            icon: Icon(Icons.grid_view_outlined),
            selectedIcon: Icon(Icons.grid_view),
            label: 'Shop',
          ),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: state.cartCount > 0,
              label: Text('${state.cartCount}'),
              child: const Icon(Icons.shopping_cart_outlined),
            ),
            selectedIcon: Badge(
              isLabelVisible: state.cartCount > 0,
              label: Text('${state.cartCount}'),
              child: const Icon(Icons.shopping_cart),
            ),
            label: 'Cart',
          ),
          NavigationDestination(
            icon: Icon(state.isSignedIn ? Icons.person : Icons.person_outline),
            label: 'Account',
          ),
        ],
      ),
    );
  }
}
