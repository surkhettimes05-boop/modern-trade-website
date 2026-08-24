-- Give the fixed non-owner backend role explicit access through RLS while
-- keeping schema ownership and DDL with storesync_migrator. Provision both
-- roles with production_roles.sql before applying migrations.
DO $$
DECLARE
  table_record RECORD;
  function_record RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'storesync_app') THEN
    RAISE NOTICE 'storesync_app is absent; runtime grants are deferred';
    RETURN;
  END IF;

  REVOKE CREATE ON SCHEMA public FROM PUBLIC;
  GRANT USAGE ON SCHEMA public TO storesync_app;
  REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC;
  REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;

  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
    TO storesync_app;
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON TABLE public.schema_migrations FROM storesync_app;
  GRANT SELECT ON TABLE public.schema_migrations TO storesync_app;
  -- Security evidence is append-only for the compromised-runtime threat
  -- model. Retention and correction require the controlled migration role.
  REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON TABLE public.audit_events, public.permission_denied_logs
    FROM storesync_app;
  GRANT SELECT, INSERT
    ON TABLE public.audit_events, public.permission_denied_logs
    TO storesync_app;
  GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public
    TO storesync_app;

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
         AND policyname = 'storesync_backend_access'
    ) THEN
      IF table_record.tablename = 'schema_migrations' THEN
        EXECUTE format(
          'CREATE POLICY storesync_backend_access ON %I.%I FOR SELECT TO storesync_app USING (true)',
          table_record.schemaname,
          table_record.tablename
        );
      ELSE
        EXECUTE format(
          'CREATE POLICY storesync_backend_access ON %I.%I FOR ALL TO storesync_app USING (true) WITH CHECK (true)',
          table_record.schemaname,
          table_record.tablename
        );
      END IF;
    END IF;
  END LOOP;

  FOR function_record IN
    SELECT n.nspname,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS arguments
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      LEFT JOIN pg_depend extension_dependency
        ON extension_dependency.classid = 'pg_proc'::regclass
       AND extension_dependency.objid = p.oid
       AND extension_dependency.deptype = 'e'
     WHERE n.nspname = 'public'
       AND p.prokind IN ('f', 'w')
       AND extension_dependency.objid IS NULL
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON FUNCTION %I.%I(%s) FROM PUBLIC',
      function_record.nspname,
      function_record.proname,
      function_record.arguments
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO storesync_app',
      function_record.nspname,
      function_record.proname,
      function_record.arguments
    );
  END LOOP;
END
$$;

-- New objects created by the migration role inherit the runtime grants. Each
-- future table migration must still enable RLS and create the backend policy.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'storesync_app')
     AND current_user = 'storesync_migrator' THEN
    ALTER DEFAULT PRIVILEGES FOR ROLE storesync_migrator IN SCHEMA public
      REVOKE ALL ON TABLES FROM PUBLIC;
    ALTER DEFAULT PRIVILEGES FOR ROLE storesync_migrator IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO storesync_app;
    ALTER DEFAULT PRIVILEGES FOR ROLE storesync_migrator IN SCHEMA public
      REVOKE ALL ON SEQUENCES FROM PUBLIC;
    ALTER DEFAULT PRIVILEGES FOR ROLE storesync_migrator IN SCHEMA public
      GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO storesync_app;
    ALTER DEFAULT PRIVILEGES FOR ROLE storesync_migrator IN SCHEMA public
      REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
    ALTER DEFAULT PRIVILEGES FOR ROLE storesync_migrator IN SCHEMA public
      GRANT EXECUTE ON FUNCTIONS TO storesync_app;
  END IF;
END
$$;
