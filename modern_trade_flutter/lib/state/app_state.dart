import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/api_client.dart';
import '../models/models.dart';
import '../repositories/auth_repository.dart';
import '../repositories/cart_controller.dart';
import '../repositories/catalog_repository.dart';
import '../repositories/checkout_repository.dart';
import '../repositories/customer_repository.dart';
import '../repositories/member_pricing_repository.dart';

const _fallbackProducts = <Product>[
  Product(
    id: 'opening-rice-5kg',
    sku: 'RICE-5KG',
    name: 'Premium Basmati Rice 5kg',
    brand: 'StoreSync Select',
    category: 'Rice',
    categoryId: 'opening-1',
    description: 'Long-grain premium rice for everyday family meals.',
    imageUrl:
        'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=900&q=82',
    price: 799,
    originalPrice: 999,
    rating: 4.8,
    reviewCount: 42,
    availability: 'AVAILABLE',
    unit: '5 kg bag',
  ),
  Product(
    id: 'opening-oil-1l',
    sku: 'OIL-1L',
    name: 'Sunflower Oil 1L',
    brand: 'StoreSync Select',
    category: 'Cooking oil & ghee',
    categoryId: 'opening-2',
    description: 'Refined sunflower oil for daily cooking.',
    imageUrl:
        'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=900&q=82',
    price: 179,
    originalPrice: 219,
    rating: 4.7,
    reviewCount: 35,
    availability: 'AVAILABLE',
    unit: '1 L bottle',
  ),
  Product(
    id: 'opening-water-1l',
    sku: 'WATER-1L',
    name: 'Mineral Water 1L',
    brand: 'StoreSync Select',
    category: 'Water',
    categoryId: 'opening-3',
    description: 'Purified mineral water for home and on-the-go.',
    imageUrl:
        'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?auto=format&fit=crop&w=900&q=82',
    price: 25,
    originalPrice: 30,
    rating: 4.6,
    reviewCount: 28,
    availability: 'AVAILABLE',
    unit: '1 L bottle',
  ),
  Product(
    id: 'opening-noodles',
    sku: 'NOODLES-FAM',
    name: 'Instant Noodles Family Pack',
    brand: 'Wai Wai',
    category: 'Instant noodles',
    categoryId: 'opening-4',
    description: 'Fast, familiar pantry comfort for busy days.',
    imageUrl:
        'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=900&q=82',
    price: 120,
    rating: 4.7,
    reviewCount: 31,
    availability: 'AVAILABLE',
    unit: '5 x 70 g',
  ),
  Product(
    id: 'opening-detergent',
    sku: 'LAUNDRY-1KG',
    name: 'Everyday Laundry Detergent 1kg',
    brand: 'StoreSync Select',
    category: 'Laundry',
    categoryId: 'opening-5',
    description: 'Reliable cleaning power for everyday laundry.',
    imageUrl:
        'https://images.unsplash.com/photo-1582735689369-4fe89db7114c?auto=format&fit=crop&w=900&q=82',
    price: 245,
    rating: 4.5,
    reviewCount: 24,
    availability: 'AVAILABLE',
    unit: '1 kg pack',
  ),
  Product(
    id: 'opening-shampoo',
    sku: 'SHAMPOO-340',
    name: 'Daily Care Shampoo 340ml',
    brand: 'StoreSync Select',
    category: 'Hair care',
    categoryId: 'opening-6',
    description: 'Gentle everyday shampoo for the whole household.',
    imageUrl:
        'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=900&q=82',
    price: 299,
    rating: 4.4,
    reviewCount: 19,
    availability: 'AVAILABLE',
    unit: '340 ml bottle',
  ),
];

