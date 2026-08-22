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
}
