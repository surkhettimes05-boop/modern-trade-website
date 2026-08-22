import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:modern_trade_flutter/core/api_client.dart';
import 'package:modern_trade_flutter/repositories/auth_repository.dart';

import 'test_helpers.dart';

void main() {
  test('OTP request sends Nepal phone and ignores returned OTP', () async {
    late Map<String, dynamic> body;
    final repo = AuthRepository(testApi((request) async {
      body = jsonDecode(request.body) as Map<String, dynamic>;
      return jsonResponse({'otp': '123456'});
    }));
    await repo.requestOtp('9812345678');
    expect(body, {'phone': '9812345678', 'purpose': 'LOGIN'});
  });

  test('OTP verify maps customer and failed OTP remains safe', () async {
    var succeeds = true;
    final repo = AuthRepository(testApi((_) async => succeeds
        ? jsonResponse({
            'customer': {'id': 'customer-1', 'preferred_name': 'Asha'}
          })
        : jsonResponse({'error': 'wrong database code'}, 401)));
    expect((await repo.verifyOtp('9812345678', '123456')).id, 'customer-1');
    succeeds = false;
    await expectLater(
        repo.verifyOtp('9812345678', '000000'), throwsA(isA<ApiException>()));
  });

  test('session validation restores customer', () async {
    final repo = AuthRepository(testApi((_) async => jsonResponse({
          'customer': {'id': 'restored'}
        })));
    expect((await repo.validateSession())?.id, 'restored');
  });
}
