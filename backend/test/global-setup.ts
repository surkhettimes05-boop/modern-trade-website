import pg from 'pg';
import { access } from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { assertDedicatedTestTarget, pgBin, pgData, testUrl } from './database-config';
import { runMigrations } from '../src/database/migrationRunner';

export default async function globalSetup() {
  process.env.NODE_ENV = 'test';
  assertDedicatedTestTarget();
  try { await access(resolve(pgData, 'PG_VERSION')); }
  catch { execFileSync(`${pgBin}\\initdb.exe`, ['-D', pgData, '-U', 'postgres', '-A', 'trust', '--no-locale', '--encoding=UTF8'], { timeout: 60000 }); }
  try { execFileSync(`${pgBin}\\pg_isready.exe`, ['-h', '127.0.0.1', '-p', '55432', '-d', 'postgres'], { timeout: 5000 }); }
  catch {
    const server = spawn(`${pgBin}\\postgres.exe`, ['-D', pgData, '-p', '55432', '-h', '127.0.0.1'], {
      detached: true, stdio: 'ignore', windowsHide: true,
    });
    server.unref();
    let ready = false;
    for (let attempt = 0; attempt < 60 && !ready; attempt++) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
      try { execFileSync(`${pgBin}\\pg_isready.exe`, ['-h', '127.0.0.1', '-p', '55432', '-d', 'postgres'], { timeout: 2000 }); ready = true; } catch {}
    }
    if (!ready) throw new Error('Dedicated PostgreSQL test cluster did not become ready');
  }
  const admin = new pg.Client({ connectionString: 'postgresql://postgres@127.0.0.1:55432/postgres' });
  await admin.connect();
  try {
    const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = 'storesync_jest_test'");
    if (!existing.rowCount) await admin.query('CREATE DATABASE storesync_jest_test');
  } finally { await admin.end(); }
  const bootstrapUrl = new URL(testUrl); bootstrapUrl.search = '';
  const client = new pg.Client({ connectionString: bootstrapUrl.toString() });
  await client.connect();
  try { await client.query('DROP SCHEMA IF EXISTS storesync_jest_test CASCADE; CREATE SCHEMA storesync_jest_test'); }
  finally { await client.end(); }
  await runMigrations(testUrl);
}
