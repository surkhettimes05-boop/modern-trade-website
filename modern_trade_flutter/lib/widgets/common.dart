import 'package:flutter/material.dart';

import '../core/app_theme.dart';
import '../main.dart';
import '../models/models.dart';
import '../screens/product_screen.dart';

class NovaLogo extends StatelessWidget {
  const NovaLogo({super.key, this.compact = false});
  final bool compact;

  @override
  Widget build(BuildContext context) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: compact ? 34 : 40,
            height: compact ? 34 : 40,
            decoration: BoxDecoration(
              color: AppColors.brand,
              borderRadius: BorderRadius.circular(10),
            ),
            alignment: Alignment.center,
            child: Text(
              'N',
              style: TextStyle(
                color: AppColors.lime,
                fontSize: compact ? 18 : 21,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
          const SizedBox(width: 8),
          const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'NOVA',
                style: TextStyle(
                  height: .9,
                  letterSpacing: -.5,
                  fontWeight: FontWeight.w900,
                ),
              ),
              Text(
                'MART',
                style: TextStyle(
                  height: .9,
                  letterSpacing: -.5,
                  color: AppColors.brand,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
        ],
      );
}

class StoreSelector extends StatelessWidget {
  const StoreSelector({super.key});

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: () => showModalBottomSheet<void>(
        context: context,
        showDragHandle: true,
        builder: (sheetContext) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Choose your store',
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w900,
                        )),
                const SizedBox(height: 10),
                ...state.stores.map(
                  (store) => ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(store.name,
                        style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text(
                        [
                          if (store.temporarilyClosed) 'TEMPORARILY CLOSED',
                          if (store.address != null) store.address!,
                        ].join(' · '),
                        style: TextStyle(
                            color: store.temporarilyClosed
                                ? AppColors.danger
                                : null)),
                    leading: Icon(
                      state.selectedStore?.id == store.id
                          ? Icons.check_circle
                          : Icons.circle_outlined,
                      color: AppColors.brand,
                    ),
                    onTap: store.temporarilyClosed
                        ? null
                        : () async {
                            await state.selectStore(store);
                            if (sheetContext.mounted) {
                              Navigator.pop(sheetContext);
                            }
                          },
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.location_on_outlined, size: 19),
            const SizedBox(width: 3),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 120),
              child: Text(
                state.selectedStore?.name ?? 'Choose store',
                overflow: TextOverflow.ellipsis,
                style:
                    const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
              ),
            ),
            const Icon(Icons.expand_more, size: 18),
          ],
        ),
      ),
    );
  }
}

class SectionHeading extends StatelessWidget {
  const SectionHeading({
    super.key,
    required this.title,
    this.eyebrow,
    this.action,
  });
  final String title;
  final String? eyebrow;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (eyebrow != null)
                  Text(
                    eyebrow!.toUpperCase(),
                    style: const TextStyle(
                      color: AppColors.brand,
                      fontSize: 10,
                      letterSpacing: 1.5,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                const SizedBox(height: 4),
                Text(
                  title,
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.w900,
                        letterSpacing: -.7,
                      ),
                ),
              ],
            ),
          ),
          if (action != null) action!,
        ],
      );
}

class ProductCard extends StatelessWidget {
  const ProductCard({super.key, required this.product});
  final Product product;

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    return Card(
      clipBehavior: Clip.antiAlias,
      margin: EdgeInsets.zero,
      child: InkWell(
        onTap: () => Navigator.push(
          context,
          MaterialPageRoute<void>(
            builder: (_) => ProductScreen(product: product),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Stack(
                fit: StackFit.expand,
                children: [
                  ProductImage(url: product.imageUrl),
                  if (product.discountPercent > 0)
                    Positioned(
                      left: 8,
                      top: 8,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          color: const Color(0xFFB2382B),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 7,
                            vertical: 4,
                          ),
                          child: Text(
                            'Save ${product.discountPercent}%',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(11),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    product.brand.toUpperCase(),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: AppColors.muted,
                      fontSize: 9,
                      letterSpacing: .7,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    product.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      height: 1.2,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 7),
                  Text(
                    formatNpr(product.price),
                    style: const TextStyle(
                      color: AppColors.brand,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    height: 39,
                    child: ElevatedButton.icon(
                      onPressed: product.isAvailable
                          ? () {
                              state.addToCart(product);
                              ScaffoldMessenger.of(context)
                                ..hideCurrentSnackBar()
                                ..showSnackBar(
                                  SnackBar(
                                    content:
                                        Text('${product.name} added to cart'),
                                    duration: const Duration(seconds: 1),
                                  ),
                                );
                            }
                          : null,
                      icon: const Icon(Icons.add, size: 17),
                      label: Text(product.isAvailable ? 'Add' : 'Unavailable'),
                      style: ElevatedButton.styleFrom(
                        minimumSize: const Size(0, 39),
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class ProductImage extends StatelessWidget {
  const ProductImage({super.key, required this.url, this.fit = BoxFit.cover});
  final String url;
  final BoxFit fit;

  @override
  Widget build(BuildContext context) {
    if (url.isEmpty || url.startsWith('/')) {
      return const ColoredBox(
        color: AppColors.cream,
        child: Center(
          child: Icon(Icons.inventory_2_outlined,
              color: AppColors.muted, size: 42),
        ),
      );
    }
    return Image.network(
      url,
      fit: fit,
      cacheWidth: (MediaQuery.sizeOf(context).width *
              MediaQuery.devicePixelRatioOf(context))
          .clamp(240, 1200)
          .round(),
      errorBuilder: (_, __, ___) => const ColoredBox(
        color: AppColors.cream,
        child: Center(
          child: Icon(Icons.inventory_2_outlined,
              color: AppColors.muted, size: 42),
        ),
      ),
      loadingBuilder: (context, child, progress) => progress == null
          ? child
          : const ColoredBox(
              color: AppColors.cream,
              child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
            ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    required this.message,
    this.action,
  });
  final IconData icon;
  final String title;
  final String message;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 58, color: AppColors.brand),
              const SizedBox(height: 16),
              Text(
                title,
                textAlign: TextAlign.center,
                style: Theme.of(context)
                    .textTheme
                    .titleLarge
                    ?.copyWith(fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 8),
              Text(
                message,
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.muted, height: 1.5),
              ),
              if (action != null) ...[const SizedBox(height: 20), action!],
            ],
          ),
        ),
      );
}
