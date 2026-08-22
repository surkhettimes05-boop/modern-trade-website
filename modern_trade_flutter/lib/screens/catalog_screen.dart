import 'package:flutter/material.dart';

import '../main.dart';
import '../widgets/common.dart';

class CatalogScreen extends StatefulWidget {
  const CatalogScreen({super.key});

  @override
  State<CatalogScreen> createState() => CatalogScreenState();
}

class CatalogScreenState extends State<CatalogScreen> {
  final _search = TextEditingController();
  String? _category;
  var _sort = 'featured';

  void selectCategory(String? categoryId) =>
      setState(() => _category = categoryId);

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final items = state.search(_search.text, categoryId: _category);
    final sorted = [...items];
    if (_sort == 'low') sorted.sort((a, b) => a.price.compareTo(b.price));
    if (_sort == 'high') sorted.sort((a, b) => b.price.compareTo(a.price));
    if (_sort == 'rating') sorted.sort((a, b) => b.rating.compareTo(a.rating));
    return CustomScrollView(
      key: const PageStorageKey('catalog-scroll'),
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: TextField(
              controller: _search,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                hintText: 'Search products, brands and categories',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _search.text.isEmpty
                    ? null
                    : IconButton(
                        onPressed: () => setState(_search.clear),
                        icon: const Icon(Icons.close),
                      ),
              ),
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: SizedBox(
            height: 47,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              children: [
                ChoiceChip(
                  selected: _category == null,
                  label: const Text('All'),
                  onSelected: (_) => setState(() => _category = null),
                ),
                const SizedBox(width: 8),
                ...state.categories.map(
                  (category) => Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      selected: _category == category.id,
                      label: Text(category.name),
                      onSelected: (_) =>
                          setState(() => _category = category.id),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 14),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    '${sorted.length} products',
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                ),
                DropdownButton<String>(
                  value: _sort,
                  underline: const SizedBox.shrink(),
                  borderRadius: BorderRadius.circular(12),
                  items: const [
                    DropdownMenuItem(
                        value: 'featured', child: Text('Featured')),
                    DropdownMenuItem(value: 'low', child: Text('Price: low')),
                    DropdownMenuItem(value: 'high', child: Text('Price: high')),
                    DropdownMenuItem(value: 'rating', child: Text('Top rated')),
                  ],
                  onChanged: (value) => setState(() => _sort = value!),
                ),
              ],
            ),
          ),
        ),
        if (sorted.isEmpty)
          const SliverFillRemaining(
            hasScrollBody: false,
            child: EmptyState(
              icon: Icons.search_off,
              title: 'No matching products',
              message: 'Try another search or clear the category filter.',
            ),
          )
        else
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 28),
            sliver: SliverLayoutBuilder(
              builder: (context, constraints) {
                final columns = constraints.crossAxisExtent >= 760 ? 4 : 2;
                return SliverGrid.builder(
                  itemCount: sorted.length,
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: columns,
                    mainAxisSpacing: 12,
                    crossAxisSpacing: 12,
                    childAspectRatio: columns == 2 ? .58 : .62,
                  ),
                  itemBuilder: (context, index) =>
                      ProductCard(product: sorted[index]),
                );
              },
            ),
          ),
      ],
    );
  }
}
