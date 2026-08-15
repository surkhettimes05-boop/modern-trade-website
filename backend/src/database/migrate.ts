import "dotenv/config";
import { getDatabaseUrl } from "../config/environment.js";
import { runMigrations } from "./migrationRunner.js";

const applied = await runMigrations(getDatabaseUrl());
console.log(
  applied.length
    ? `Applied migrations: ${applied.join(", ")}`
    : "Database migrations are up to date",
);
