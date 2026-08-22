import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:modern_trade_flutter/core/api_client.dart';

class MemorySessionStore implements SecureSessionStore {
  final values = <String, String>{};
  @override
  Future<void> delete(String key) async => values.remove(key);
  @override
  Future<String?> read(String key) async => values[key];
  @override
  Future<void> write(String key, String value) async => values[key] = value;
}

ApiClient testApi(Future<http.Response> Function(http.Request) handler,
        {MemorySessionStore? store, SessionExpiredCallback? onExpired}) =>
    ApiClient(
      baseUrl: 'https://example.test',
      client: MockClient(handler),
      sessionStore: store ?? MemorySessionStore(),
      onSessionExpired: onExpired,
    );

http.Response jsonResponse(Object? body,
        [int status = 200, Map<String, String>? headers]) =>
    http.Response(jsonEncode(body), status,
        headers: headers ?? {'content-type': 'application/json'});
