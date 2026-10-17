CREATE TABLE IF NOT EXISTS customer_favorite_products (
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  -- Keep the id even if a product is later removed so the customer can see
  -- and remove an unavailable saved item from Favorites.
  product_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (customer_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_favorite_products_recent
  ON customer_favorite_products(customer_id, created_at DESC);

ALTER TABLE customer_favorite_products ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'storesync_app') THEN
    GRANT SELECT, INSERT, DELETE ON customer_favorite_products TO storesync_app;
    DROP POLICY IF EXISTS customer_favorite_products_backend_access
      ON customer_favorite_products;
    CREATE POLICY customer_favorite_products_backend_access
      ON customer_favorite_products
      FOR ALL TO storesync_app USING (TRUE) WITH CHECK (TRUE);
  END IF;
END
$$;
