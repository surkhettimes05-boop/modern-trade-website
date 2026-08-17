import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

export function postgresBinary(name: string): string {
  const executable = process.platform === 'win32' ? `${name}.exe` : name;
  const configured = process.env.PG_BIN;
  if (configured) return resolve(configured, executable);
  try {
    const command = process.platform === 'win32' ? 'where.exe' : 'which';
    return execFileSync(command, [executable], { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
  } catch {
    throw new Error(`PostgreSQL binary '${executable}' was not found. Install PostgreSQL, set PG_BIN, or provide TEST_DATABASE_URL for an existing test database.`);
  }
}
export const pgData = resolve(process.cwd(), '.test-postgres-data');
export const TEST_PG_PORT = 55433;
export const testUrl = process.env.TEST_DATABASE_URL || `postgresql://postgres@127.0.0.1:${TEST_PG_PORT}/storesync_jest_test?options=-c%20search_path%3Dstoresync_jest_test%2Cpublic`;

export function assertDedicatedTestTarget(url = testUrl): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('Test database lifecycle requires NODE_ENV=test');
  const parsed = new URL(url);
  if (parsed.hostname !== '127.0.0.1' || parsed.port !== String(TEST_PG_PORT) || parsed.pathname !== '/storesync_jest_test') {
    throw new Error('Refusing non-dedicated test database target');
  }
}
