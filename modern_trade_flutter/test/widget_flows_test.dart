import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:modern_trade_flutter/main.dart';
import 'package:modern_trade_flutter/models/models.dart';
import 'package:modern_trade_flutter/screens/cart_screen.dart';
import 'package:modern_trade_flutter/screens/checkout_screen.dart';
import 'package:modern_trade_flutter/screens/login_screen.dart';
import 'package:modern_trade_flutter/state/app_state.dart';
import 'package:modern_trade_flutter/widgets/common.dart';
import 'package:shared_preferences/shared_preferences.dart';

const widgetProduct = Product(
    id: 'p',
    name: 'Rice',
    brand: 'NOVA',
    category: 'Food',
    description: '',
    imageUrl: '',
    price: 100,
    availability: 'AVAILABLE');

Widget scoped(AppState state, Widget child) =>
    AppScope(notifier: state, child: MaterialApp(home: child));

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('login rejects invalid Nepal phone without requesting OTP',
      (tester) async {
    final state = AppState();
    await tester.pumpWidget(scoped(state, const LoginScreen()));
    await tester.enterText(find.byType(TextField), '123');
    await tester.tap(find.text('Send OTP'));
    await tester.pump();
    expect(find.text('Enter a valid Nepal mobile number'), findsOneWidget);
    expect(find.textContaining('Development OTP'), findsNothing);
  });

  testWidgets('unavailable product cannot be added', (tester) async {
    final state = AppState();
    const blocked = Product(
        id: 'blocked',
        name: 'Blocked item',
        brand: 'NOVA',
        category: 'Food',
        description: '',
        imageUrl: '',
        price: 1,
        availability: 'BLOCKED');
    await tester.pumpWidget(scoped(
        state,
        const Scaffold(
            body: SizedBox(
                width: 260,
                height: 420,
                child: ProductCard(product: blocked)))));
    expect(find.widgetWithText(ElevatedButton, 'Unavailable'), findsOneWidget);
    expect(
        tester
            .widget<ElevatedButton>(
                find.widgetWithText(ElevatedButton, 'Unavailable'))
            .onPressed,
        isNull);
  });

  testWidgets('cart checkout requires sign in and navigates to login',
      (tester) async {
    final state = AppState()..products = const [widgetProduct];
    await state.addToCart(widgetProduct);
    await tester
        .pumpWidget(scoped(state, Scaffold(body: CartScreen(onShop: () {}))));
    await tester.tap(find.text('Continue to checkout'));
    await tester.pumpAndSettle();
    expect(find.text('Welcome back'), findsOneWidget);
  });

  testWidgets('pickup immediately hides delivery address and shows store',
      (tester) async {
    final state = AppState()
      ..products = const [widgetProduct]
      ..selectedStore = const StoreLocation(
          id: 'store', name: 'NOVA MART Thamel', address: 'Thamel')
      ..customer = const Customer(id: 'customer');
    await state.addToCart(widgetProduct);
    await tester.pumpWidget(scoped(state, const CheckoutScreen()));
    expect(find.text('Street, ward and locality'), findsOneWidget);
    await tester.tap(find.text('Pickup'));
    await tester.pump();
    expect(find.text('Street, ward and locality'), findsNothing);
    expect(find.text('NOVA MART Thamel'), findsOneWidget);
    expect(find.text('City / municipality'), findsNothing);
  });
}
