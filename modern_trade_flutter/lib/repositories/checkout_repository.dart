import 'dart:convert';
import 'dart:math';

import 'package:shared_preferences/shared_preferences.dart';

import '../core/api_client.dart';
import '../core/app_config.dart';
import '../models/models.dart';

class CheckoutDetails {
  const CheckoutDetails({
    required this.deliveryType,
    required this.name,
    required this.phone,
    this.address = '',
    this.municipalityId,
    this.wardId,
    this.postalCode = '',
    this.notes,
  });
  final String deliveryType;
  final String name;
  final String phone;
  final String address;
  final int? municipalityId;
  final int? wardId;
  final String postalCode;
  final String? notes;
}

class CheckoutServiceArea {
  const CheckoutServiceArea({
    required this.id,
    required this.name,
    required this.wards,
  });
  final int id;
  final String name;
  final List<CheckoutWard> wards;

  factory CheckoutServiceArea.fromJson(Map<String, dynamic> json) =>
      CheckoutServiceArea(
        id: int.tryParse(json['id'].toString()) ?? 0,
        name: (json['name_en'] ?? json['name'] ?? 'Municipality').toString(),
        wards: (json['wards'] is List ? json['wards'] as List : const [])
            .whereType<Map>()
            .map(
              (ward) => CheckoutWard.fromJson(Map<String, dynamic>.from(ward)),
            )
            .toList(growable: false),
      );
}

class CheckoutWard {
  const CheckoutWard({required this.id, required this.number});
  final int id;
  final int number;
  factory CheckoutWard.fromJson(Map<String, dynamic> json) => CheckoutWard(
        id: int.tryParse(json['id'].toString()) ?? 0,
        number:
            int.tryParse((json['ward_number'] ?? json['id']).toString()) ?? 0,
      );
}

class CheckoutDeliveryQuote {
  const CheckoutDeliveryQuote({
    required this.serviceable,
    this.deliveryFee,
    this.reason,
  });
  final bool serviceable;
  final int? deliveryFee;
  final String? reason;
  factory CheckoutDeliveryQuote.fromJson(Map<String, dynamic> json) =>
      CheckoutDeliveryQuote(
        serviceable: json['serviceable'] == true,
        deliveryFee: json['delivery_fee'] == null
            ? null
            : ((double.tryParse(json['delivery_fee'].toString()) ?? 0) * 100)
                .round(),
        reason: json['reason']?.toString(),
      );
}

class CheckoutRepository {
  CheckoutRepository(this.api, {Random? random})
      : _random = random ?? Random.secure();
  final ApiClient api;
  final Random _random;
  static const _attemptKey = 'checkout_attempt_v1';

  Future<List<CheckoutServiceArea>> loadServiceAreas(String storeId) async {
    final response = await api.get(
      '/api/checkout/service-areas',
      query: {'store_id': storeId},
    );
    if (response is! List) {
      throw const ApiException(
        'Delivery areas could not be loaded.',
        kind: ApiErrorKind.invalidResponse,
      );
    }
    return response
        .whereType<Map>()
        .map(
          (area) =>
              CheckoutServiceArea.fromJson(Map<String, dynamic>.from(area)),
        )
        .where((area) => area.id > 0 && area.wards.isNotEmpty)
        .toList(growable: false);
  }

  Future<CheckoutDeliveryQuote> quoteDelivery({
    required String storeId,
    required int municipalityId,
    required int wardId,
    required int orderValueMinor,
  }) async {
    final response = await api.post(
      '/api/checkout/delivery-quote',
      body: {
        'store_id': storeId,
        'municipality_id': municipalityId,
        'ward_id': wardId,
        'order_value': orderValueMinor / 100,
      },
    );
    if (response is! Map) {
      throw const ApiException(
        'The delivery availability response was invalid.',
        kind: ApiErrorKind.invalidResponse,
      );
    }
    return CheckoutDeliveryQuote.fromJson(Map<String, dynamic>.from(response));
  }

