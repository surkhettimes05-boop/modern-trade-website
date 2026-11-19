import 'package:intl/intl.dart';

double _number(Object? value) => value is num
    ? value.toDouble()
    : double.tryParse(value?.toString() ?? '') ?? 0;

String _text(Object? value, [String fallback = '']) =>
    value?.toString() ?? fallback;

int _moneyMinor(Object? value) {
  final match = RegExp(
    r'^(\d+)(?:\.(\d{1,2}))?$',
  ).firstMatch(value?.toString() ?? '');
  if (match == null) return 0;
  final whole = int.parse(match.group(1)!);
  final fraction = (match.group(2) ?? '').padRight(2, '0');
  return whole * 100 + (fraction.isEmpty ? 0 : int.parse(fraction));
}

class Membership {
  const Membership({
    required this.id,
    required this.number,
    required this.tier,
    required this.status,
    this.foundingNumber,
  });
  final String id;
  final int number;
  final String tier;
  final String status;
  final int? foundingNumber;
  bool get isActive => status == 'ACTIVE';

  factory Membership.fromJson(Map<String, dynamic> json) => Membership(
    id: _text(json['id']),
    number: int.tryParse(_text(json['membership_number'], '0')) ?? 0,
    tier: _text(json['tier_key']),
    status: _text(json['status']),
    foundingNumber: json['founding_number'] == null
        ? null
        : int.tryParse(_text(json['founding_number'])),
  );
}

class MemberDisplayPrice {
  const MemberDisplayPrice({
    required this.sku,
    required this.regularUnitMinor,
    required this.appliedUnitMinor,
    required this.savingPerUnitMinor,
    this.promotionName,
  });
  final String sku;
  final int regularUnitMinor;
  final int appliedUnitMinor;
  final int savingPerUnitMinor;
  final String? promotionName;

  factory MemberDisplayPrice.fromJson(Map<String, dynamic> json) {
    final promotion = json['promotionSnapshot'];
    return MemberDisplayPrice(
      sku: _text(json['sku']),
      regularUnitMinor: _moneyMinor(json['regularUnitPrice']),
      appliedUnitMinor: _moneyMinor(json['appliedUnitPrice']),
      savingPerUnitMinor: _moneyMinor(json['savingPerUnit']),
      promotionName: promotion is Map ? promotion['name']?.toString() : null,
    );
  }
}

class MemberPricingQuoteItem extends MemberDisplayPrice {
  const MemberPricingQuoteItem({
    required super.sku,
    required super.regularUnitMinor,
    required super.appliedUnitMinor,
    required super.savingPerUnitMinor,
    required this.quantity,
    required this.lineDiscountMinor,
    required this.lineTotalMinor,
    super.promotionName,
  });
  final int quantity;
  final int lineDiscountMinor;
  final int lineTotalMinor;

  factory MemberPricingQuoteItem.fromJson(Map<String, dynamic> json) {
    final price = MemberDisplayPrice.fromJson(json);
    return MemberPricingQuoteItem(
      sku: price.sku,
      regularUnitMinor: price.regularUnitMinor,
      appliedUnitMinor: price.appliedUnitMinor,
      savingPerUnitMinor: price.savingPerUnitMinor,
      quantity: int.tryParse(_text(json['quantity'], '0')) ?? 0,
      lineDiscountMinor: _moneyMinor(json['lineDiscount']),
      lineTotalMinor: _moneyMinor(json['lineTotal']),
      promotionName: price.promotionName,
    );
  }
}

class MemberPricingQuote {
  const MemberPricingQuote({
    required this.id,
    required this.storeReference,
    required this.customerReference,
    required this.items,
    required this.regularSubtotalMinor,
    required this.discountTotalMinor,
    required this.finalTotalMinor,
    required this.expiresAt,
    required this.signedQuoteToken,
    required this.membershipStatus,
    this.membershipNumber,
    this.membershipTier,
  });
  final String id;
  final String storeReference;
  final String customerReference;
  final List<MemberPricingQuoteItem> items;
  final int regularSubtotalMinor;
  final int discountTotalMinor;
  final int finalTotalMinor;
  final DateTime expiresAt;
  final String signedQuoteToken;
  final String membershipStatus;
  final int? membershipNumber;
  final String? membershipTier;
  bool get isExpired => !expiresAt.isAfter(DateTime.now());

  factory MemberPricingQuote.fromJson(
    Map<String, dynamic> json,
  ) => MemberPricingQuote(
    id: _text(json['quoteId']),
    storeReference: _text(json['storeReference']),
    customerReference: _text(json['customerReference']),
    items: (json['items'] is List ? json['items'] as List : const [])
        .whereType<Map>()
        .map(
          (item) =>
              MemberPricingQuoteItem.fromJson(Map<String, dynamic>.from(item)),
        )
        .toList(growable: false),
    regularSubtotalMinor: _moneyMinor(json['subtotal']),
    discountTotalMinor: _moneyMinor(json['discountTotal']),
    finalTotalMinor: _moneyMinor(json['finalTotal']),
    expiresAt:
        DateTime.tryParse(_text(json['expiresAt'])) ??
        DateTime.fromMillisecondsSinceEpoch(0),
    signedQuoteToken: _text(json['signedQuoteToken']),
    membershipStatus: _text(json['membershipStatus']),
    membershipNumber: json['membershipNumber'] == null
        ? null
        : int.tryParse(_text(json['membershipNumber'])),
    membershipTier: json['membershipTier']?.toString(),
  );
}

