import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:modern_trade_flutter/core/api_client.dart';
import 'package:modern_trade_flutter/models/models.dart';
import 'package:modern_trade_flutter/repositories/checkout_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'test_helpers.dart';

const product = Product(
    id: 'p1',
    name: 'Rice',
    brand: 'NOVA',
    category: 'Food',
    description: '',
    imageUrl: '',
    price: 799,
    availability: 'AVAILABLE');
const store = StoreLocation(id: 's1', name: 'NOVA MART');
const customer = Customer(id: 'c1');
const details = CheckoutDetails(
    deliveryType: 'DELIVERY',
    name: 'Asha',
    phone: '9812345678',
    address: 'Ward 1',
    city: 'Kathmandu',
    state: 'Bagmati',
    postalCode: '44600');

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('successful checkout uploads items and clears attempt', () async {
    final paths = <String>[];
    final repo = CheckoutRepository(testApi((request) async {
      paths.add(request.url.path);
      if (request.url.path == '/api/shopping-cart') {
        return jsonResponse({'id': 'cart-1'});
      }
      if (request.url.path == '/api/checkout/cod') {
        return jsonResponse({'id': 'order-1', 'total': 799});
      }
      return jsonResponse({});
    }));
    final order = await repo.checkout(
        store: store,
        customer: customer,
        lines: const [CartLine(product: product, quantity: 1)],
        details: details);
    expect(order.id, 'order-1');
    expect(paths, [
      '/api/shopping-cart',
      '/api/shopping-cart/cart-1/items',
      '/api/checkout/cod'
    ]);
    expect(
        (await SharedPreferences.getInstance())
            .getString('checkout_attempt_v1'),
        isNull);
  });

  test('timeout and retry use same key without recreating or reuploading cart',
      () async {
    var checkoutCalls = 0;
    final keys = <String>[];
    final paths = <String>[];
    final repo = CheckoutRepository(testApi((request) async {
      paths.add(request.url.path);
      if (request.url.path == '/api/shopping-cart') {
        return jsonResponse({'id': 'cart-1'});
      }
      if (request.url.path == '/api/checkout/cod') {
        keys.add(
            (jsonDecode(request.body) as Map)['idempotency_key'].toString());
        if (checkoutCalls++ == 0) throw TimeoutException('uncertain outcome');
        return jsonResponse({'id': 'order-1'});
      }
      return jsonResponse({});
    }));
    Future<CustomerOrder> args() => repo.checkout(
        store: store,
        customer: customer,
        lines: const [CartLine(product: product, quantity: 1)],
        details: details);
    await expectLater(
        args(),
        throwsA(isA<ApiException>()
            .having((e) => e.kind, 'kind', ApiErrorKind.timeout)));
    expect((await args()).id, 'order-1');
    expect(keys[0], keys[1]);
    expect(paths.where((p) => p == '/api/shopping-cart'), hasLength(1));
    expect(paths.where((p) => p.endsWith('/items')), hasLength(1));
  });

  test('item upload failure preserves attempt for recovery', () async {
    final repo = CheckoutRepository(testApi((request) async {
      if (request.url.path == '/api/shopping-cart') {
        return jsonResponse({'id': 'cart-1'});
      }
      return jsonResponse({'error': 'stock'}, 409);
    }));
    await expectLater(
        repo.checkout(
            store: store,
            customer: customer,
            lines: const [CartLine(product: product, quantity: 1)],
            details: details),
        throwsA(isA<ApiException>()));
    expect(
        (await SharedPreferences.getInstance())
            .getString('checkout_attempt_v1'),
        isNotNull);
  });

  test('pickup omits delivery-only fields', () async {
    late Map<String, dynamic> body;
    final repo = CheckoutRepository(testApi((request) async {
      if (request.url.path == '/api/shopping-cart') {
        return jsonResponse({'id': 'cart-1'});
      }
      if (request.url.path.endsWith('/items')) return jsonResponse({});
      body = jsonDecode(request.body) as Map<String, dynamic>;
      return jsonResponse({'id': 'order'});
    }));
    await repo.checkout(
        store: store,
        customer: customer,
        lines: const [CartLine(product: product, quantity: 1)],
        details: const CheckoutDetails(
            deliveryType: 'PICKUP', name: 'Asha', phone: '9812345678'));
    expect(body['delivery_type'], 'PICKUP');
    expect(body.containsKey('shipping_address'), isFalse);
    expect(body.containsKey('shipping_city'), isFalse);
  });
}
