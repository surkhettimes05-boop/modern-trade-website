import "dotenv/config";
import { closePool } from "./connection.js";
import { verifyDatabaseSecurityPosture } from "./databaseSecurity.js";

try {
  await verifyDatabaseSecurityPosture();
  console.log("Runtime database role posture verified");
} finally {
  await closePool();
}
