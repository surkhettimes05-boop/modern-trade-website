import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assertDevelopmentSeedEnvironment } from "../config/environment.js";
import { getPool, closePool } from "./connection.js";

assertDevelopmentSeedEnvironment();
const sql = await readFile(
  resolve(process.cwd(), "../database/development_seed.sql"),
  "utf8",
);
const client = await getPool().connect();
try {
  await client.query("BEGIN");
  await client.query(sql);
  await client.query("COMMIT");
  console.log("Development seed applied for Nepal MVP");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await closePool();
}
