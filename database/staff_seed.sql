-- Local placeholder administrator. Use `npm run bootstrap-admin` to set a
-- private password; this seed intentionally contains no usable credential.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO staff (
  staff_number, first_name, last_name, email, store_id, role,
  position, department, status, hire_date, username, password_hash,
  permissions, created_by
)
SELECT
  'STF-LOCAL-ADMIN', 'Local', 'Administrator',
  'admin@storesync.local', stores.id, 'ADMIN', 'System Administrator',
  'Management', 'ACTIVE', CURRENT_DATE, 'admin',
  crypt(encode(gen_random_bytes(32), 'hex'), gen_salt('bf', 12)),
  '{"all": true}'::jsonb, 'bootstrap'
FROM stores ORDER BY created_at LIMIT 1
ON CONFLICT (staff_number) DO UPDATE SET
  username = EXCLUDED.username,
  role = 'ADMIN',
  status = 'ACTIVE',
  permissions = '{"all": true}'::jsonb;
