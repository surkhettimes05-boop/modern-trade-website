process.env.NODE_ENV = 'test';
const testUrl = process.env.TEST_DATABASE_URL || 'postgresql://postgres@127.0.0.1:55433/storesync_jest_test?options=-c%20search_path%3Dstoresync_jest_test%2Cpublic';
const parsed = new URL(testUrl);
if (parsed.hostname !== '127.0.0.1' || parsed.port !== '55433' || parsed.pathname !== '/storesync_jest_test') {
  throw new Error('Refusing non-dedicated test database target');
}
process.env.TEST_DATABASE_URL = testUrl;
process.env.PAYMENT_ENCRYPTION_KEY ||= '0'.repeat(64);
process.env.OTP_HASH_SECRET ||= 'test-only-otp-hash-secret-at-least-32-bytes';
process.env.ENCRYPTION_KEY ||= 'test-only-offline-encryption-key-at-least-32-bytes';
process.env.SIGNATURE_SECRET ||= 'test-only-offline-signature-secret-at-least-32-bytes';
