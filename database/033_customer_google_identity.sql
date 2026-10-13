-- Google customer identity linking.
-- Google proves identity; Pasalho remains authoritative for customer/session state.

CREATE TABLE IF NOT EXISTS customer_auth_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    provider VARCHAR(20) NOT NULL,
    provider_uid VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    display_name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT customer_auth_identity_provider CHECK (provider IN ('GOOGLE')),
    CONSTRAINT customer_auth_identity_unique_provider_uid UNIQUE (provider, provider_uid)
);

CREATE INDEX IF NOT EXISTS idx_customer_auth_identities_customer
  ON customer_auth_identities(customer_id);

CREATE TABLE IF NOT EXISTS customer_auth_link_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash CHAR(64) NOT NULL UNIQUE,
    provider VARCHAR(20) NOT NULL,
    provider_uid VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    display_name VARCHAR(255),
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT customer_auth_link_provider CHECK (provider IN ('GOOGLE'))
);

CREATE INDEX IF NOT EXISTS idx_customer_auth_link_attempts_provider_uid
  ON customer_auth_link_attempts(provider, provider_uid);
CREATE INDEX IF NOT EXISTS idx_customer_auth_link_attempts_expires
  ON customer_auth_link_attempts(expires_at);

ALTER TABLE customer_auth_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_auth_link_attempts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'storesync_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON TABLE customer_auth_identities, customer_auth_link_attempts
      TO storesync_app;

    DROP POLICY IF EXISTS storesync_backend_access ON customer_auth_identities;
    CREATE POLICY storesync_backend_access
      ON customer_auth_identities FOR ALL TO storesync_app
      USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS storesync_backend_access ON customer_auth_link_attempts;
    CREATE POLICY storesync_backend_access
      ON customer_auth_link_attempts FOR ALL TO storesync_app
      USING (true) WITH CHECK (true);
  END IF;
END
$$;