class Product {
  const Product({
    required this.id,
    required this.name,
    required this.brand,
    required this.category,
    required this.description,
    required this.imageUrl,
    required this.price,
    required this.availability,
    this.sku,
    this.categoryId,
    this.originalPrice,
    this.rating = 0,
    this.reviewCount = 0,
    this.unit,
  });

  final String id;
  final String? sku;
  final String name;
  final String brand;
  final String category;
  final String? categoryId;
  final String description;
  final String imageUrl;
  final double price;
  final double? originalPrice;
  final double rating;
  final int reviewCount;
  final String availability;
  final String? unit;

  /// Unknown or future backend states must fail closed.
  bool get isAvailable =>
      const {'AVAILABLE'}.contains(availability.trim().toUpperCase());
  int get priceMinor => (price * 100).round();
  int? get originalPriceMinor =>
      originalPrice == null ? null : (originalPrice! * 100).round();
  int get discountPercent => originalPrice == null || originalPrice! <= price
      ? 0
      : ((1 - price / originalPrice!) * 100).round();

  factory Product.fromJson(Map<String, dynamic> json) {
    final images = json['images'];
    final firstImage = images is List && images.isNotEmpty
        ? images.first
        : null;
    return Product(
      id: _text(json['id']),
      sku: json['sku']?.toString(),
      name: _text(json['name'], 'Product'),
      brand: _text(json['brand'], 'NOVA MART'),
      category: _text(json['category_name'], 'Everyday essentials'),
      categoryId: json['category_id']?.toString(),
      description: _text(json['description']),
      imageUrl: _text(json['image_url'] ?? firstImage),
      price: _number(json['price']),
      originalPrice: json['original_price'] == null
          ? null
          : _number(json['original_price']),
      rating: _number(json['rating']),
      reviewCount: int.tryParse(_text(json['review_count'], '0')) ?? 0,
      availability: _text(json['availability_status'], 'OUT_OF_STOCK'),
      unit: json['unit']?.toString() ?? json['pack_size']?.toString(),
    );
  }
}

class ProductCategory {
  const ProductCategory({
    required this.id,
    required this.name,
    required this.slug,
    this.imageUrl,
    this.description,
    this.skuCount = 0,
  });

  final String id;
  final String name;
  final String slug;
  final String? imageUrl;
  final String? description;
  final int skuCount;

  factory ProductCategory.fromJson(Map<String, dynamic> json) =>
      ProductCategory(
        id: _text(json['id']),
        name: _text(json['name'], 'Category'),
        slug: _text(json['slug']),
        imageUrl: json['image_url']?.toString() ?? json['image']?.toString(),
        description: json['description']?.toString(),
        skuCount: int.tryParse(_text(json['sku_count'], '0')) ?? 0,
      );
}

class StoreLocation {
  const StoreLocation({
    required this.id,
    required this.name,
    this.address,
    this.phone,
    this.hours,
    this.temporarilyClosed = false,
  });

  final String id;
  final String name;
  final String? address;
  final String? phone;
  final String? hours;
  final bool temporarilyClosed;

  factory StoreLocation.fromJson(Map<String, dynamic> json) => StoreLocation(
    id: _text(json['id']),
    name: _text(json['name'], 'NOVA MART'),
    address: json['address']?.toString(),
    phone: json['phone']?.toString(),
    hours: json['hours']?.toString(),
    temporarilyClosed: json['is_temporarily_closed'] == true,
  );
}

class CartLine {
  const CartLine({required this.product, required this.quantity});
  final Product product;
  final int quantity;
  int get totalMinor => product.priceMinor * quantity;

  CartLine copyWith({int? quantity}) =>
      CartLine(product: product, quantity: quantity ?? this.quantity);

  Map<String, dynamic> toJson() => {
    'product_id': product.id,
    'quantity': quantity,
  };
}

class Customer {
  const Customer({
    required this.id,
    this.phoneMasked,
    this.preferredName,
    this.email,
    this.verificationStatus,
  });
  final String id;
  final String? phoneMasked;
  final String? preferredName;
  final String? email;
  final String? verificationStatus;

  factory Customer.fromJson(Map<String, dynamic> json) => Customer(
    id: _text(json['id']),
    phoneMasked: json['phone_masked']?.toString(),
    preferredName: json['preferred_name']?.toString(),
    email: json['email']?.toString(),
    verificationStatus: json['verification_status']?.toString(),
  );
}

class CustomerOrder {
  const CustomerOrder({
    required this.id,
    required this.status,
    required this.total,
    this.orderNumber,
    this.orderDate,
    this.deliveryType,
  });
  final String id;
  final String? orderNumber;
  final String status;
  final double total;
  int get totalMinor => (total * 100).round();
  final DateTime? orderDate;
  final String? deliveryType;

  factory CustomerOrder.fromJson(Map<String, dynamic> json) => CustomerOrder(
    id: _text(json['id']),
    orderNumber: json['order_number']?.toString(),
    status: _text(json['status'], 'PENDING'),
    total: _number(
      json['total_amount'] ?? json['grand_total'] ?? json['total'],
    ),
    orderDate: DateTime.tryParse(
      _text(json['order_date'] ?? json['created_at']),
    ),
    deliveryType: json['delivery_type']?.toString(),
  );
}

String formatNpr(num value) => formatNprMinor((value * 100).round());

String formatNprMinor(int minorUnits) {
  return 'NPR ${NumberFormat('#,##0.##', 'en_US').format(minorUnits / 100)}';
}
