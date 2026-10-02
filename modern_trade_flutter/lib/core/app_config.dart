import 'package:flutter/foundation.dart';

enum AppEnvironment { development, staging, production }

class AppConfig {
  static const _configuredApiBaseUrl = String.fromEnvironment('API_BASE_URL');
  static const _environmentName = String.fromEnvironment(
    'APP_ENV',
    defaultValue: 'development',
  );

  static const _developmentApiBaseUrl =
      'https://storesync-backend-dg8z.onrender.com';

  static const maxCartQuantity = int.fromEnvironment(
    'MAX_CART_QUANTITY',
    defaultValue: 99,
  );
  static const supportPhone = String.fromEnvironment('SUPPORT_PHONE');
  static const privacyUrl = String.fromEnvironment('PRIVACY_POLICY_URL');
  static const termsUrl = String.fromEnvironment('TERMS_URL');

  static String get apiBaseUrl => _configuredApiBaseUrl.isEmpty
      ? _developmentApiBaseUrl
      : _configuredApiBaseUrl;

  static AppEnvironment get environment => switch (_environmentName) {
        'development' => AppEnvironment.development,
        'staging' => AppEnvironment.staging,
        'production' => AppEnvironment.production,
        _ => throw StateError(
            'APP_ENV must be development, staging, or production.',
          ),
      };

  /// Prevents an accidentally misconfigured binary from starting as a
  /// production release. Secrets must never be supplied through Dart defines;
  /// only public runtime configuration belongs here.
  static void validate({bool releaseMode = kReleaseMode}) {
    final selectedEnvironment = environment;
    if (maxCartQuantity < 1 || maxCartQuantity > 999) {
      throw StateError('MAX_CART_QUANTITY must be between 1 and 999.');
    }
    if (releaseMode && selectedEnvironment == AppEnvironment.development) {
      throw StateError(
        'Release builds must explicitly set APP_ENV=staging or production.',
      );
    }
    if (selectedEnvironment == AppEnvironment.production &&
        _configuredApiBaseUrl.isEmpty) {
      throw StateError('Production builds must explicitly set API_BASE_URL.');
    }
  }
}
