import { execFileSync } from 'node:child_process';
import { pgBin, pgData } from './database-config';

export default async function globalTeardown() {
  try { execFileSync(`${pgBin}\\pg_ctl.exe`, ['-D', pgData, '-m', 'fast', 'stop'], { timeout: 60000 }); } catch {}
}
