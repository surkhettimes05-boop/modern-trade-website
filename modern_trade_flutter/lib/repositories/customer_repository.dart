import '../core/api_client.dart';
import '../models/models.dart';
import 'catalog_repository.dart';

class CustomerRepository {
  CustomerRepository(this.api);
  final ApiClient api;
  Future<List<CustomerOrder>> loadOrders() async =>
      mapList(await api.get('/api/customer/orders'), CustomerOrder.fromJson);
  Future<dynamic> loadAddresses(String customerId) =>
      api.get('/api/addresses/customer/$customerId');
  Future<void> deleteAddress(String addressId) async =>
      api.delete('/api/addresses/$addressId');
  Future<void> createAddress(Map<String, Object?> address) async =>
      api.post('/api/addresses', body: address);
  Future<Membership?> loadMembership() async {
    final response = await api.get('/api/membership/me');
    if (response is! Map) {
      throw const ApiException(
        'The membership response was invalid.',
        kind: ApiErrorKind.invalidResponse,
      );
    }
    final membership = response['membership'];
    return membership is Map
        ? Membership.fromJson(Map<String, dynamic>.from(membership))
        : null;
  }

  Future<Membership> enrollMembership(String storeId) async {
    final response = await api.post('/api/membership/enroll',
        body: {'store_id': storeId});
    if (response is! Map || response['membership'] is! Map) {
      throw const ApiException(
        'Membership enrollment response was invalid.',
        kind: ApiErrorKind.invalidResponse,
      );
    }
    return Membership.fromJson(
        Map<String, dynamic>.from(response['membership'] as Map));
  }
}
