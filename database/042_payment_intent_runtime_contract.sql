-- Align the canonical payment intent schema with the runtime payment contract.
-- Keep expansion_phase2_schema.sql column names authoritative and add only
-- operational fields that cannot be represented by the existing columns.

ALTER TABLE payment_intents
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider_payment_url VARCHAR(500);

CREATE INDEX IF NOT EXISTS idx_payment_intents_store_id
  ON payment_intents(store_id);
