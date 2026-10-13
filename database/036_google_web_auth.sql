-- Google web authentication identities
-- A Google account is an alternate sign-in credential for an existing
-- phone-verified Pasalho customer. We never auto-merge customers by email.

CREATE TABLE customer_external_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  provider VARCHAR(32) NOT NULL,
  provider_subject VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  display_name VARCHAR(255),
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  CONSTRAINT customer_external_identities_provider_allowed
    CHECK (provider IN ('GOOGLE')),
  CONSTRAINT customer_external_identities_provider_subject_unique
    UNIQUE (provider, provider_subject)
);

CREATE INDEX idx_customer_external_identities_customer
  ON customer_external_identities(customer_id);

ALTER TABLE customer_external_identities ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'storesync_app') THEN
    CREATE POLICY storesync_backend_access ON customer_external_identities
      FOR ALL TO storesync_app USING (true) WITH CHECK (true);
    GRANT SELECT, INSERT, UPDATE, DELETE ON customer_external_identities TO storesync_app;
  END IF;
END
$$;
