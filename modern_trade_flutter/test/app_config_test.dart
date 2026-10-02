import 'package:flutter_test/flutter_test.dart';
import 'package:modern_trade_flutter/core/app_config.dart';

void main() {
  test('development configuration is valid outside release mode', () {
    expect(AppConfig.environment, AppEnvironment.development);
    expect(Uri.parse(AppConfig.apiBaseUrl).scheme, 'https');
    expect(() => AppConfig.validate(releaseMode: false), returnsNormally);
  });

  test(
    'release configuration must explicitly select a non-development env',
    () {
      expect(() => AppConfig.validate(releaseMode: true), throwsStateError);
    },
  );
}
