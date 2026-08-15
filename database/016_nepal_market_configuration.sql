-- Switch the configured launch market to Nepal without rewriting prior migration checksums.
UPDATE country_configurations
SET country_name = 'Nepal', default_currency_code = 'NPR', default_locale = 'en-NP',
    default_timezone = 'Asia/Kathmandu', tax_regime = 'IRD',
    available_payment_providers = '["esewa", "khalti", "cash"]'::jsonb,
    address_format = '{"fields":[{"key":"line1","label":"Street Address","required":true},{"key":"line2","label":"Area","required":false},{"key":"city","label":"City","required":true},{"key":"district","label":"District","required":true},{"key":"postal_code","label":"Postal Code","required":false}],"display_order":["line1","line2","city","district","postal_code"]}'::jsonb,
    phone_format = '^[9][6-9][0-9]{8}$', postal_code_format = '^[0-9]{5}$'
WHERE country_code = 'NP';

UPDATE organizations
SET organization_name = 'NOVA MART Nepal', legal_name = 'NOVA MART Retail Nepal Pvt. Ltd.',
    country_code = 'NP', default_currency_code = 'NPR', default_locale = 'en-NP',
    default_timezone = 'Asia/Kathmandu', tax_regime = 'IRD',
    payment_providers = '["cash"]'::jsonb, feature_flags = '{"ENABLE_VAT_TAX": true}'::jsonb
WHERE country_code = 'IN';

UPDATE stores
SET country_code = 'NP', currency_code = 'NPR', locale = 'en-NP', timezone = 'Asia/Kathmandu',
    tax_regime = 'IRD', payment_providers = '["cash"]'::jsonb,
    feature_flags = '{"ENABLE_VAT_TAX": true}'::jsonb,
    name_en = CASE WHEN name_en ILIKE '%Koregaon%' THEN 'NOVA MART Thamel' WHEN name_en ILIKE '%Camp%' THEN 'NOVA MART New Baneshwor' ELSE name_en END,
    address_en = CASE WHEN name_en ILIKE '%Koregaon%' THEN 'Thamel, Kathmandu, Nepal' WHEN name_en ILIKE '%Camp%' THEN 'New Baneshwor, Kathmandu, Nepal' ELSE address_en END
WHERE organization_id IN (SELECT id FROM organizations WHERE country_code = 'NP');

UPDATE product_prices SET currency_code = 'NPR' WHERE currency_code = 'INR';
