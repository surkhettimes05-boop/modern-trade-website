import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../core/app_config.dart';
import '../models/models.dart';

class CartController {
  final Map<String, int> _quantities = {};
  Map<String, int> get quantities => Map.unmodifiable(_quantities);

  Future<void> restore(Iterable<Product> products) async {
    _quantities.clear();
    final known = {for (final product in products) product.id: product};
    final saved = (await SharedPreferences.getInstance()).getString('cart_v1');
    if (saved == null) return;
    try {
      final decoded = jsonDecode(saved);
      if (decoded is! Map) return;
      for (final entry in decoded.entries) {
        final product = known[entry.key.toString()];
        final quantity = int.tryParse(entry.value.toString());
        if (product != null &&
            product.isAvailable &&
            quantity != null &&
            quantity > 0) {
          _quantities[product.id] =
              quantity.clamp(1, AppConfig.maxCartQuantity);
        }
      }
      await save();
    } on FormatException {
      await save();
    }
  }

  Future<void> add(Product product, {int quantity = 1}) async {
    if (!product.isAvailable || quantity <= 0) return;
    _quantities[product.id] = ((_quantities[product.id] ?? 0) + quantity)
        .clamp(1, AppConfig.maxCartQuantity);
    await save();
  }

  Future<void> set(Product product, int quantity) async {
    if (!product.isAvailable || quantity <= 0) {
      _quantities.remove(product.id);
    } else {
      _quantities[product.id] = quantity.clamp(1, AppConfig.maxCartQuantity);
    }
    await save();
  }

  Future<void> clear() async {
    _quantities.clear();
    await save();
  }

  Future<void> save() async => (await SharedPreferences.getInstance())
      .setString('cart_v1', jsonEncode(_quantities));
}
