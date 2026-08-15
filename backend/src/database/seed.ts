import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getDatabaseUrl } from "../config/environment.js";
import { query, closePool } from "./connection.js";

void getDatabaseUrl();
const sql = await readFile(
  resolve(process.cwd(), "../database/development_seed.sql"),
  "utf8",
);
await query("BEGIN");
try {
  await query(sql);
  await query("COMMIT");
  console.log("Development seed applied for Nepal MVP");
} catch (error) {
  await query("ROLLBACK");
  throw error;
} finally {
  await closePool();
}
