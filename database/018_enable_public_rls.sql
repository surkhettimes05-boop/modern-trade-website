-- Enable RLS on every public table.
-- The application backend connects as the database owner and continues to work;
-- direct anon/authenticated Supabase Data API access is denied until explicit
-- table policies are added.
DO $$
DECLARE
  table_record RECORD;
BEGIN
  FOR table_record IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      table_record.schemaname,
      table_record.tablename
    );
  END LOOP;
END
$$;
