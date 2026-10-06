-- psql variables: organization_id, store_id, organization_name, legal_name,
-- store_name, store_address, store_phone. Supply actual business values.
-- Never seeds products, prices, stock, customers, credentials, or live zones.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO organizations (id, organization_name, legal_name, country_code,
  default_currency_code, default_locale, default_timezone, tax_regime, payment_providers)
VALUES (:'organization_id'::uuid, :'organization_name', :'legal_name', 'NP',
  'NPR', 'en-NP', 'Asia/Kathmandu', 'IRD', '["cash"]'::jsonb)
ON CONFLICT (id) DO NOTHING;
INSERT INTO stores (id, organization_id, name_en, address_en, phone, status,
  is_temporarily_closed, country_code, currency_code, locale, timezone,
  tax_regime, payment_providers, created_by)
VALUES (:'store_id'::uuid, :'organization_id'::uuid, :'store_name', :'store_address',
  :'store_phone', 'DRAFT', TRUE, 'NP', 'NPR', 'en-NP', 'Asia/Kathmandu',
  'IRD', '["cash"]'::jsonb, 'production-bootstrap')
ON CONFLICT (id) DO NOTHING;
INSERT INTO nepal_provinces (code, name_en, name_ne)
VALUES ('KAR', 'Karnali Province', 'कर्णाली प्रदेश')
ON CONFLICT (code) DO UPDATE SET name_en = EXCLUDED.name_en, name_ne = EXCLUDED.name_ne;

INSERT INTO nepal_districts (province_id, code, name_en, name_ne)
SELECT p.id, 'SUR', 'Surkhet', 'सुर्खेत'
FROM nepal_provinces p
WHERE p.code = 'KAR'
ON CONFLICT (code) DO UPDATE SET province_id = EXCLUDED.province_id, name_en = EXCLUDED.name_en, name_ne = EXCLUDED.name_ne;

INSERT INTO nepal_municipalities (district_id, code, name_en, name_ne, municipality_type)
SELECT d.id, 'BIR', 'Birendranagar Municipality', 'वीरेन्द्रनगर नगरपालिका', 'Municipality'
FROM nepal_districts d
WHERE d.code = 'SUR'
ON CONFLICT (code) DO UPDATE SET district_id = EXCLUDED.district_id, name_en = EXCLUDED.name_en, name_ne = EXCLUDED.name_ne;

INSERT INTO nepal_wards (municipality_id, ward_number, name_en)
SELECT m.id, ward_number, 'Birendranagar Ward ' || ward_number
FROM nepal_municipalities m
CROSS JOIN generate_series(1, 16) AS ward_number
WHERE m.code = 'BIR'
ON CONFLICT (municipality_id, ward_number) DO UPDATE SET name_en = EXCLUDED.name_en;

COMMIT;
