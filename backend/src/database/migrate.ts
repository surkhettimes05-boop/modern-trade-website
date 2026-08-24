import "dotenv/config";
import { getMigrationDatabaseUrl } from "../config/environment.js";
import { runMigrations } from "./migrationRunner.js";

const applied = await runMigrations(getMigrationDatabaseUrl());
console.log(
  applied.length
    ? `Applied migrations: ${applied.join(", ")}`
    : "Database migrations are up to date",
);
