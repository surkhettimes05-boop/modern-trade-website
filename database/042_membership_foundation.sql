-- Pasalho membership foundation
-- Free launch tiers: REGISTERED_MEMBER and FOUNDING_1000
-- Authoritative membership source of truth is held in the modern-trade database.

CREATE TABLE IF NOT EXISTS membership_tiers (
  tier_key VARCHAR(40) PRIMARY KEY CHECK (tier_key IN ('REGISTERED_MEMBER', 'FOUNDING_1000')),
  name VARCHAR(80) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO membership_tiers (tier_key, name, description)
VALUES
  ('REGISTERED_MEMBER', 'Registered Member', 'Free launch membership tier for verified customers.'),
  ('FOUNDING_1000', 'Founding 1000', 'Founding membership tier allocated only by the system before the campaign closes.')
ON CONFLICT (tier_key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = TRUE;

CREATE TABLE IF NOT EXISTS customer_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  tier_key VARCHAR(40) NOT NULL REFERENCES membership_tiers(tier_key),
  membership_number INTEGER NOT NULL CHECK (membership_number > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CANCELLED')),
  status_reason TEXT,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_status_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  suspended_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT customer_membership_unique_customer_org UNIQUE (customer_id, organization_id),
  CONSTRAINT customer_membership_unique_org_number UNIQUE (organization_id, membership_number)
);

CREATE INDEX IF NOT EXISTS idx_customer_memberships_customer ON customer_memberships(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_memberships_org ON customer_memberships(organization_id);
CREATE INDEX IF NOT EXISTS idx_customer_memberships_tier ON customer_memberships(tier_key);
CREATE INDEX IF NOT EXISTS idx_customer_memberships_status ON customer_memberships(status);

CREATE TABLE IF NOT EXISTS membership_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id UUID NOT NULL REFERENCES customer_memberships(id) ON DELETE CASCADE,
  from_status VARCHAR(20),
  to_status VARCHAR(20) NOT NULL CHECK (to_status IN ('ACTIVE', 'SUSPENDED', 'CANCELLED')),
  changed_by UUID,
  reason TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_membership_status_history_membership ON membership_status_history(membership_id);
CREATE INDEX IF NOT EXISTS idx_membership_status_history_created ON membership_status_history(created_at DESC);

CREATE TABLE IF NOT EXISTS membership_campaign_state (
  campaign_key TEXT PRIMARY KEY,
  tier_key VARCHAR(40) NOT NULL REFERENCES membership_tiers(tier_key),
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  allocated_count INTEGER NOT NULL DEFAULT 0 CHECK (allocated_count >= 0 AND allocated_count <= capacity),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO membership_campaign_state (campaign_key, tier_key, capacity)
VALUES ('FOUNDING_1000', 'FOUNDING_1000', 1000)
ON CONFLICT (campaign_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS membership_campaign_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_key TEXT NOT NULL REFERENCES membership_campaign_state(campaign_key),
  membership_id UUID NOT NULL REFERENCES customer_memberships(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  membership_number INTEGER NOT NULL CHECK (membership_number > 0),
  allocated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_key, customer_id),
  UNIQUE (membership_id),
  UNIQUE (campaign_key, membership_number)
);

CREATE INDEX IF NOT EXISTS idx_membership_campaign_allocations_customer ON membership_campaign_allocations(customer_id);
CREATE INDEX IF NOT EXISTS idx_membership_campaign_allocations_campaign ON membership_campaign_allocations(campaign_key);

ALTER TABLE customer_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_campaign_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_campaign_allocations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'storesync_app') THEN
    CREATE POLICY storesync_backend_access ON customer_memberships
      FOR ALL TO storesync_app USING (true) WITH CHECK (true);
    CREATE POLICY storesync_backend_access ON membership_status_history
      FOR ALL TO storesync_app USING (true) WITH CHECK (true);
    CREATE POLICY storesync_backend_access ON membership_campaign_state
      FOR ALL TO storesync_app USING (true) WITH CHECK (true);
    CREATE POLICY storesync_backend_access ON membership_campaign_allocations
      FOR ALL TO storesync_app USING (true) WITH CHECK (true);
    GRANT SELECT, INSERT, UPDATE, DELETE ON customer_memberships, membership_status_history, membership_campaign_state, membership_campaign_allocations TO storesync_app;
  END IF;
END $$;
