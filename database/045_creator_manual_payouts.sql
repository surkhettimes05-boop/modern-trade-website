-- 045_creator_manual_payouts
-- Admin-controlled settlement evidence. No automated withdrawal or payment rail.
CREATE TABLE IF NOT EXISTS creator_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE RESTRICT,
  amount_npr NUMERIC(14,2) NOT NULL CHECK (amount_npr > 0),
  payment_method VARCHAR(20) NOT NULL
    CHECK (payment_method IN ('BANK_TRANSFER','CASH','WALLET')),
  payment_reference VARCHAR(120) NOT NULL,
  note TEXT,
  idempotency_key VARCHAR(160) NOT NULL UNIQUE,
  created_by VARCHAR(120) NOT NULL,
  settled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_creator_payouts_creator_settled
  ON creator_payouts(creator_id, settled_at DESC);

CREATE OR REPLACE FUNCTION prevent_creator_payout_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'creator_payouts is append-only';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS creator_payouts_no_update ON creator_payouts;
CREATE TRIGGER creator_payouts_no_update
  BEFORE UPDATE OR DELETE ON creator_payouts
  FOR EACH ROW EXECUTE FUNCTION prevent_creator_payout_mutation();

ALTER TABLE creator_payouts ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'storesync_app')
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'creator_payouts'
          AND policyname = 'storesync_backend_access'
     ) THEN
    CREATE POLICY storesync_backend_access ON public.creator_payouts
      FOR ALL TO storesync_app USING (true) WITH CHECK (true);
  END IF;
END
$$;