  Future<CustomerOrder> checkout({
    required StoreLocation store,
    required Customer customer,
    required List<CartLine> lines,
    required MemberPricingQuote quote,
    required CheckoutDetails details,
  }) async {
    if (lines.isEmpty) throw const ApiException('Your cart is empty');
    if (details.deliveryType != 'PICKUP' &&
        details.deliveryType != 'DELIVERY') {
      throw const ApiException('Choose delivery or pickup.');
    }
    for (final line in lines) {
      if (!line.product.isAvailable ||
          line.quantity < 1 ||
          line.quantity > AppConfig.maxCartQuantity) {
        throw const ApiException(
          'One or more cart quantities are invalid. Please review your cart.',
        );
      }
    }
    final fingerprint = _fingerprint(store.id, customer.id, lines, details);
    final prefs = await SharedPreferences.getInstance();
    var attempt = _Attempt.read(prefs.getString(_attemptKey));
    if (attempt == null || attempt.fingerprint != fingerprint) {
      attempt = _Attempt(key: _newKey(customer.id), fingerprint: fingerprint);
      await _save(prefs, attempt);
    }
    var activeAttempt = attempt;

    if (activeAttempt.cartId == null) {
      final response = await api.post(
        '/api/shopping-cart',
        body: {'store_id': store.id},
      );
      final cartId = response is Map ? response['id']?.toString() : null;
      if (cartId == null || cartId.isEmpty) {
        throw const ApiException(
          'Could not prepare your cart. Please try again.',
          kind: ApiErrorKind.invalidResponse,
        );
      }
      activeAttempt = activeAttempt.copyWith(cartId: cartId);
      await _save(prefs, activeAttempt);
    }

    for (final line in lines) {
      if (activeAttempt.uploadedProductIds.contains(line.product.id)) continue;
      await api.post(
        '/api/shopping-cart/${activeAttempt.cartId}/items',
        body: {'product_id': line.product.id, 'quantity': line.quantity},
      );
      activeAttempt = activeAttempt.copyWith(
        uploadedProductIds: {
          ...activeAttempt.uploadedProductIds,
          line.product.id,
        },
      );
      await _save(prefs, activeAttempt);
    }

    final delivery = details.deliveryType == 'DELIVERY';
    String? addressId;
    if (delivery) {
      if (details.municipalityId == null || details.wardId == null) {
        throw const ApiException('Choose a valid municipality and ward.');
      }
      addressId = activeAttempt.addressId;
      if (addressId == null) {
        final savedAddress = await api.post(
          '/api/addresses',
          body: {
            'municipality_id': details.municipalityId,
            'ward_id': details.wardId,
            'tole_locality': details.address.trim(),
            'postal_code': details.postalCode.trim(),
            'phone': details.phone.trim(),
            'address_type': 'HOME',
            'metadata': {'recipient_name': details.name.trim()},
          },
        );
        if (savedAddress is! Map ||
            savedAddress['id']?.toString().isEmpty != false) {
          throw const ApiException(
            'The delivery address could not be saved.',
            kind: ApiErrorKind.invalidResponse,
          );
        }
        addressId = savedAddress['id'].toString();
        activeAttempt = activeAttempt.copyWith(addressId: addressId);
        await _save(prefs, activeAttempt);
      }
    }
    final result = await api.post(
      '/api/app/checkout/cod',
      body: {
        'cart_id': activeAttempt.cartId,
        'store_id': store.id,
        'idempotency_key': activeAttempt.key,
        'signed_quote_token': quote.signedQuoteToken,
        'delivery_type': details.deliveryType,
        'shipping_name': details.name,
        'shipping_phone': details.phone,
        if (delivery) 'address_id': addressId,
        if (delivery) 'shipping_address': details.address,
        if (delivery) 'shipping_municipality_id': details.municipalityId,
        if (delivery) 'shipping_ward_id': details.wardId,
        if (delivery) 'shipping_postal_code': details.postalCode,
        if (delivery) 'shipping_country': 'NP',
        if (details.notes?.trim().isNotEmpty == true)
          'notes': details.notes!.trim(),
      },
    );
    if (result is! Map) {
      throw const ApiException(
        'The order response was invalid. Please retry to safely confirm the order.',
        kind: ApiErrorKind.invalidResponse,
      );
    }
    final order = CustomerOrder.fromJson(Map<String, dynamic>.from(result));
    if (order.id.isEmpty) {
      throw const ApiException(
        'The order could not be confirmed. Please retry safely.',
        kind: ApiErrorKind.invalidResponse,
      );
    }
    await prefs.remove(_attemptKey);
    return order;
  }

  Future<void> abandonAttempt() async =>
      (await SharedPreferences.getInstance()).remove(_attemptKey);
  Future<void> _save(SharedPreferences prefs, _Attempt attempt) =>
      prefs.setString(_attemptKey, jsonEncode(attempt.toJson()));
  String _newKey(String customerId) =>
      'mobile-$customerId-${DateTime.now().microsecondsSinceEpoch}-${List.generate(12, (_) => _random.nextInt(16).toRadixString(16)).join()}';
  String _fingerprint(
    String storeId,
    String customerId,
    List<CartLine> lines,
    CheckoutDetails details,
  ) {
    final entries = lines
        .map((line) => '${line.product.id}:${line.quantity}')
        .toList()
      ..sort();
    return '$storeId|$customerId|${entries.join(',')}|${details.deliveryType}|${details.name}|${details.phone}|${details.address}|${details.municipalityId}|${details.wardId}|${details.postalCode}|${details.notes}';
  }
}

class _Attempt {
  const _Attempt({
    required this.key,
    required this.fingerprint,
    this.cartId,
    this.addressId,
    this.uploadedProductIds = const {},
  });
  final String key;
  final String fingerprint;
  final String? cartId;
  final String? addressId;
  final Set<String> uploadedProductIds;
  _Attempt copyWith({
    String? cartId,
    String? addressId,
    Set<String>? uploadedProductIds,
  }) =>
      _Attempt(
        key: key,
        fingerprint: fingerprint,
        cartId: cartId ?? this.cartId,
        addressId: addressId ?? this.addressId,
        uploadedProductIds: uploadedProductIds ?? this.uploadedProductIds,
      );
  Map<String, dynamic> toJson() => {
        'key': key,
        'fingerprint': fingerprint,
        'cart_id': cartId,
        'address_id': addressId,
        'uploaded': uploadedProductIds.toList(),
      };
  static _Attempt? read(String? raw) {
    if (raw == null) return null;
    try {
      final map = jsonDecode(raw);
      if (map is! Map || map['key'] == null || map['fingerprint'] == null) {
        return null;
      }
      return _Attempt(
        key: map['key'].toString(),
        fingerprint: map['fingerprint'].toString(),
        cartId: map['cart_id']?.toString(),
        addressId: map['address_id']?.toString(),
        uploadedProductIds:
            (map['uploaded'] is List ? map['uploaded'] as List : const [])
                .map((e) => e.toString())
                .toSet(),
      );
    } on FormatException {
      return null;
    }
  }
}
