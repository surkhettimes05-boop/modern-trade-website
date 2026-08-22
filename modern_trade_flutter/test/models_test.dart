import 'package:flutter_test/flutter_test.dart';
import 'package:modern_trade_flutter/models/models.dart';

void main() {
  test('maps StoreSync product fields', () {
    final product = Product.fromJson({
      'id': 'product-id',
      'name': 'Basmati Rice',
      'brand': 'NOVA MART',
      'category_name': 'Rice',
      'price': '799',
      'original_price': 999,
      'availability_status': 'AVAILABLE',
    });

    expect(product.id, 'product-id');
    expect(product.price, 799);
    expect(product.discountPercent, 20);
    expect(product.isAvailable, isTrue);
  });

  test('formats Nepalese rupee prices', () {
    expect(formatNpr(123456), 'NPR 123,456');
    expect(formatNpr(123456789.5), 'NPR 123,456,789.5');
    expect(formatNprMinor(1025), 'NPR 10.25');
  });

  test('availability uses a strict allow-list', () {
    for (final status in [
      'OUT_OF_STOCK',
      'DISCONTINUED',
      'BLOCKED',
      'UNAVAILABLE',
      'COMING_SOON',
      'UNKNOWN',
      ''
    ]) {
      final product = Product.fromJson(
          {'id': 'x', 'price': 1, 'availability_status': status});
      expect(product.isAvailable, isFalse, reason: status);
    }
    expect(
        Product.fromJson(
                {'id': 'x', 'price': 1, 'availability_status': ' available '})
            .isAvailable,
        isTrue);
  });

  test('malformed model values fail safely and decimals map to minor units',
      () {
    final product = Product.fromJson(
        {'id': 7, 'price': '10.25', 'rating': 'bad', 'review_count': {}});
    expect(product.id, '7');
    expect(product.priceMinor, 1025);
    expect(product.rating, 0);
    expect(product.reviewCount, 0);
    expect(product.isAvailable, isFalse);
  });
}
