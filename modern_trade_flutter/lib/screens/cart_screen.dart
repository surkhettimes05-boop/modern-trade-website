import 'package:flutter/material.dart';

import '../core/app_theme.dart';
import '../main.dart';
import '../models/models.dart';
import '../widgets/common.dart';
import 'checkout_screen.dart';
import 'login_screen.dart';

class CartScreen extends StatelessWidget {
  const CartScreen({super.key, required this.onShop});
  final VoidCallback onShop;

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    if (state.cart.isEmpty) {
      return EmptyState(
        icon: Icons.shopping_cart_outlined,
        title: 'Your cart is ready for good things',
        message: 'Add everyday essentials and come back when you are ready.',
        action: ElevatedButton(
            onPressed: onShop, child: const Text('Start shopping')),
      );
    }
    return Column(
      children: [
        Expanded(
          child: ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 18, 16, 24),
            itemCount: state.cart.length,
            separatorBuilder: (_, __) => const Divider(height: 24),
            itemBuilder: (context, index) {
              final line = state.cart[index];
              return _CartLineItem(line: line);
            },
          ),
        ),
        SafeArea(
          top: false,
          child: Container(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
            decoration: const BoxDecoration(
              color: Colors.white,
              border: Border(top: BorderSide(color: AppColors.line)),
            ),
            child: Column(
              children: [
                Row(
                  children: [
                    const Expanded(child: Text('Subtotal')),
                    Text(
                      formatNpr(state.cartSubtotal),
                      style: const TextStyle(
                          fontSize: 20, fontWeight: FontWeight.w900),
                    ),
                  ],
                ),
                const SizedBox(height: 5),
                const Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Delivery charges are confirmed at checkout',
                        style: TextStyle(color: AppColors.muted, fontSize: 11),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 13),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: () async {
                      if (!state.isSignedIn) {
                        final signedIn = await Navigator.push<bool>(
                          context,
                          MaterialPageRoute(
                              builder: (_) => const LoginScreen()),
                        );
                        if (signedIn != true || !context.mounted) return;
                      }
                      await Navigator.push<void>(
                        context,
                        MaterialPageRoute(
                            builder: (_) => const CheckoutScreen()),
                      );
                    },
                    iconAlignment: IconAlignment.end,
                    icon: const Icon(Icons.arrow_forward),
                    label: const Text('Continue to checkout'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _CartLineItem extends StatelessWidget {
  const _CartLineItem({required this.line});
  final CartLine line;

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: SizedBox(
            width: 92,
            height: 92,
            child: ProductImage(url: line.product.imageUrl),
          ),
        ),
        const SizedBox(width: 13),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(line.product.name,
                  style: const TextStyle(fontWeight: FontWeight.w800)),
              const SizedBox(height: 5),
              Text(formatNpr(line.product.price),
                  style: const TextStyle(
                    color: AppColors.brand,
                    fontWeight: FontWeight.w900,
                  )),
              const SizedBox(height: 10),
              Row(
                children: [
                  _QuantityButton(
                    icon: Icons.remove,
                    onTap: () => state.setCartQuantity(
                      line.product,
                      line.quantity - 1,
                    ),
                  ),
                  SizedBox(
                    width: 38,
                    child: Text(
                      '${line.quantity}',
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ),
                  _QuantityButton(
                    icon: Icons.add,
                    onTap: () => state.setCartQuantity(
                      line.product,
                      line.quantity + 1,
                    ),
                  ),
                  const Spacer(),
                  IconButton(
                    tooltip: 'Remove item',
                    onPressed: () => state.setCartQuantity(line.product, 0),
                    icon: const Icon(Icons.delete_outline,
                        color: AppColors.danger),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _QuantityButton extends StatelessWidget {
  const _QuantityButton({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(7),
        child: Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(
            border: Border.all(color: AppColors.line),
            borderRadius: BorderRadius.circular(7),
          ),
          child: Icon(icon, size: 18),
        ),
      );
}
