-- Keep platform administrators able to perform the core operations that they
-- supervise. Route middleware still enforces capability and store scope.
UPDATE roles
SET capabilities = capabilities || '["shifts.manage", "reconciliation.manage", "devices.manage"]'::jsonb
WHERE role_key = 'platform_admin'
  AND NOT capabilities @> '["shifts.manage", "reconciliation.manage", "devices.manage"]'::jsonb;
