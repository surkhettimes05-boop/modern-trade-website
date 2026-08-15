# Database migrations

`npm run db:migrate` is the canonical database initialization command. It applies the ordered raw SQL files declared in `src/database/migrations.ts` and records their SHA-256 checksums in `schema_migrations`.

For a new database, set `DATABASE_URL` and run the command once. Re-running it is safe: applied migrations are skipped, while edits to an already-applied migration fail with a checksum error.

For Supabase, copy `backend/.env.supabase.example` to your local environment, replace the connection-string placeholders with the value from Supabase Dashboard → Connect, and keep `DATABASE_SSL=true`. Then run `npm run db:migrate` from the `backend` directory. The existing PostgreSQL migrations are used unchanged.

The numbered identifiers form the supported clean-install baseline. Historical SQL files are retained because their deployment history is unknown; they must not be executed independently or alphabetically. Existing deployments that predate `schema_migrations` require a reviewed baseline-marking procedure before using this runner. The runner intentionally does not guess which legacy files were previously applied.

Test resets are separate from production migration behavior. Jest uses only the repository-owned PostgreSQL cluster on `127.0.0.1:55432`, database `storesync_jest_test`, and its harness-owned schema. Production migration code never drops databases or schemas.
