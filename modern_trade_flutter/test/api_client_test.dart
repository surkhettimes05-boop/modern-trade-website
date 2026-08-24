import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:modern_trade_flutter/core/api_client.dart';

import 'test_helpers.dart';

void main() {
  test('release API configuration rejects remote plaintext HTTP', () {
    expect(
        () => validateApiBaseUrl('http://api.example.com', releaseMode: true),
        throwsStateError);
    expect(validateApiBaseUrl('https://api.example.com/', releaseMode: true),
        'https://api.example.com');
    expect(validateApiBaseUrl('http://127.0.0.1:3001', releaseMode: true),
        'http://127.0.0.1:3001');
  });

  test('API configuration rejects credentials and non-HTTP schemes', () {
    expect(() => validateApiBaseUrl('https://user:pass@api.example.com'),
        throwsArgumentError);
    expect(() => validateApiBaseUrl('file:///tmp/socket'), throwsArgumentError);
  });

  test('captures rotated cookies from GET and sends them on PUT', () async {
    final store = MemorySessionStore();
    late http.Request putRequest;
    final api = testApi((request) async {
      if (request.method == 'GET') {
        return jsonResponse(
            {},
            200,
            {
              'set-cookie':
                  'customer_session=new-session; Path=/, customer_csrf=new-csrf; Path=/'
            });
      }
      putRequest = request;
      return jsonResponse({});
    }, store: store);
    await api.get('/rotate');
    await api.put('/protected');
    expect(store.values['customer_session'], 'new-session');
    expect(
        putRequest.headers['cookie'], contains('customer_session=new-session'));
    expect(putRequest.headers['x-csrf-token'], 'new-csrf');
  });

  test('401 clears secure session and notifies app once', () async {
    final store = MemorySessionStore()
      ..values.addAll({'customer_session': 'old', 'customer_csrf': 'csrf'});
    var expirations = 0;
    final api = testApi(
        (_) async => jsonResponse({'error': 'internal detail'}, 401),
        store: store,
        onExpired: () => expirations++);
    await api.restoreSession();
    await expectLater(
        api.get('/protected'),
        throwsA(isA<ApiException>()
            .having((e) => e.kind, 'kind', ApiErrorKind.authentication)));
    expect(store.values, isEmpty);
    expect(expirations, 1);
  });

  test('server detail is not exposed as customer message', () async {
    final api = testApi(
        (_) async => jsonResponse({'error': 'SQL table secret exploded'}, 503));
    await expectLater(
        api.get('/broken'),
        throwsA(isA<ApiException>().having(
            (e) => e.toString(), 'safe message', isNot(contains('SQL')))));
  });
}
