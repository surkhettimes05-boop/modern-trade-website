import { resolve } from 'node:path';

export const pgBin = 'C:\\Program Files\\PostgreSQL\\18\\bin';
export const pgData = resolve(process.cwd(), '.test-postgres-data');
export const testUrl = 'postgresql://postgres@127.0.0.1:55432/storesync_jest_test?options=-c%20search_path%3Dstoresync_jest_test%2Cpublic';

export function assertDedicatedTestTarget(url = testUrl): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('Test database lifecycle requires NODE_ENV=test');
  const parsed = new URL(url);
  if (parsed.hostname !== '127.0.0.1' || parsed.port !== '55432' || parsed.pathname !== '/storesync_jest_test') {
    throw new Error('Refusing non-dedicated test database target');
  }
}
