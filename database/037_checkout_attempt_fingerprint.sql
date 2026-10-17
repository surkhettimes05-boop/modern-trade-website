-- Store the canonical logical request associated with a checkout key so a
-- retry cannot silently resolve to an order created for different inputs.
ALTER TABLE web_orders
  ADD COLUMN IF NOT EXISTS idempotency_request_fingerprint CHAR(64);
