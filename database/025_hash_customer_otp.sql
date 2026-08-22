-- OTPs are credentials. Widen the column for a keyed SHA-256 digest and
-- invalidate legacy plaintext values so no mixed verification mode is needed.
ALTER TABLE customer_otp
  ALTER COLUMN otp_code TYPE VARCHAR(128);

UPDATE customer_otp
   SET used_at = COALESCE(used_at, CURRENT_TIMESTAMP)
 WHERE used_at IS NULL;
