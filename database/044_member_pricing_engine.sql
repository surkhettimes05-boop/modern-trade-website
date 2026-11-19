CREATE TABLE member_pricing_policies (
  policy_key TEXT PRIMARY KEY CHECK (policy_key = 'GLOBAL'),
  minimum_gross_margin_percent NUMERIC(5, 2) NOT NULL
    CHECK (minimum_gross_margin_percent >= 0 AND minimum_gross_margin_percent < 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO member_pricing_policies (policy_key, minimum_gross_margin_percent)
VALUES ('GLOBAL', 5.00)
ON CONFLICT (policy_key) DO NOTHING;

CREATE TABLE member_pricing_promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED', 'ARCHIVED')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by UUID NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  updated_by UUID NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT member_pricing_promotion_date_order CHECK (ends_at > starts_at)
);

CREATE INDEX idx_member_pricing_promotions_org_status
  ON member_pricing_promotions(organization_id, status, starts_at, ends_at);

CREATE TABLE member_pricing_promotion_skus (
  promotion_id UUID NOT NULL REFERENCES member_pricing_promotions(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  member_price NUMERIC(12, 2) NOT NULL CHECK (member_price > 0),
  PRIMARY KEY (promotion_id, product_id)
);

CREATE INDEX idx_member_pricing_promotion_skus_product
  ON member_pricing_promotion_skus(product_id);

CREATE TABLE member_pricing_promotion_categories (
  promotion_id UUID NOT NULL REFERENCES member_pricing_promotions(id) ON DELETE RESTRICT,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  PRIMARY KEY (promotion_id, category_id)
);

CREATE TABLE member_pricing_promotion_tiers (
  promotion_id UUID NOT NULL REFERENCES member_pricing_promotions(id) ON DELETE RESTRICT,
  tier_key VARCHAR(40) NOT NULL REFERENCES membership_tiers(tier_key) ON DELETE RESTRICT,
  PRIMARY KEY (promotion_id, tier_key)
);

CREATE TABLE member_pricing_promotion_channels (
  promotion_id UUID NOT NULL REFERENCES member_pricing_promotions(id) ON DELETE RESTRICT,
  channel VARCHAR(10) NOT NULL CHECK (channel IN ('POS', 'WEB', 'APP')),
  PRIMARY KEY (promotion_id, channel)
);

CREATE TABLE member_pricing_promotion_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id UUID NOT NULL REFERENCES member_pricing_promotions(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (version > 0),
  action VARCHAR(20) NOT NULL
    CHECK (action IN ('CREATED', 'UPDATED', 'ACTIVATED', 'PAUSED', 'ARCHIVED')),
  reason TEXT NOT NULL,
  actor_id UUID NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (promotion_id, version)
);

CREATE INDEX idx_member_pricing_promotion_history_promotion
  ON member_pricing_promotion_history(promotion_id, version DESC);

CREATE OR REPLACE FUNCTION prevent_member_pricing_history_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'member pricing promotion history is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER member_pricing_promotion_history_immutable
  BEFORE UPDATE OR DELETE ON member_pricing_promotion_history
  FOR EACH ROW EXECUTE FUNCTION prevent_member_pricing_history_mutation();

ALTER TABLE sale_items
  ADD COLUMN member_pricing_promotion_id UUID
    REFERENCES member_pricing_promotions(id) ON DELETE RESTRICT;

ALTER TABLE web_order_items
  ADD COLUMN member_pricing_promotion_id UUID
    REFERENCES member_pricing_promotions(id) ON DELETE RESTRICT;

CREATE INDEX idx_sale_items_member_pricing_promotion
  ON sale_items(member_pricing_promotion_id)
  WHERE member_pricing_promotion_id IS NOT NULL;

CREATE INDEX idx_web_order_items_member_pricing_promotion
  ON web_order_items(member_pricing_promotion_id)
  WHERE member_pricing_promotion_id IS NOT NULL;

ALTER TABLE member_pricing_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_pricing_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_pricing_promotion_skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_pricing_promotion_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_pricing_promotion_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_pricing_promotion_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_pricing_promotion_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'storesync_app') THEN
    CREATE POLICY storesync_backend_access ON member_pricing_policies
      FOR SELECT TO storesync_app USING (true);
    CREATE POLICY storesync_backend_access ON member_pricing_promotions
      FOR ALL TO storesync_app USING (true) WITH CHECK (true);
    CREATE POLICY storesync_backend_access ON member_pricing_promotion_skus
      FOR ALL TO storesync_app USING (true) WITH CHECK (true);
    CREATE POLICY storesync_backend_access ON member_pricing_promotion_categories
      FOR ALL TO storesync_app USING (true) WITH CHECK (true);
    CREATE POLICY storesync_backend_access ON member_pricing_promotion_tiers
      FOR ALL TO storesync_app USING (true) WITH CHECK (true);
    CREATE POLICY storesync_backend_access ON member_pricing_promotion_channels
      FOR ALL TO storesync_app USING (true) WITH CHECK (true);
    CREATE POLICY member_pricing_history_read ON member_pricing_promotion_history
      FOR SELECT TO storesync_app USING (true);
    CREATE POLICY member_pricing_history_insert ON member_pricing_promotion_history
      FOR INSERT TO storesync_app WITH CHECK (true);

    GRANT SELECT ON member_pricing_policies TO storesync_app;
    GRANT SELECT, INSERT, UPDATE ON member_pricing_promotions TO storesync_app;
    REVOKE DELETE ON member_pricing_promotions FROM storesync_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      member_pricing_promotion_skus,
      member_pricing_promotion_categories,
      member_pricing_promotion_tiers,
      member_pricing_promotion_channels
      TO storesync_app;
    GRANT SELECT, INSERT ON member_pricing_promotion_history TO storesync_app;
    REVOKE UPDATE, DELETE ON member_pricing_promotion_history FROM storesync_app;
    GRANT SELECT, UPDATE ON sale_items, web_order_items TO storesync_app;
  END IF;
END
$$;
