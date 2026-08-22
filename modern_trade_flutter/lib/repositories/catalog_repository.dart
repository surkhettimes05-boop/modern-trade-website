import '../core/api_client.dart';
import '../models/models.dart';

class CatalogData {
  const CatalogData(this.products, this.categories, this.stores);
  final List<Product> products;
  final List<ProductCategory> categories;
  final List<StoreLocation> stores;
}

class CatalogRepository {
  CatalogRepository(this.api);
  final ApiClient api;
  Future<CatalogData> load() async {
    final responses = await Future.wait([
      api.get('/api/public/products'),
      api.get('/api/public/categories'),
      api.get('/api/public/stores')
    ]);
    final products = mapList(responses[0], Product.fromJson)
        .where((p) => p.priceMinor > 0)
        .toList(growable: false);
    if (products.isEmpty) {
      throw const ApiException('Catalog is empty',
          kind: ApiErrorKind.invalidResponse);
    }
    return CatalogData(
        products,
        mapList(responses[1], ProductCategory.fromJson),
        mapList(responses[2], StoreLocation.fromJson));
  }
}

List<T> mapList<T>(dynamic value, T Function(Map<String, dynamic>) mapper) {
  final rows = value is List
      ? value
      : value is Map && value['data'] is List
          ? value['data'] as List
          : const [];
  return rows
      .whereType<Map>()
      .map((row) => mapper(Map<String, dynamic>.from(row)))
      .toList(growable: false);
}
