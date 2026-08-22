import 'package:flutter/material.dart';

import '../core/app_theme.dart';
import '../main.dart';
import '../widgets/common.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key, required this.onShop});
  final ValueChanged<String?> onShop;

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    return RefreshIndicator(
      onRefresh: state.loadCatalog,
      child: CustomScrollView(
        key: const PageStorageKey('home-scroll'),
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
              child: _SearchPrompt(onTap: () => onShop(null)),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: _Hero(onShop: () => onShop(null)),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 30, 16, 14),
              child: SectionHeading(
                eyebrow: 'StoreSync opening range',
                title: 'Shop by category',
                action: TextButton(
                    onPressed: () => onShop(null),
                    child: const Text('View all')),
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: SizedBox(
              height: 112,
              child: ListView.separated(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                scrollDirection: Axis.horizontal,
                itemCount: state.categories.length,
                separatorBuilder: (_, __) => const SizedBox(width: 10),
                itemBuilder: (context, index) {
                  final category = state.categories[index];
                  return InkWell(
                    onTap: () => onShop(category.id),
                    borderRadius: BorderRadius.circular(14),
                    child: Container(
                      width: 118,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: index.isEven
                            ? AppColors.cream
                            : const Color(0xFFE7F2ED),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Icon(_categoryIcon(category.name),
                              color: AppColors.brand, size: 28),
                          Text(
                            category.name,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              height: 1.1,
                              fontSize: 12,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 32, 16, 14),
              child: SectionHeading(
                eyebrow: 'Everyday value',
                title: 'Popular right now',
                action: TextButton(
                    onPressed: () => onShop(null),
                    child: const Text('Shop all')),
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
            sliver: SliverLayoutBuilder(
              builder: (context, constraints) {
                final columns = constraints.crossAxisExtent >= 1000
                    ? 5
                    : constraints.crossAxisExtent >= 700
                        ? 4
                        : 2;
                return SliverGrid.builder(
                  itemCount: state.products.take(6).length,
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: columns,
                    mainAxisSpacing: 12,
                    crossAxisSpacing: 12,
                    childAspectRatio: columns == 2 ? .58 : .62,
                  ),
                  itemBuilder: (context, index) =>
                      ProductCard(product: state.products[index]),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  IconData _categoryIcon(String name) {
    final text = name.toLowerCase();
    if (text.contains('water') || text.contains('drink')) {
      return Icons.local_drink;
    }
    if (text.contains('care') || text.contains('hygiene')) {
      return Icons.spa_outlined;
    }
    if (text.contains('laundry') || text.contains('clean')) {
      return Icons.cleaning_services;
    }
    if (text.contains('rice') || text.contains('flour')) {
      return Icons.grass;
    }
    return Icons.shopping_basket_outlined;
  }
}

class _SearchPrompt extends StatelessWidget {
  const _SearchPrompt({required this.onTap});
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(11),
        child: Container(
          height: 48,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: BoxDecoration(
            border: Border.all(color: AppColors.brand, width: 2),
            borderRadius: BorderRadius.circular(11),
          ),
          child: const Row(
            children: [
              Icon(Icons.search),
              SizedBox(width: 10),
              Text(
                'Search products, brands and categories',
                style: TextStyle(color: AppColors.muted, fontSize: 13),
              ),
            ],
          ),
        ),
      );
}

class _Hero extends StatelessWidget {
  const _Hero({required this.onShop});
  final VoidCallback onShop;
  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: BorderRadius.circular(18),
        child: SizedBox(
          height: 400,
          child: Stack(
            fit: StackFit.expand,
            children: [
              Image.network(
                'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=85',
                fit: BoxFit.cover,
              ),
              const DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [Color(0xE5091C13), Color(0x70091C13)],
                    begin: Alignment.centerLeft,
                    end: Alignment.centerRight,
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(28),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 7),
                      decoration: BoxDecoration(
                        color: AppColors.lime,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: const Text(
                        'THIS WEEK AT NOVA MART',
                        style: TextStyle(
                          fontSize: 10,
                          letterSpacing: 1,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                    const SizedBox(height: 20),
                    const Text(
                      'Big savings for\neveryday living.',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 40,
                        height: .98,
                        letterSpacing: -1.8,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      'Groceries, home essentials and more — quality products at prices made for everyday life.',
                      style: TextStyle(color: Color(0xFFEDF5F0), height: 1.5),
                    ),
                    const SizedBox(height: 24),
                    ElevatedButton.icon(
                      onPressed: onShop,
                      iconAlignment: IconAlignment.end,
                      icon: const Icon(Icons.arrow_forward),
                      label: const Text("Shop today's deals"),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
}
