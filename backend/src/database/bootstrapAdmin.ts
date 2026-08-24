import "dotenv/config";
import bcrypt from "bcrypt";
import { getPool, closePool } from "./connection.js";

const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
const username = process.env.BOOTSTRAP_ADMIN_USERNAME || "admin";
const email = process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@novamart.local";

if (
  process.env.NODE_ENV === "production" &&
  (!password || password === "StoreSync@2026")
) {
  throw new Error(
    "A unique BOOTSTRAP_ADMIN_PASSWORD is required; default bootstrap credentials are forbidden in production",
  );
}
if (
  !password ||
  password.length < 12 ||
  !/[A-Z]/.test(password) ||
  !/[a-z]/.test(password) ||
  !/[0-9]/.test(password) ||
  !/[^A-Za-z0-9]/.test(password)
) {
  throw new Error(
    "BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters and include upper, lower, number, and symbol",
  );
}

const passwordHash = await bcrypt.hash(password, 12);
const client = await getPool().connect();
try {
  await client.query("BEGIN");
  const organization = await client.query(
    `SELECT id FROM organizations WHERE country_code = 'NP' ORDER BY created_at LIMIT 1`,
  );
  if (!organization.rowCount)
    throw new Error("No Nepal organization exists; run migrations first");
  const store = await client.query(
    `SELECT id FROM stores WHERE organization_id = $1 ORDER BY created_at LIMIT 1`,
    [organization.rows[0].id],
  );
  if (!store.rowCount)
    throw new Error(
      "No store exists; run the development seed or create a store first",
    );
  const role = await client.query(
    `SELECT id, capabilities FROM roles WHERE role_key = 'platform_admin' AND is_active = TRUE LIMIT 1`,
  );
  if (!role.rowCount)
    throw new Error("Canonical platform_admin role is missing");
  await client.query(
    `INSERT INTO staff (staff_number, first_name, last_name, email, store_id, role, position, department, status, hire_date, username, password_hash, permissions, role_id, capabilities, scope_type, scope_store_ids, scope_organization_id, created_by)
     VALUES ('STF-BOOTSTRAP-ADMIN', 'Platform', 'Administrator', $1, $2, 'ADMIN', 'Platform Administrator', 'Management', 'ACTIVE', CURRENT_DATE, $3, $4, '{"all": true}'::jsonb, $5, COALESCE($6, '[]'::jsonb), 'GLOBAL', ARRAY[$2]::uuid[], $7, 'bootstrap-admin')
     ON CONFLICT (username) DO UPDATE SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash, role_id = EXCLUDED.role_id, capabilities = EXCLUDED.capabilities, scope_type = 'GLOBAL', scope_organization_id = EXCLUDED.scope_organization_id, status = 'ACTIVE', failed_login_attempts = 0, locked_until = NULL`,
    [
      email,
      store.rows[0].id,
      username,
      passwordHash,
      role.rows[0].id,
      JSON.stringify(role.rows[0].capabilities || []),
      organization.rows[0].id,
    ],
  );
  await client.query("COMMIT");
  console.log(
    `Bootstrap administrator '${username}' is ready for the Nepal organization`,
  );
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await closePool();
}