class AppState extends ChangeNotifier {
  AppState({ApiClient? api})
      : api = api ??
            ApiClient(
              baseUrl: const String.fromEnvironment(
                'API_BASE_URL',
                defaultValue: 'https://storesync-backend-dg8z.onrender.com',
              ),
            ) {
    authRepository = AuthRepository(this.api);
    catalogRepository = CatalogRepository(this.api);
    checkoutRepository = CheckoutRepository(this.api);
    customerRepository = CustomerRepository(this.api);
    memberPricingRepository = MemberPricingRepository(this.api);
    this.api.onSessionExpired = _onSessionExpired;
  }

  Future<void> _refreshQuoteQuietly() async {
    try {
      await refreshPricingQuote();
    } on ApiException {
      // The service sets pricingError; checkout remains blocked without a quote.
    }
  }

  final ApiClient api;
  late final AuthRepository authRepository;
  late final CatalogRepository catalogRepository;
  late final CheckoutRepository checkoutRepository;
  late final CustomerRepository customerRepository;
  late final MemberPricingRepository memberPricingRepository;
  final CartController cartController = CartController();
  List<Product> products = const [];
  List<ProductCategory> categories = const [];
  List<StoreLocation> stores = const [];
  StoreLocation? selectedStore;
  Customer? customer;
  Membership? membership;
  Map<String, MemberDisplayPrice> memberPrices = const {};
  MemberPricingQuote? pricingQuote;
  bool pricingQuoteNeedsConfirmation = false;
  Timer? _pricingQuoteExpiryTimer;
  bool pricingBusy = false;
  String? pricingError;
  int _pricingRequestGeneration = 0;
  int _memberRequestGeneration = 0;
  bool loading = true;
  bool usingFallbackCatalog = false;
  String? error;

  List<CartLine> get cart => cartController.quantities.entries
      .map((entry) {
        final product =
            products.where((item) => item.id == entry.key).firstOrNull;
        return product == null
            ? null
            : CartLine(product: product, quantity: entry.value);
      })
      .whereType<CartLine>()
      .toList(growable: false);

  int get cartCount => cartController.quantities.values.fold(
        0,
        (sum, quantity) => sum + quantity,
      );
  MemberPricingQuote? get currentPricingQuote {
    final quote = pricingQuote;
    if (customer == null ||
        quote == null ||
        quote.isExpired ||
        quote.storeReference != selectedStore?.id ||
        quote.customerReference != customer?.id ||
        quote.items.length != cart.length) {
      return null;
    }
    final quoted = {for (final item in quote.items) item.sku: item.quantity};
    if (cart.any(
      (line) =>
          line.product.sku == null || quoted[line.product.sku] != line.quantity,
    )) {
      return null;
    }
    return quote;
  }

  int get regularSubtotalMinor =>
      cart.fold(0, (sum, line) => sum + line.totalMinor);
  int get cartSubtotalMinor => customer == null
      ? regularSubtotalMinor
      : currentPricingQuote?.finalTotalMinor ?? 0;
  double get cartSubtotal => cartSubtotalMinor / 100;
  bool get isSignedIn => customer != null;

  void _replacePricingQuote(MemberPricingQuote? quote) {
    _pricingQuoteExpiryTimer?.cancel();
    _pricingQuoteExpiryTimer = null;
    pricingQuote = quote;
    if (quote == null) return;

    final delay = quote.expiresAt.difference(DateTime.now());
    _pricingQuoteExpiryTimer = Timer(
      delay.isNegative ? Duration.zero : delay,
      () {
        if (pricingQuote?.id != quote.id || customer == null || cart.isEmpty) {
          return;
        }
        unawaited(_refreshExpiredPricingQuote());
      },
    );
  }

  Future<void> _refreshExpiredPricingQuote() async {
    try {
      await refreshPricingQuote(requireConfirmation: true);
    } on ApiException {
      // The service sets pricingError and checkout remains blocked.
    }
  }

  void _clearPricingQuote() {
    _replacePricingQuote(null);
    pricingQuoteNeedsConfirmation = false;
  }

