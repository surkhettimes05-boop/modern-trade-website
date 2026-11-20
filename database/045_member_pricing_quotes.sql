ALTER TABLE member_pricing_policies
  ADD COLUMN pricing_rule_version INTEGER NOT NULL DEFAULT 1
    CHECK (pricing_rule_version > 0);

CREATE TABLE member_pricing_quotes (
  id UUID PRIMARY KEY,
  quote_payload JSONB NOT NULL CHECK (jsonb_typeof(quote_payload) = 'object'),
  token_hash CHAR(64) NOT NULL UNIQUE,
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  claimed_sale_reference VARCHAR(200),
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT member_pricing_quote_expiry CHECK (expires_at > issued_at),
  CONSTRAINT member_pricing_quote_claim_state CHECK (
    (claimed_sale_reference IS NULL AND claimed_at IS NULL) OR
    (claimed_sale_reference IS NOT NULL AND claimed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX member_pricing_quotes_sale_reference_key
  ON member_pricing_quotes(claimed_sale_reference)
  WHERE claimed_sale_reference IS NOT NULL;

CREATE INDEX idx_member_pricing_quotes_expiry
  ON member_pricing_quotes(expires_at);

ALTER TABLE member_pricing_quotes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'storesync_app') THEN
    CREATE POLICY storesync_service_quote_access ON member_pricing_quotes
      FOR ALL TO storesync_app USING (true) WITH CHECK (true);
    GRANT SELECT, INSERT, UPDATE ON member_pricing_quotes TO storesync_app;
    REVOKE DELETE ON member_pricing_quotes FROM storesync_app;
  END IF;
END
$$;
