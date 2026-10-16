-- COD fulfillment cash custody and reconciliation.
-- Delivery/payment/inventory completion remains authoritative in WebOrderService.
-- This migration adds append-only evidence for cash collected from COD orders.

ALTER TABLE order_fulfillment
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(200),
  ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_fulfillment_one_active_per_order
  ON order_fulfillment(order_id)
  WHERE status NOT IN ('CANCELLED');

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_fulfillment_idempotency
  ON order_fulfillment(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS cod_cash_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES web_orders(id),
  store_id UUID NOT NULL REFERENCES stores(id),
  fulfillment_id UUID REFERENCES order_fulfillment(id),
  collected_by UUID,
  amount DECIMAL(12,2) NOT NULL CHECK (amount >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'NPR',
  idempotency_key VARCHAR(200) NOT NULL,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(order_id),
  UNIQUE(idempotency_key)
);

CREATE TABLE IF NOT EXISTS cod_cash_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES cod_cash_collections(id),
  store_id UUID NOT NULL REFERENCES stores(id),
  settled_by UUID,
  expected_amount DECIMAL(12,2) NOT NULL,
  counted_amount DECIMAL(12,2) NOT NULL,
  variance DECIMAL(12,2) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('MATCHED','DISCREPANCY','RESOLVED')),
  reason TEXT,
  idempotency_key VARCHAR(200) NOT NULL,
  settled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(collection_id),
  UNIQUE(idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_cod_cash_collections_store_unsettled
  ON cod_cash_collections(store_id, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_cod_cash_settlements_store
  ON cod_cash_settlements(store_id, settled_at DESC);

CREATE OR REPLACE FUNCTION reject_cod_cash_evidence_rewrite() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'COD cash evidence is immutable; append compensating evidence';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cod_cash_collections_immutable ON cod_cash_collections;
CREATE TRIGGER cod_cash_collections_immutable
BEFORE UPDATE OR DELETE ON cod_cash_collections
FOR EACH ROW EXECUTE FUNCTION reject_cod_cash_evidence_rewrite();

DROP TRIGGER IF EXISTS cod_cash_settlements_immutable ON cod_cash_settlements;
CREATE TRIGGER cod_cash_settlements_immutable
BEFORE UPDATE OR DELETE ON cod_cash_settlements
FOR EACH ROW EXECUTE FUNCTION reject_cod_cash_evidence_rewrite();

ALTER TABLE cod_cash_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE cod_cash_settlements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'storesync_app') THEN
    GRANT SELECT, INSERT ON cod_cash_collections, cod_cash_settlements TO storesync_app;

    DROP POLICY IF EXISTS cod_cash_collections_backend_access ON cod_cash_collections;
    CREATE POLICY cod_cash_collections_backend_access ON cod_cash_collections
      FOR ALL TO storesync_app USING (TRUE) WITH CHECK (TRUE);

    DROP POLICY IF EXISTS cod_cash_settlements_backend_access ON cod_cash_settlements;
    CREATE POLICY cod_cash_settlements_backend_access ON cod_cash_settlements
      FOR ALL TO storesync_app USING (TRUE) WITH CHECK (TRUE);
  END IF;
END
$$;
