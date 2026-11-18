CREATE TABLE IF NOT EXISTS pasalho_lite_pricing_quotes (
  quote_id UUID PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('POS', 'COD')),
  store_reference UUID NOT NULL,
  customer_reference UUID,
  customer_phone_hash TEXT,
  cart_hash TEXT NOT NULL,
  payload JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  sale_reference TEXT,
  validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pasalho_lite_pricing_quotes_expiry
  ON pasalho_lite_pricing_quotes(expires_at);

