import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

enum ApiErrorKind {
  authentication,
  forbidden,
  conflict,
  rateLimit,
  server,
  timeout,
  network,
  invalidResponse,
  other
}

class ApiException implements Exception {
  const ApiException(this.message,
      {this.statusCode, this.kind = ApiErrorKind.other, this.diagnostic});
  final String message;
  final int? statusCode;
  final ApiErrorKind kind;
  final String? diagnostic;
  bool get isAuthenticationError => kind == ApiErrorKind.authentication;
  @override
  String toString() => message;
}

abstract interface class SecureSessionStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

class FlutterSecureSessionStore implements SecureSessionStore {
  const FlutterSecureSessionStore(
      [this.storage = const FlutterSecureStorage()]);
  final FlutterSecureStorage storage;
  @override
  Future<String?> read(String key) => storage.read(key: key);
  @override
  Future<void> write(String key, String value) =>
      storage.write(key: key, value: value);
  @override
  Future<void> delete(String key) => storage.delete(key: key);
}

typedef SessionExpiredCallback = FutureOr<void> Function();

String userMessage(Object error) {
  if (error is ApiException) return error.message;
  if (kDebugMode) debugPrint('Unexpected error: $error');
  return 'Something went wrong. Please try again.';
}

class ApiClient {
  ApiClient(
      {required this.baseUrl,
      http.Client? client,
      SecureSessionStore? sessionStore,
      this.onSessionExpired})
      : _client = client ?? http.Client(),
        _store = sessionStore ?? const FlutterSecureSessionStore();

  final String baseUrl;
  final http.Client _client;
  final SecureSessionStore _store;
  SessionExpiredCallback? onSessionExpired;
  String? _sessionToken;
  String? _csrfToken;
  bool _handlingUnauthorized = false;

  bool get hasSession => _sessionToken?.isNotEmpty == true;

  Future<void> restoreSession() async {
    _sessionToken = await _store.read('customer_session');
    _csrfToken = await _store.read('customer_csrf');
  }

  Uri _uri(String path, [Map<String, String>? query]) {
    final root = baseUrl.endsWith('/')
        ? baseUrl.substring(0, baseUrl.length - 1)
        : baseUrl;
    return Uri.parse('$root$path').replace(queryParameters: query);
  }

  Map<String, String> _headers({bool mutation = false}) {
    final headers = <String, String>{
      'accept': 'application/json',
      'content-type': 'application/json'
    };
    if (_sessionToken != null) {
      final cookies = <String>['customer_session=$_sessionToken'];
      if (_csrfToken != null) cookies.add('customer_csrf=$_csrfToken');
      headers['cookie'] = cookies.join('; ');
    }
    if (mutation && _csrfToken != null) headers['x-csrf-token'] = _csrfToken!;
    return headers;
  }

  Future<dynamic> get(String path, {Map<String, String>? query}) => _send(
      () => _client.get(_uri(path, query), headers: _headers()),
      const Duration(seconds: 15));
  Future<dynamic> post(String path, {Object? body}) => _send(
      () => _client.post(_uri(path),
          headers: _headers(mutation: true),
          body: jsonEncode(body ?? const {})),
      const Duration(seconds: 20));
  Future<dynamic> put(String path, {Object? body}) => _send(
      () => _client.put(_uri(path),
          headers: _headers(mutation: true),
          body: jsonEncode(body ?? const {})),
      const Duration(seconds: 20));
  Future<dynamic> delete(String path) => _send(
      () => _client.delete(_uri(path), headers: _headers(mutation: true)),
      const Duration(seconds: 15));

  Future<dynamic> _send(
      Future<http.Response> Function() request, Duration timeout) async {
    try {
      final response = await request().timeout(timeout);
      await _captureCookies(response);
      if (response.statusCode == 401) await _handleUnauthorized();
      return _decode(response);
    } on ApiException {
      rethrow;
    } on TimeoutException catch (error) {
      throw ApiException('The request timed out. Please try again.',
          kind: ApiErrorKind.timeout, diagnostic: '$error');
    } on SocketException catch (error) {
      throw ApiException('You appear to be offline. Check your connection.',
          kind: ApiErrorKind.network, diagnostic: '$error');
    } on http.ClientException catch (error) {
      throw ApiException('Could not connect to NOVA MART. Please try again.',
          kind: ApiErrorKind.network, diagnostic: '$error');
    }
  }

  Future<void> _captureCookies(http.Response response) async {
    final setCookie = response.headers['set-cookie'];
    if (setCookie == null) return;
    final session =
        RegExp(r'customer_session=([^;,]+)').firstMatch(setCookie)?.group(1);
    final csrf =
        RegExp(r'customer_csrf=([^;,]+)').firstMatch(setCookie)?.group(1);
    if (session != null && session.isNotEmpty) {
      _sessionToken = session;
      await _store.write('customer_session', session);
    }
    if (csrf != null && csrf.isNotEmpty) {
      _csrfToken = csrf;
      await _store.write('customer_csrf', csrf);
    }
  }

  Future<void> _handleUnauthorized() async {
    if (_handlingUnauthorized) return;
    _handlingUnauthorized = true;
    try {
      await clearSession();
      await onSessionExpired?.call();
    } finally {
      _handlingUnauthorized = false;
    }
  }

  dynamic _decode(http.Response response) {
    dynamic data;
    if (response.body.isNotEmpty) {
      try {
        data = jsonDecode(response.body);
      } on FormatException {
        data = response.body;
      }
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final diagnostic = data is Map
          ? data['error']?.toString() ?? data['message']?.toString()
          : data?.toString();
      final kind = switch (response.statusCode) {
        401 => ApiErrorKind.authentication,
        403 => ApiErrorKind.forbidden,
        409 => ApiErrorKind.conflict,
        429 => ApiErrorKind.rateLimit,
        >= 500 => ApiErrorKind.server,
        _ => ApiErrorKind.other,
      };
      final message = switch (kind) {
        ApiErrorKind.authentication =>
          'Your session has expired. Please sign in again.',
        ApiErrorKind.forbidden => 'You do not have permission to do that.',
        ApiErrorKind.conflict =>
          'The data changed. Please refresh and try again.',
        ApiErrorKind.rateLimit =>
          'Too many requests. Please wait and try again.',
        ApiErrorKind.server =>
          'NOVA MART is temporarily unavailable. Please try again shortly.',
        _ => 'We could not complete that request. Please try again.',
      };
      if (kDebugMode && diagnostic != null) {
        debugPrint('API ${response.statusCode}: $diagnostic');
      }
      throw ApiException(message,
          statusCode: response.statusCode, kind: kind, diagnostic: diagnostic);
    }
    return data;
  }

  Future<void> clearSession() async {
    _sessionToken = null;
    _csrfToken = null;
    await _store.delete('customer_session');
    await _store.delete('customer_csrf');
  }

  void close() => _client.close();
}
