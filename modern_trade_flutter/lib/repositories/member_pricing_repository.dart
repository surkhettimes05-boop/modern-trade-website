import '../core/api_client.dart';
import '../models/models.dart';

class MemberPricingRepository {
  MemberPricingRepository(this.api);
  final ApiClient api;

  Future<List<MemberDisplayPrice>> loadDisplayPrices(
    String storeId,
    List<String> skus,
  ) async {
    if (skus.isEmpty) return const [];
    final response = await api.post(
      '/api/customer-pricing/app/prices',
      body: {'store_id': storeId, 'skus': skus},
    );
    if (response is! Map || response['prices'] is! List) {
      throw const ApiException(
        'The member pricing response was invalid.',
        kind: ApiErrorKind.invalidResponse,
      );
    }
    return (response['prices'] as List)
        .whereType<Map>()
        .map(
          (item) =>
              MemberDisplayPrice.fromJson(Map<String, dynamic>.from(item)),
        )
        .toList(growable: false);
  }

  Future<MemberPricingQuote> createQuote({
    required String storeId,
    required List<CartLine> lines,
  }) async {
    final response = await api.post(
      '/api/customer-pricing/app/quotes',
      body: {
        'store_id': storeId,
        'items': lines
            .map((line) => {'sku': line.product.sku, 'quantity': line.quantity})
            .toList(growable: false),
      },
    );
    if (response is! Map || response['quote'] is! Map) {
      throw const ApiException(
        'The authoritative price quote was invalid.',
        kind: ApiErrorKind.invalidResponse,
      );
    }
    final quote = MemberPricingQuote.fromJson(
      Map<String, dynamic>.from(response['quote'] as Map),
    );
    if (quote.signedQuoteToken.isEmpty ||
        quote.storeReference != storeId ||
        quote.items.length != lines.length ||
        quote.isExpired) {
      throw const ApiException(
        'The authoritative price quote is incomplete or expired.',
        kind: ApiErrorKind.invalidResponse,
      );
    }
    return quote;
  }
}
