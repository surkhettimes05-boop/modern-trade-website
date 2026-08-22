import '../core/api_client.dart';
import '../models/models.dart';

class AuthRepository {
  AuthRepository(this.api);
  final ApiClient api;

  Future<void> requestOtp(String phone) async {
    await api.post('/api/auth/otp/request',
        body: {'phone': phone, 'purpose': 'LOGIN'});
    // Deliberately ignore any server-returned OTP. An OTP must only reach the user out of band.
  }

  Future<Customer> verifyOtp(String phone, String code) async {
    final response = await api.post('/api/auth/otp/verify',
        body: {'phone': phone, 'otp_code': code, 'purpose': 'LOGIN'});
    if (response is! Map || response['customer'] is! Map) {
      throw const ApiException(
          'We could not sign you in. Please request a new code.',
          kind: ApiErrorKind.invalidResponse);
    }
    return Customer.fromJson(
        Map<String, dynamic>.from(response['customer'] as Map));
  }

  Future<Customer?> validateSession() async {
    final response = await api.get('/api/auth/session/validate');
    if (response is Map && response['customer'] is Map) {
      return Customer.fromJson(
          Map<String, dynamic>.from(response['customer'] as Map));
    }
    return null;
  }

  Future<void> logout() async {
    try {
      await api.post('/api/auth/logout');
    } finally {
      await api.clearSession();
    }
  }
}
