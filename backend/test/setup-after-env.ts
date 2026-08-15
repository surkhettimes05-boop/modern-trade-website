import { afterAll, beforeEach, expect } from '@jest/globals';
import { closePool, getPool } from '../src/database/connection.js';
import { redisService } from '../src/services/redisService.js';

afterAll(async () => {
  await closePool();
  await redisService.disconnect();
});
beforeEach(async () => {
  const pool = getPool();
  const testPath = expect.getState().testPath || '';
  if (testPath.includes('otpService')) await pool.query('DELETE FROM customer_otp');
  if (testPath.includes('ledgerService')) await pool.query('DELETE FROM loyalty_ledger');
  if (testPath.includes('analyticsPipelineService')) await pool.query('DELETE FROM event_queue');
  if (testPath.includes('public.test')) await pool.query('DELETE FROM contact_submissions');
});
