-- Explicit deny-by-default policies for direct Supabase Data API access.
-- The application uses the backend PostgreSQL connection for all data access.
DO $$
DECLARE
  table_record RECORD;
BEGIN
  FOR table_record IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = table_record.schemaname
        AND tablename = table_record.tablename
        AND policyname = 'deny_direct_api_access'
    ) THEN
      -- Supabase creates these roles automatically, but a standard PostgreSQL
      -- installation (including the disposable Jest database) may not have
      -- them. Keep the migration repeat-safe and portable in both setups.
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
         AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE format(
          'CREATE POLICY deny_direct_api_access ON %I.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
          table_record.schemaname,
          table_record.tablename
        );
      END IF;
    END IF;
  END LOOP;
END
$$;
