import 'package:flutter/material.dart';

import '../core/app_theme.dart';
import '../main.dart';
import '../models/models.dart';
import '../widgets/common.dart';

class ProductScreen extends StatefulWidget {
  const ProductScreen({super.key, required this.product});
  final Product product;

  @override
  State<ProductScreen> createState() => _ProductScreenState();
}

class _ProductScreenState extends State<ProductScreen> {
  var _quantity = 1;

  @override
  Widget build(BuildContext context) {
    final product = widget.product;
    final state = AppScope.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(product.category)),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 110),
        children: [
          AspectRatio(
            aspectRatio: 1.15,
            child: Hero(
              tag: 'product-${product.id}',
              child: ProductImage(url: product.imageUrl, fit: BoxFit.contain),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  product.brand.toUpperCase(),
                  style: const TextStyle(
                    color: AppColors.brand,
                    letterSpacing: 1.2,
                    fontSize: 11,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 9),
                Text(
                  product.name,
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                        fontWeight: FontWeight.w900,
                        letterSpacing: -1,
                      ),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    const Icon(Icons.star, color: Color(0xFF8F5B00), size: 18),
                    Text(' ${product.rating.toStringAsFixed(1)}'),
                    Text(
                      '  (${product.reviewCount} reviews)',
                      style: const TextStyle(color: AppColors.muted),
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                Row(
                  children: [
                    Text(
                      formatNpr(product.price),
                      style: const TextStyle(
                        color: AppColors.brand,
                        fontSize: 25,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    if (product.originalPrice != null) ...[
                      const SizedBox(width: 10),
                      Text(
                        formatNpr(product.originalPrice!),
                        style: const TextStyle(
                          color: AppColors.muted,
                          decoration: TextDecoration.lineThrough,
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 12),
                Text(
                  product.isAvailable ? '● In stock' : 'Out of stock',
                  style: TextStyle(
                    color: product.isAvailable
                        ? AppColors.brand
                        : AppColors.danger,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const Divider(height: 36),
                Text(
                  'About this product',
                  style: Theme.of(context)
                      .textTheme
                      .titleMedium
                      ?.copyWith(fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 8),
                Text(
                  product.description.isEmpty
                      ? 'A quality everyday product selected for NOVA MART customers.'
                      : product.description,
                  style: const TextStyle(color: AppColors.muted, height: 1.6),
                ),
                if (product.unit != null) ...[
                  const SizedBox(height: 18),
                  Text('Pack: ${product.unit}',
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                ],
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Container(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
          decoration: const BoxDecoration(
            color: Colors.white,
            border: Border(top: BorderSide(color: AppColors.line)),
          ),
          child: Row(
            children: [
              Container(
                height: 50,
                decoration: BoxDecoration(
                  border: Border.all(color: AppColors.line),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  children: [
                    IconButton(
                      onPressed: _quantity > 1
                          ? () => setState(() => _quantity--)
                          : null,
                      icon: const Icon(Icons.remove),
                    ),
                    Text('$_quantity',
                        style: const TextStyle(fontWeight: FontWeight.w800)),
                    IconButton(
                      onPressed: () => setState(() => _quantity++),
                      icon: const Icon(Icons.add),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: product.isAvailable
                      ? () async {
                          await state.addToCart(product, quantity: _quantity);
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                  content:
                                      Text('${product.name} added to cart')),
                            );
                          }
                        }
                      : null,
                  icon: const Icon(Icons.shopping_cart_outlined),
                  label: const Text('Add to cart'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
