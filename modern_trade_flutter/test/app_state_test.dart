import 'package:flutter_test/flutter_test.dart';
import 'package:modern_trade_flutter/core/api_client.dart';
import 'package:modern_trade_flutter/models/models.dart';
import 'package:modern_trade_flutter/state/app_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'test_helpers.dart';

const stateProduct = Product(
  id: 'p',
  sku: 'RICE',
  name: 'Rice',
  brand: 'NOVA',
  category: 'Food',
  description: '',
  imageUrl: '',
  price: 100,
  availability: 'AVAILABLE',
);

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test(
    'checkout guards signed-in, live-store, and cart requirements',
    () async {
      final state = AppState(api: testApi((_) async => jsonResponse({})))
        ..products = const [stateProduct];
      await state.addToCart(stateProduct);
      await expectLater(
        _checkout(state),
        throwsA(
          isA<ApiException>().having(
            (e) => e.kind,
            'kind',
            ApiErrorKind.authentication,
          ),
        ),
      );
      state.customer = const Customer(id: 'c');
      await expectLater(_checkout(state), throwsA(isA<ApiException>()));
      state.selectedStore = const StoreLocation(id: 's', name: 'Store');
      await state.clearCart();
      await expectLater(_checkout(state), throwsA(isA<ApiException>()));
    },
  );

  test('failed cart upload keeps local cart intact', () async {
    final state = AppState(
      api: testApi((request) async {
        if (request.url.path == '/api/shopping-cart') {
          return jsonResponse({'id': 'cart'});
        }
        return jsonResponse({'error': 'stock changed'}, 409);
      }),
    )
      ..products = const [stateProduct]
      ..selectedStore = const StoreLocation(id: 's', name: 'Store');
    await state.addToCart(stateProduct);
    state.customer = const Customer(id: 'c');
    await expectLater(_checkout(state), throwsA(isA<ApiException>()));
    expect(state.cart, hasLength(1));
  });

  test('successful checkout clears local cart', () async {
    final state = AppState(
      api: testApi((request) async {
        if (request.url.path == '/api/shopping-cart') {
          return jsonResponse({'id': 'cart'});
        }
        if (request.url.path.endsWith('/items')) return jsonResponse({});
        return jsonResponse({'id': 'order'});
      }),
    )
      ..products = const [stateProduct]
      ..selectedStore = const StoreLocation(id: 's', name: 'Store');
    await state.addToCart(stateProduct);
    state.customer = const Customer(id: 'c');
    expect((await _checkout(state)).id, 'order');
    expect(state.cart, isEmpty);
  });

  test(
    'initialize restores secure session and falls back on invalid catalog',
    () async {
      final store = MemorySessionStore()
        ..values['customer_session'] = 'session';
      final api = testApi((request) async {
        if (request.url.path == '/api/auth/session/validate') {
          return jsonResponse({
            'customer': {'id': 'restored'},
          });
        }
        return jsonResponse([]);
      }, store: store);
      final state = AppState(api: api);
      await state.initialize();
      expect(state.customer?.id, 'restored');
      expect(state.usingFallbackCatalog, isTrue);
      expect(state.products, isNotEmpty);
    },
  );
}

Future<CustomerOrder> _checkout(AppState state) {
  final quote = MemberPricingQuote(
    id: 'quote-1',
    storeReference: state.selectedStore?.id ?? 's',
    customerReference: state.customer?.id ?? 'c',
    items: const [
      MemberPricingQuoteItem(
        sku: 'RICE',
        quantity: 1,
        regularUnitMinor: 10000,
        appliedUnitMinor: 10000,
        savingPerUnitMinor: 0,
        lineDiscountMinor: 0,
        lineTotalMinor: 10000,
      ),
    ],
    regularSubtotalMinor: 10000,
    discountTotalMinor: 0,
    finalTotalMinor: 10000,
    expiresAt: DateTime.utc(2099),
    signedQuoteToken: 'signed-quote-token',
    membershipStatus: 'ACTIVE',
  );
  state.pricingQuote = quote;
  return state.checkout(
    deliveryType: 'PICKUP',
    name: 'Asha',
    phone: '9812345678',
    address: '',
    municipalityId: null,
    wardId: null,
    postalCode: '',
    acceptedQuote: quote,
  );
}
