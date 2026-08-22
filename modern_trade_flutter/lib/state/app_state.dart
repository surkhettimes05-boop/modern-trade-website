import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/api_client.dart';
import '../models/models.dart';
import '../repositories/auth_repository.dart';
import '../repositories/cart_controller.dart';
import '../repositories/catalog_repository.dart';
import '../repositories/checkout_repository.dart';
import '../repositories/customer_repository.dart';

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
    this.api.onSessionExpired = _onSessionExpired;
  }

  final ApiClient api;
  late final AuthRepository authRepository;
  late final CatalogRepository catalogRepository;
  late final CheckoutRepository checkoutRepository;
  late final CustomerRepository customerRepository;
  final CartController cartController = CartController();
  List<Product> products = const [];
  List<ProductCategory> categories = const [];
  List<StoreLocation> stores = const [];
  StoreLocation? selectedStore;
  Customer? customer;
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

  int get cartCount => cartController.quantities.values
      .fold(0, (sum, quantity) => sum + quantity);
  int get cartSubtotalMinor =>
      cart.fold(0, (sum, line) => sum + line.totalMinor);
  double get cartSubtotal => cartSubtotalMinor / 100;
  bool get isSignedIn => customer != null;

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
    notifyListeners();
  }

  Future<void> addToCart(Product product, {int quantity = 1}) async {
    await cartController.add(product, quantity: quantity);
    notifyListeners();
  }

  Future<void> setCartQuantity(Product product, int quantity) async {
    await cartController.set(product, quantity);
    notifyListeners();
  }

  Future<void> clearCart() async {
    await cartController.clear();
    await checkoutRepository.abandonAttempt();
    notifyListeners();
  }

  Future<void> requestOtp(String phone) => authRepository.requestOtp(phone);

  Future<void> verifyOtp(String phone, String code) async {
    customer = await authRepository.verifyOtp(phone, code);
    notifyListeners();
  }

  Future<void> validateSession() async {
    try {
      customer = await authRepository.validateSession();
    } on ApiException catch (exception) {
      if (exception.statusCode == 401) await api.clearSession();
      customer = null;
    }
    notifyListeners();
  }

  Future<void> logout() async {
    try {
      await authRepository.logout();
    } finally {
      customer = null;
      notifyListeners();
    }
  }

  Future<List<CustomerOrder>> loadOrders() => customerRepository.loadOrders();

  Future<CustomerOrder> checkout({
    required String deliveryType,
    required String name,
    required String phone,
    required String address,
    required String city,
    required String state,
    required String postalCode,
    String? notes,
  }) async {
    if (customer == null) {
      throw const ApiException('Please sign in to checkout.',
          kind: ApiErrorKind.authentication);
    }
    final store = selectedStore;
    if (store == null || store.id == 'offline-store') {
      throw const ApiException('Choose a live store before checkout');
    }
    if (cart.isEmpty) throw const ApiException('Your cart is empty');
    final order = await checkoutRepository.checkout(
      store: store,
      customer: customer!,
      lines: cart,
      details: CheckoutDetails(
          deliveryType: deliveryType,
          name: name,
          phone: phone,
          address: address,
          city: city,
          state: state,
          postalCode: postalCode,
          notes: notes),
    );
    await clearCart();
    return order;
  }

  Future<void> _onSessionExpired() async {
    customer = null;
    notifyListeners();
  }

  @override
  void dispose() {
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
      id: 'opening-5', name: 'Laundry', slug: 'laundry', skuCount: 25),
  ProductCategory(
      id: 'opening-6', name: 'Hair care', slug: 'hair-care', skuCount: 25),
];

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
