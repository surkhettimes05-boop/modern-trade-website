import 'package:flutter_test/flutter_test.dart';
import 'package:modern_trade_flutter/core/app_config.dart';
import 'package:modern_trade_flutter/models/models.dart';
import 'package:modern_trade_flutter/repositories/cart_controller.dart';
import 'package:shared_preferences/shared_preferences.dart';

const available = Product(
    id: 'p1',
    name: 'Rice',
    brand: 'NOVA',
    category: 'Food',
    description: '',
    imageUrl: '',
    price: 10.25,
    availability: 'AVAILABLE');
const unavailable = Product(
    id: 'p2',
    name: 'Blocked',
    brand: 'NOVA',
    category: 'Food',
    description: '',
    imageUrl: '',
    price: 5,
    availability: 'BLOCKED');

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('add, clamp, remove, and persist quantities', () async {
    final cart = CartController();
    await cart.add(available, quantity: 200);
    expect(cart.quantities['p1'], AppConfig.maxCartQuantity);
    await cart.set(available, 0);
    expect(cart.quantities, isEmpty);
    await cart.add(unavailable);
    expect(cart.quantities, isEmpty);
  });

  test('restore clamps quantities and drops unknown or unavailable products',
      () async {
    SharedPreferences.setMockInitialValues(
        {'cart_v1': '{"p1":500,"unknown":2,"p2":3}'});
    final cart = CartController();
    await cart.restore([available, unavailable]);
    expect(cart.quantities, {'p1': AppConfig.maxCartQuantity});
    final restored = CartController();
    await restored.restore([available]);
    expect(restored.quantities, {'p1': AppConfig.maxCartQuantity});
  });
}
