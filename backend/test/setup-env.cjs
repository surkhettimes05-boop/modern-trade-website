process.env.NODE_ENV = 'test';
const testUrl = 'postgresql://postgres@127.0.0.1:55432/storesync_jest_test?options=-c%20search_path%3Dstoresync_jest_test%2Cpublic';
const parsed = new URL(testUrl);
if (parsed.hostname !== '127.0.0.1' || parsed.port !== '55432' || parsed.pathname !== '/storesync_jest_test') {
  throw new Error('Refusing non-dedicated test database target');
}
process.env.TEST_DATABASE_URL = testUrl;
process.env.PAYMENT_ENCRYPTION_KEY ||= '0'.repeat(64);
