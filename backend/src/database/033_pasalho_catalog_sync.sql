-- PASALHO owns product identity. Commerce stores a synchronized projection
-- for customer discovery while keeping its own organization-level prices.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS barcode VARCHAR(100),
  ADD COLUMN IF NOT EXISTS brand_name VARCHAR(255);

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS pasalo_category_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_pasalo_category
  ON categories(pasalo_category_id)
  WHERE pasalo_category_id IS NOT NULL;
