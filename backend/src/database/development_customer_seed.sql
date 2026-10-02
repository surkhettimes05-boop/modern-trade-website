-- Customer-commerce acceptance fixture. This remains development-only because
-- seed.ts enforces assertDevelopmentSeedEnvironment before executing it.

INSERT INTO products (
  sku, name_en, description_en, category_id, pack_size_en, unit_en,
  status, published_at, created_by
)
SELECT
  'COKE-500', 'Coke 500ml', 'Coca-Cola soft drink 500ml', categories.id,
  '500 ml', 'bottle', 'PUBLISHED', NOW(), 'development-seed'
FROM categories
WHERE slug = 'beverages'
ON CONFLICT (sku) DO UPDATE SET
  name_en = EXCLUDED.name_en,
  description_en = EXCLUDED.description_en,
  category_id = EXCLUDED.category_id,
  pack_size_en = EXCLUDED.pack_size_en,
  unit_en = EXCLUDED.unit_en,
  status = 'PUBLISHED',
  published_at = COALESCE(products.published_at, NOW());

INSERT INTO product_prices (product_id, store_id, price, currency_code)
SELECT products.id, stores.id, 125, 'NPR'
FROM products
CROSS JOIN stores
WHERE products.sku = 'COKE-500'
  AND stores.country_code = 'NP'
  AND NOT EXISTS (
    SELECT 1 FROM product_prices
    WHERE product_prices.product_id = products.id
      AND product_prices.store_id = stores.id
      AND product_prices.active = TRUE
  );

INSERT INTO batch_inventory (
  store_id, product_id, batch_id, expiry_date, quantity, cost
)
SELECT
  stores.id, products.id, 'DEMO-NP-COKE-500',
  CURRENT_DATE + INTERVAL '180 days', 50, 100
FROM stores
CROSS JOIN products
WHERE stores.country_code = 'NP'
  AND products.sku = 'COKE-500'
ON CONFLICT (store_id, product_id, batch_id) DO UPDATE SET
  quantity = GREATEST(batch_inventory.quantity, 50),
  expiry_date = EXCLUDED.expiry_date;
