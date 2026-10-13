-- Pasalho Founding 1,000 Release 1
-- Verified customers only; founder numbers are allocated under a row lock.

CREATE TABLE founding_campaign_state (
  campaign_key TEXT PRIMARY KEY,
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  allocated_count INTEGER NOT NULL DEFAULT 0 CHECK (allocated_count >= 0 AND allocated_count <= capacity),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO founding_campaign_state (campaign_key, capacity)
VALUES ('FOUNDING_1000', 1000)
ON CONFLICT (campaign_key) DO NOTHING;

CREATE TABLE founding_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_key TEXT NOT NULL REFERENCES founding_campaign_state(campaign_key),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  founder_number INTEGER NOT NULL CHECK (founder_number BETWEEN 1 AND 1000),
  display_name VARCHAR(120) NOT NULL,
  ward VARCHAR(80) NOT NULL,
  acquisition_source VARCHAR(64) NOT NULL DEFAULT 'direct',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT founding_members_campaign_customer_unique UNIQUE (campaign_key, customer_id),
  CONSTRAINT founding_members_campaign_number_unique UNIQUE (campaign_key, founder_number)
);

CREATE INDEX idx_founding_members_joined_at ON founding_members(joined_at DESC);
CREATE INDEX idx_founding_members_source ON founding_members(acquisition_source);

ALTER TABLE founding_campaign_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE founding_members ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'storesync_app') THEN
    CREATE POLICY storesync_backend_access ON founding_campaign_state
      FOR ALL TO storesync_app USING (true) WITH CHECK (true);
    CREATE POLICY storesync_backend_access ON founding_members
      FOR ALL TO storesync_app USING (true) WITH CHECK (true);
    GRANT SELECT, INSERT, UPDATE, DELETE ON founding_campaign_state, founding_members TO storesync_app;
  END IF;
END
$$;
