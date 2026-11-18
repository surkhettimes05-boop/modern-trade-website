DROP INDEX IF EXISTS member_pricing_quotes_sale_reference_key;

CREATE INDEX IF NOT EXISTS idx_member_pricing_quotes_sale_reference
  ON member_pricing_quotes(claimed_sale_reference)
  WHERE claimed_sale_reference IS NOT NULL;

ALTER TABLE web_orders
  ADD COLUMN member_pricing_quote_id UUID
    REFERENCES member_pricing_quotes(id) ON DELETE RESTRICT,
  ADD COLUMN membership_tier_snapshot VARCHAR(40),
  ADD COLUMN pricing_rule_version INTEGER,
  ADD COLUMN pricing_quote_snapshot JSONB;

ALTER TABLE web_orders
  ADD CONSTRAINT web_orders_membership_tier_snapshot_check
    CHECK (
      membership_tier_snapshot IS NULL OR
      membership_tier_snapshot IN ('REGISTERED_MEMBER', 'FOUNDING_1000')
    ),
  ADD CONSTRAINT web_orders_pricing_rule_version_check
    CHECK (pricing_rule_version IS NULL OR pricing_rule_version > 0),
  ADD CONSTRAINT web_orders_pricing_quote_snapshot_check
    CHECK (
      pricing_quote_snapshot IS NULL OR
      jsonb_typeof(pricing_quote_snapshot) = 'object'
    );

ALTER TABLE web_order_items
  ADD COLUMN regular_unit_price NUMERIC(12, 2),
  ADD COLUMN applied_unit_price NUMERIC(12, 2),
  ADD COLUMN promotion_snapshot JSONB,
  ADD COLUMN membership_tier_snapshot VARCHAR(40),
  ADD COLUMN member_pricing_quote_id UUID
    REFERENCES member_pricing_quotes(id) ON DELETE RESTRICT,
  ADD COLUMN pricing_rule_version INTEGER,
  ADD COLUMN currency VARCHAR(3);

ALTER TABLE web_order_items
  ADD CONSTRAINT web_order_items_regular_price_check
    CHECK (regular_unit_price IS NULL OR regular_unit_price >= 0),
  ADD CONSTRAINT web_order_items_applied_price_check
    CHECK (applied_unit_price IS NULL OR applied_unit_price >= 0),
  ADD CONSTRAINT web_order_items_promotion_snapshot_check
    CHECK (
      promotion_snapshot IS NULL OR
      jsonb_typeof(promotion_snapshot) = 'object'
    ),
  ADD CONSTRAINT web_order_items_membership_tier_snapshot_check
    CHECK (
      membership_tier_snapshot IS NULL OR
      membership_tier_snapshot IN ('REGISTERED_MEMBER', 'FOUNDING_1000')
    ),
  ADD CONSTRAINT web_order_items_pricing_rule_version_check
    CHECK (pricing_rule_version IS NULL OR pricing_rule_version > 0);

CREATE INDEX idx_web_orders_member_pricing_quote
  ON web_orders(member_pricing_quote_id)
  WHERE member_pricing_quote_id IS NOT NULL;

CREATE INDEX idx_web_order_items_member_pricing_quote
  ON web_order_items(member_pricing_quote_id)
  WHERE member_pricing_quote_id IS NOT NULL;
