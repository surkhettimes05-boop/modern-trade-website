import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assertDevelopmentSeedEnvironment } from "../config/environment.js";
import { getPool, closePool } from "./connection.js";

assertDevelopmentSeedEnvironment();
const baseSql = await readFile(
  resolve(process.cwd(), "../database/development_seed.sql"),
  "utf8",
);
const customerSeedCandidates = [
  resolve(process.cwd(), "src/database/development_customer_seed.sql"),
  resolve(process.cwd(), "dist/database/development_customer_seed.sql"),
];
let customerCommerceSql: string | undefined;
for (const candidate of customerSeedCandidates) {
  try {
    customerCommerceSql = await readFile(candidate, "utf8");
    break;
  } catch {
    // Try the next source/compiled layout.
  }
}
if (!customerCommerceSql) {
  throw new Error("development_customer_seed.sql was not found");
}
const client = await getPool().connect();
try {
  await client.query("BEGIN");
  await client.query(baseSql);
  await client.query(customerCommerceSql);
  await client.query("COMMIT");
  console.log("Development seed applied for Nepal MVP");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await closePool();
}
