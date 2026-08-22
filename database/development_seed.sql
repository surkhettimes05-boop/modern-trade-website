-- Repeatable Nepal MVP development data. Run only against a local development database.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
INSERT INTO organizations (organization_name, legal_name, country_code, default_currency_code, default_locale, default_timezone, tax_regime, payment_providers, feature_flags)
VALUES ('NOVA MART Nepal', 'NOVA MART Retail Nepal Pvt. Ltd.', 'NP', 'NPR', 'en-NP', 'Asia/Kathmandu', 'IRD', '["cash"]'::jsonb, '{"ENABLE_VAT_TAX": true}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO stores (name_en, address_en, phone, email, status, published_at, created_by, organization_id, country_code, currency_code, locale, timezone, tax_regime, payment_providers, feature_flags)
SELECT seed.name, seed.address, seed.phone, seed.email, 'PUBLISHED', NOW(), 'development-seed', o.id, 'NP', 'NPR', 'en-NP', 'Asia/Kathmandu', 'IRD', '["cash"]'::jsonb, '{"ENABLE_VAT_TAX": true}'::jsonb
FROM (VALUES
  ('NOVA MART Thamel', 'Thamel, Kathmandu, Nepal', '+977-1-5550101', 'thamel@novamart.local'),
  ('NOVA MART New Baneshwor', 'New Baneshwor, Kathmandu, Nepal', '+977-1-5550102', 'baneshwor@novamart.local')
) AS seed(name, address, phone, email)
CROSS JOIN (SELECT id FROM organizations WHERE country_code = 'NP' ORDER BY created_at LIMIT 1) o
WHERE NOT EXISTS (SELECT 1 FROM stores s WHERE s.name_en = seed.name);

INSERT INTO loyalty_programs(program_id, organization_id, store_id, name, description,
  points_per_currency, currency_value_per_point, is_active, enable_tiers,
  earn_npr_per_point, redemption_min_points, redemption_max_points, rule_version, created_by, metadata)
SELECT 'NEPAL-PILOT-1', o.id, s.id, 'StoreSync Nepal Rewards',
  'Earn 1 point per NPR 100 on completed POS and delivered COD purchases.',
  0.01, 1.00, TRUE, FALSE, 100, 10, 5000, 1, 'development-seed',
  '{"market":"NP","currency":"NPR","locale":"en-NP","tiers":false,"mvp":true}'::jsonb
FROM organizations o
JOIN LATERAL (SELECT id FROM stores WHERE organization_id=o.id ORDER BY created_at LIMIT 1) s ON TRUE
WHERE o.country_code='NP'
ON CONFLICT (program_id) DO UPDATE SET organization_id=EXCLUDED.organization_id,
  store_id=EXCLUDED.store_id, is_active=TRUE, enable_tiers=FALSE,
  earn_npr_per_point=100, redemption_min_points=10, redemption_max_points=5000, rule_version=1;

INSERT INTO categories (slug, name_en, description_en, status, published_at, created_by)
VALUES
  ('groceries', 'Groceries', 'Daily grocery essentials', 'PUBLISHED', NOW(), 'development-seed'),
  ('beverages', 'Beverages', 'Drinks and refreshments', 'PUBLISHED', NOW(), 'development-seed'),
  ('instant-noodles', 'Instant noodles', 'Single packs and family multipacks', 'PUBLISHED', NOW(), 'development-seed'),
  ('laundry', 'Laundry', 'Detergents and fabric care', 'PUBLISHED', NOW(), 'development-seed'),
  ('hair-care', 'Hair care', 'Shampoo and daily hair care', 'PUBLISHED', NOW(), 'development-seed')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO products (sku, name_en, description_en, category_id, pack_size_en, unit_en, status, published_at, created_by)
SELECT seed.sku, seed.name, seed.description, categories.id, seed.pack_size, seed.unit, 'PUBLISHED', NOW(), 'development-seed'
FROM (VALUES
  ('RICE-5KG', 'Premium Basmati Rice 5kg', 'Long-grain premium rice', 'groceries', '5 kg', 'bag'),
  ('OIL-1L', 'Sunflower Oil 1L', 'Refined sunflower cooking oil', 'groceries', '1 L', 'bottle'),
  ('WATER-1L', 'Mineral Water 1L', 'Purified mineral water', 'beverages', '1 L', 'bottle'),
  ('NOODLES-FAM', 'Instant Noodles Family Pack', 'Five-pack instant noodles', 'instant-noodles', '5 x 70 g', 'pack'),
  ('LAUNDRY-1KG', 'Everyday Laundry Detergent 1kg', 'Everyday laundry detergent', 'laundry', '1 kg', 'pack'),
  ('SHAMPOO-340', 'Daily Care Shampoo 340ml', 'Daily care shampoo', 'hair-care', '340 ml', 'bottle')
) AS seed(sku, name, description, category_slug, pack_size, unit)
JOIN categories ON categories.slug = seed.category_slug
ON CONFLICT (sku) DO NOTHING;

INSERT INTO product_prices (product_id, store_id, price, original_price, currency_code)
SELECT p.id, s.id,
  CASE p.sku WHEN 'RICE-5KG' THEN 799 WHEN 'OIL-1L' THEN 179 WHEN 'WATER-1L' THEN 25 WHEN 'NOODLES-FAM' THEN 120 WHEN 'LAUNDRY-1KG' THEN 245 WHEN 'SHAMPOO-340' THEN 299 END,
  CASE p.sku WHEN 'RICE-5KG' THEN 999 WHEN 'OIL-1L' THEN 219 WHEN 'WATER-1L' THEN 30 ELSE NULL END,
  'NPR'
FROM products p
CROSS JOIN stores s
WHERE p.sku IN ('RICE-5KG', 'OIL-1L', 'WATER-1L', 'NOODLES-FAM', 'LAUNDRY-1KG', 'SHAMPOO-340')
  AND NOT EXISTS (SELECT 1 FROM product_prices pp WHERE pp.product_id = p.id AND pp.store_id = s.id);

INSERT INTO suppliers (supplier_code, supplier_name, contact_person, phone, email, city, payment_terms, status, approval_status, created_by)
VALUES ('SUP-DEMO-NP', 'Nepal Wholesale Supply', 'Demo Supplier', '9841234567', 'supplier@novamart.local', 'Kathmandu', 'NET30', 'ACTIVE', 'APPROVED', 'development-seed')
ON CONFLICT (supplier_code) DO NOTHING;

INSERT INTO warehouses (warehouse_code, warehouse_name, store_id, address, status)
SELECT 'WH-THAMEL', 'Kathmandu Thamel Stock Room', id, address_en, 'ACTIVE'
FROM stores WHERE name_en = 'NOVA MART Thamel'
ON CONFLICT (warehouse_code) DO NOTHING;

INSERT INTO batch_inventory (store_id, product_id, batch_id, expiry_date, quantity, cost)
SELECT stores.id, products.id, 'DEMO-NP-' || products.sku, CURRENT_DATE + INTERVAL '180 days', 50, 100
FROM stores CROSS JOIN products
WHERE stores.country_code = 'NP'
ON CONFLICT (store_id, product_id, batch_id) DO NOTHING;

INSERT INTO content_pages (slug, title_en, content_en, meta_description_en, status, published_at, created_by)
VALUES ('welcome', 'Welcome to NOVA MART', 'Quality everyday essentials for Nepal households.', 'NOVA MART Nepal development content', 'PUBLISHED', NOW(), 'development-seed')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO customers (phone_normalized, phone_hash, phone_masked, preferred_name, email, language, status, verification_status, enrollment_source)
VALUES ('9812345678', encode(digest('9812345678', 'sha256'), 'hex'), '98XXXX5678', 'Demo Customer', 'customer@novamart.local', 'en', 'ACTIVE', 'VERIFIED', 'SEED')
ON CONFLICT (phone_normalized) DO NOTHING;

INSERT INTO staff (staff_number, first_name, last_name, email, store_id, role, position, department, status, hire_date, username, password_hash, permissions, role_id, capabilities, scope_type, scope_store_ids, created_by)
SELECT 'STF-LOCAL-ADMIN', 'Local', 'Administrator', 'admin@novamart.local', stores.id, 'ADMIN', 'System Administrator', 'Management', 'ACTIVE', CURRENT_DATE, 'admin', crypt('StoreSync@2026', gen_salt('bf', 12)), '{"all": true}'::jsonb, roles.id, roles.capabilities, 'GLOBAL', ARRAY[stores.id]::uuid[], 'development-seed'
FROM stores CROSS JOIN roles
WHERE stores.name_en = 'NOVA MART Thamel' AND roles.role_key = 'platform_admin'
ON CONFLICT (staff_number) DO UPDATE SET store_id = EXCLUDED.store_id, password_hash = EXCLUDED.password_hash, status = 'ACTIVE', role_id = EXCLUDED.role_id, capabilities = EXCLUDED.capabilities, scope_type = EXCLUDED.scope_type, scope_store_ids = EXCLUDED.scope_store_ids;