  Future<void> initialize() async {
    loading = true;
    notifyListeners();
    try {
      await api.restoreSession();
      await loadCatalog();
      await cartController.restore(products);
      final prefs = await SharedPreferences.getInstance();
      final savedStore = prefs.getString('selected_store');
      selectedStore =
          stores.where((store) => store.id == savedStore).firstOrNull ??
              stores.firstOrNull;
      if (api.hasSession) await validateSession();
      await reloadMemberPricing();
      if (customer != null && cart.isNotEmpty) {
        await _refreshQuoteQuietly();
      }
    } catch (exception) {
      error = userMessage(exception);
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> loadCatalog() async {
    error = null;
    try {
      final catalog = await catalogRepository.load();
      products = catalog.products;
      categories = catalog.categories;
      stores = catalog.stores;
      usingFallbackCatalog = false;
    } catch (exception) {
      products = _fallbackProducts;
      categories = _fallbackCategories;
      stores = const [
        StoreLocation(
          id: 'offline-store',
          name: 'NOVA MART',
          address: 'Connect to the StoreSync API for live availability',
        ),
      ];
      usingFallbackCatalog = true;
      error = 'Live catalog unavailable. Showing the opening range.';
    }
    notifyListeners();
  }

  List<Product> search(String query, {String? categoryId}) {
    final normalized = query.trim().toLowerCase();
    return products.where((product) {
      final categoryMatch = categoryId == null ||
          product.categoryId == categoryId ||
          product.category.toLowerCase() == categoryId.toLowerCase();
      final textMatch = normalized.isEmpty ||
          '${product.name} ${product.brand} ${product.category}'
              .toLowerCase()
              .contains(normalized);
      return categoryMatch && textMatch;
    }).toList(growable: false);
  }

  Future<void> selectStore(StoreLocation store) async {
    selectedStore = store;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('selected_store', store.id);
    _clearPricingQuote();
    _pricingRequestGeneration++;
    _memberRequestGeneration++;
    notifyListeners();
    unawaited(reloadMemberPricing());
    if (customer != null && cart.isNotEmpty) {
      unawaited(_refreshQuoteQuietly());
    }
  }

  Future<void> addToCart(Product product, {int quantity = 1}) async {
    await cartController.add(product, quantity: quantity);
    _clearPricingQuote();
    _pricingRequestGeneration++;
    notifyListeners();
    if (customer != null && cart.isNotEmpty) {
      unawaited(_refreshQuoteQuietly());
    }
  }

  Future<void> setCartQuantity(Product product, int quantity) async {
    await cartController.set(product, quantity);
    _clearPricingQuote();
    _pricingRequestGeneration++;
    notifyListeners();
    if (customer != null && cart.isNotEmpty) {
      unawaited(_refreshQuoteQuietly());
    }
  }

  Future<void> clearCart() async {
    await cartController.clear();
    await checkoutRepository.abandonAttempt();
    _clearPricingQuote();
    _pricingRequestGeneration++;
    notifyListeners();
  }

  Future<void> requestOtp(String phone) => authRepository.requestOtp(phone);

  Future<void> verifyOtp(String phone, String code) async {
    customer = await authRepository.verifyOtp(phone, code);
    _clearPricingQuote();
    _pricingRequestGeneration++;
    _memberRequestGeneration++;
    await reloadMemberPricing();
    if (cart.isNotEmpty) {
      await _refreshQuoteQuietly();
    }
    notifyListeners();
  }

  Future<void> validateSession() async {
    try {
      customer = await authRepository.validateSession();
      _clearPricingQuote();
      _pricingRequestGeneration++;
      _memberRequestGeneration++;
      await reloadMemberPricing();
      if (cart.isNotEmpty) {
        await _refreshQuoteQuietly();
      }
    } on ApiException catch (exception) {
      if (exception.statusCode == 401) await api.clearSession();
      customer = null;
      membership = null;
      memberPrices = const {};
      _clearPricingQuote();
      _pricingRequestGeneration++;
      _memberRequestGeneration++;
    }
    notifyListeners();
  }

  Future<void> logout() async {
    try {
      await authRepository.logout();
    } finally {
      customer = null;
      membership = null;
      memberPrices = const {};
      _clearPricingQuote();
      _pricingRequestGeneration++;
      _memberRequestGeneration++;
      notifyListeners();
    }
  }

  Future<List<CustomerOrder>> loadOrders() => customerRepository.loadOrders();

  Future<void> reloadMemberPricing() async {
    final store = selectedStore;
    final requestCustomer = customer;
    final requestGeneration = ++_memberRequestGeneration;
    if (requestCustomer == null || store == null || usingFallbackCatalog) {
      membership = null;
      memberPrices = const {};
      return;
    }
    try {
      final loadedMembership = await customerRepository.loadMembership();
      if (requestGeneration != _memberRequestGeneration ||
          selectedStore?.id != store.id ||
          customer?.id != requestCustomer.id) {
        return;
      }
      membership = loadedMembership;
    } catch (exception) {
      if (requestGeneration != _memberRequestGeneration) return;
      membership = null;
      memberPrices = const {};
      pricingError = userMessage(exception);
      notifyListeners();
      return;
    }
    try {
      final prices = await memberPricingRepository.loadDisplayPrices(
        store.id,
        products
            .map((product) => product.sku)
            .whereType<String>()
            .toSet()
            .toList(),
      );
      if (requestGeneration != _memberRequestGeneration ||
          selectedStore?.id != store.id ||
          customer?.id != requestCustomer.id) {
        return;
      }
      memberPrices = {for (final price in prices) price.sku: price};
      pricingError = null;
    } catch (exception) {
      if (requestGeneration != _memberRequestGeneration) return;
      memberPrices = const {};
      pricingError = userMessage(exception);
    }
    notifyListeners();
  }

  Future<MemberPricingQuote> refreshPricingQuote({
    bool requireConfirmation = false,
  }) async {
    final store = selectedStore;
    final requestCustomer = customer;
    final lines = cart;
    if (requestCustomer == null || store == null || lines.isEmpty) {
      throw const ApiException(
        'Sign in, choose a store, and add products before requesting a quote.',
      );
    }
    if (lines.any(
      (line) => line.product.sku == null || line.product.sku!.isEmpty,
    )) {
      throw const ApiException(
        'A cart product is missing its SKU and cannot be priced.',
      );
    }
    _pricingQuoteExpiryTimer?.cancel();
    _pricingQuoteExpiryTimer = null;
    pricingBusy = true;
    if (requireConfirmation) pricingQuoteNeedsConfirmation = true;
    pricingError = null;
    final requestGeneration = ++_pricingRequestGeneration;
    final cartFingerprint = _cartFingerprint(
      store.id,
      requestCustomer.id,
      lines,
    );
    notifyListeners();
    try {
      final quote = await memberPricingRepository.createQuote(
        storeId: store.id,
        lines: lines,
      );
      if (quote.customerReference != requestCustomer.id) {
        throw const ApiException(
          'The authoritative quote belongs to a different customer.',
          kind: ApiErrorKind.invalidResponse,
        );
      }
      if (requestGeneration != _pricingRequestGeneration ||
          selectedStore?.id != store.id ||
          customer?.id != requestCustomer.id ||
          _cartFingerprint(store.id, requestCustomer.id, cart) !=
              cartFingerprint) {
        throw const ApiException(
          'The cart changed while pricing was being refreshed.',
          kind: ApiErrorKind.conflict,
        );
      }
      _replacePricingQuote(quote);
      return quote;
    } catch (exception) {
      if (requestGeneration == _pricingRequestGeneration) {
        _replacePricingQuote(null);
        pricingError = userMessage(exception);
      }
      rethrow;
    } finally {
      if (requestGeneration == _pricingRequestGeneration) {
        pricingBusy = false;
        notifyListeners();
      }
    }
  }

  void requirePricingQuoteConfirmation() {
    pricingQuoteNeedsConfirmation = true;
    notifyListeners();
  }

  void confirmPricingQuote() {
    pricingQuoteNeedsConfirmation = false;
    notifyListeners();
  }

  String _cartFingerprint(
    String storeId,
    String customerId,
    List<CartLine> lines,
  ) {
    final entries = lines
        .map((line) => '${line.product.sku}:${line.quantity}')
        .toList()
      ..sort();
    return '$storeId|$customerId|${entries.join(',')}';
  }

  Future<Membership> enrollMembership() async {
    final store = selectedStore;
    if (customer == null || store == null || store.id == 'offline-store') {
      throw const ApiException(
        'Sign in and choose an open store before enrolling.',
      );
    }
    final enrolled = await customerRepository.enrollMembership(store.id);
    membership = enrolled;
    _clearPricingQuote();
    _pricingRequestGeneration++;
    _memberRequestGeneration++;
    await reloadMemberPricing();
    if (cart.isNotEmpty) {
      await _refreshQuoteQuietly();
    }
    notifyListeners();
    return enrolled;
  }

  Future<CustomerOrder> checkout({
    required String deliveryType,
    required String name,
    required String phone,
    required String address,
    required int? municipalityId,
    required int? wardId,
    required String postalCode,
    required MemberPricingQuote acceptedQuote,
    String? notes,
  }) async {
    if (customer == null) {
      throw const ApiException(
        'Please sign in to checkout.',
        kind: ApiErrorKind.authentication,
      );
    }
    final store = selectedStore;
    if (store == null || store.id == 'offline-store') {
      throw const ApiException('Choose a live store before checkout');
    }
    if (cart.isEmpty) throw const ApiException('Your cart is empty');
    if (pricingQuoteNeedsConfirmation) {
      throw const ApiException(
        'Please confirm the refreshed authoritative price before checkout.',
        kind: ApiErrorKind.conflict,
      );
    }
    final currentQuote = currentPricingQuote;
    if (currentQuote == null ||
        currentQuote.id != acceptedQuote.id ||
        acceptedQuote.isExpired) {
      throw const ApiException(
        'The authoritative price quote is no longer valid. Review the updated cart.',
        kind: ApiErrorKind.conflict,
      );
    }
    final order = await checkoutRepository.checkout(
      store: store,
      customer: customer!,
      lines: cart,
      quote: acceptedQuote,
      details: CheckoutDetails(
        deliveryType: deliveryType,
        name: name,
        phone: phone,
        address: address,
        municipalityId: municipalityId,
        wardId: wardId,
        postalCode: postalCode,
        notes: notes,
      ),
    );
    await clearCart();
    return order;
  }

  Future<void> _onSessionExpired() async {
    customer = null;
    membership = null;
    memberPrices = const {};
    _clearPricingQuote();
    _pricingRequestGeneration++;
    _memberRequestGeneration++;
    notifyListeners();
  }

  @override
  void dispose() {
    _pricingQuoteExpiryTimer?.cancel();
    api.close();
    super.dispose();
  }
}

const _fallbackCategories = <ProductCategory>[
  ProductCategory(id: 'opening-1', name: 'Rice', slug: 'rice', skuCount: 25),
  ProductCategory(
    id: 'opening-2',
    name: 'Cooking oil & ghee',
    slug: 'cooking-oil-ghee',
    skuCount: 25,
  ),
  ProductCategory(id: 'opening-3', name: 'Water', slug: 'water', skuCount: 8),
  ProductCategory(
    id: 'opening-4',
    name: 'Instant noodles',
    slug: 'instant-noodles',
    skuCount: 25,
  ),
  ProductCategory(
    id: 'opening-5',
    name: 'Laundry',
    slug: 'laundry',
    skuCount: 25,
  ),
  ProductCategory(
    id: 'opening-6',
    name: 'Hair care',
    slug: 'hair-care',
    skuCount: 25,
  ),
];

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
