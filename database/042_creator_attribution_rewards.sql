-- 042_creator_attribution_rewards
-- Central source of truth for creator referrals and rewards across online + POS sales.
-- Reward rate is stored as a percentage (1.00 = 1%); monetary values are NPR.

CREATE TABLE IF NOT EXISTS creators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_code VARCHAR(32) NOT NULL UNIQUE,
  display_name VARCHAR(120) NOT NULL,
  contact_phone VARCHAR(20),
  contact_email VARCHAR(255),
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','PAUSED','SUSPENDED','CLOSED')),
  referral_slug VARCHAR(48) NOT NULL UNIQUE,
  created_by VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS creator_referral_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE RESTRICT,
  visit_token_hash VARCHAR(64) NOT NULL UNIQUE,
  landing_path TEXT,
  campaign_code VARCHAR(64),
  visitor_fingerprint_hash VARCHAR(64),
  expires_at TIMESTAMPTZ NOT NULL,
  converted_customer_id UUID REFERENCES customers(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_creator_referral_visits_creator_created
  ON creator_referral_visits(creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_creator_referral_visits_expiry
  ON creator_referral_visits(expires_at);

CREATE TABLE IF NOT EXISTS creator_customer_attributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL UNIQUE REFERENCES customers(id) ON DELETE RESTRICT,
  creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE RESTRICT,
  referral_visit_id UUID REFERENCES creator_referral_visits(id) ON DELETE RESTRICT,
  attribution_method VARCHAR(16) NOT NULL
    CHECK (attribution_method IN ('LINK','QR','MANUAL_CODE')),
  attributed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(120) NOT NULL DEFAULT 'SYSTEM'
);
CREATE INDEX IF NOT EXISTS idx_creator_attribution_creator
  ON creator_customer_attributions(creator_id, attributed_at DESC);

CREATE TABLE IF NOT EXISTS creator_reward_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  default_rate_percent NUMERIC(5,2) NOT NULL DEFAULT 1.00
    CHECK (default_rate_percent >= 0 AND default_rate_percent <= 10),
  attribution_window_days INTEGER NOT NULL DEFAULT 30
    CHECK (attribution_window_days BETWEEN 1 AND 90),
  hold_days INTEGER NOT NULL DEFAULT 14
    CHECK (hold_days BETWEEN 0 AND 90),
  updated_by VARCHAR(120) NOT NULL DEFAULT 'SYSTEM',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO creator_reward_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS creator_purchase_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  source_system VARCHAR(16) NOT NULL CHECK (source_system IN ('COMMERCE','POS')),
  source_transaction_id VARCHAR(100) NOT NULL,
  source_transaction_number VARCHAR(100),
  currency VARCHAR(3) NOT NULL DEFAULT 'NPR' CHECK (currency = 'NPR'),
  eligible_spend_npr NUMERIC(14,2) NOT NULL CHECK (eligible_spend_npr >= 0),
  reward_rate_percent NUMERIC(5,2) NOT NULL CHECK (reward_rate_percent >= 0),
  reward_amount_npr NUMERIC(14,2) NOT NULL CHECK (reward_amount_npr >= 0),
  event_status VARCHAR(16) NOT NULL DEFAULT 'PENDING'
    CHECK (event_status IN ('PENDING','APPROVED','REVERSED','PAID')),
  eligible_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  available_at TIMESTAMPTZ NOT NULL,
  reversal_of_event_id UUID REFERENCES creator_purchase_events(id) ON DELETE RESTRICT,
  payload_hash VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source_system, source_transaction_id)
);
CREATE INDEX IF NOT EXISTS idx_creator_purchase_events_creator
  ON creator_purchase_events(creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_creator_purchase_events_customer
  ON creator_purchase_events(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_creator_purchase_events_pending
  ON creator_purchase_events(event_status, available_at);

CREATE TABLE IF NOT EXISTS creator_reward_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE RESTRICT,
  purchase_event_id UUID REFERENCES creator_purchase_events(id) ON DELETE RESTRICT,
  entry_type VARCHAR(16) NOT NULL CHECK (entry_type IN ('EARN','REVERSAL','PAYOUT','ADJUSTMENT')),
  amount_npr NUMERIC(14,2) NOT NULL,
  idempotency_key VARCHAR(160) NOT NULL UNIQUE,
  note TEXT,
  actor VARCHAR(120) NOT NULL DEFAULT 'SYSTEM',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_creator_reward_ledger_creator
  ON creator_reward_ledger(creator_id, created_at DESC);

CREATE TABLE IF NOT EXISTS creator_integration_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system VARCHAR(16) NOT NULL CHECK (source_system IN ('COMMERCE','POS')),
  event_key VARCHAR(160) NOT NULL UNIQUE,
  payload_hash VARCHAR(64) NOT NULL,
  processing_status VARCHAR(16) NOT NULL DEFAULT 'RECEIVED'
    CHECK (processing_status IN ('RECEIVED','PROCESSED','REJECTED')),
  error_code VARCHAR(80),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_creator_integration_events_status
  ON creator_integration_events(processing_status, received_at);

-- Immutable financial evidence: corrections are compensating ledger entries.
CREATE OR REPLACE FUNCTION prevent_creator_reward_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'creator_reward_ledger is append-only';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS creator_reward_ledger_no_update ON creator_reward_ledger;
CREATE TRIGGER creator_reward_ledger_no_update
  BEFORE UPDATE OR DELETE ON creator_reward_ledger
  FOR EACH ROW EXECUTE FUNCTION prevent_creator_reward_ledger_mutation();

-- Every new runtime table must follow the backend's explicit RLS policy.
DO $$
DECLARE
  target_table TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'creators',
    'creator_referral_visits',
    'creator_customer_attributions',
    'creator_reward_settings',
    'creator_purchase_events',
    'creator_reward_ledger',
    'creator_integration_events'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'storesync_app')
       AND NOT EXISTS (
         SELECT 1 FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename = target_table
            AND policyname = 'storesync_backend_access'
       ) THEN
      EXECUTE format(
        'CREATE POLICY storesync_backend_access ON public.%I FOR ALL TO storesync_app USING (true) WITH CHECK (true)',
        target_table
      );
    END IF;
  END LOOP;
END
$$;
