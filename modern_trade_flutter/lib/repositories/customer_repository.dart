import '../core/api_client.dart';
import '../models/models.dart';
import 'catalog_repository.dart';

class CustomerRepository {
  CustomerRepository(this.api);
  final ApiClient api;
  Future<List<CustomerOrder>> loadOrders() async =>
      mapList(await api.get('/api/customer/orders'), CustomerOrder.fromJson);
  Future<dynamic> loadAddresses() => api.get('/api/customer/addresses');
  Future<void> deleteAddress(String addressId) async =>
      api.delete('/api/addresses/$addressId');
  Future<void> createAddress(Map<String, Object?> address) async =>
      api.post('/api/addresses', body: address);
}
