-- Run once as the current database owner through an audited administrative
-- connection. Roles are created without passwords; set independent random
-- credentials through the database provider's secret workflow afterward.
-- This script intentionally affects only the current database's public schema.
\set ON_ERROR_STOP on

BEGIN;

-- Extension installation requires database-owner privileges. Provision the
-- extension used by migration 001 here so the migration role itself never
-- needs CREATE privilege on the database.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'storesync_migrator') THEN
    CREATE ROLE storesync_migrator LOGIN NOINHERIT NOSUPERUSER NOCREATEDB
      NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'storesync_app') THEN
    CREATE ROLE storesync_app LOGIN NOINHERIT NOSUPERUSER NOCREATEDB
      NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

ALTER ROLE storesync_migrator NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS;
ALTER ROLE storesync_app NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS;
REVOKE storesync_migrator FROM storesync_app;

-- PostgreSQL requires the current owner to be able to SET ROLE to a new
-- object owner. Grant this only for the duration of the ownership transfer.
DO $$
BEGIN
  IF current_user <> 'storesync_migrator' THEN
    EXECUTE format('GRANT storesync_migrator TO %I WITH ADMIN OPTION', current_user);
  END IF;
END
$$;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO storesync_migrator', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO storesync_app', current_database());
  EXECUTE format('REVOKE CREATE, TEMPORARY ON DATABASE %I FROM storesync_app', current_database());
END
$$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO storesync_migrator;
GRANT USAGE ON SCHEMA public TO storesync_app;

-- Transfer only application objects in public. Extension/system schemas are
-- outside this loop and remain provider-owned.
DO $$
DECLARE
  object_record RECORD;
BEGIN
  FOR object_record IN
    SELECT c.relkind, n.nspname, c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_depend extension_dependency
        ON extension_dependency.classid = 'pg_class'::regclass
       AND extension_dependency.objid = c.oid
       AND extension_dependency.deptype = 'e'
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p', 'S', 'v', 'm', 'f')
       AND extension_dependency.objid IS NULL
  LOOP
    EXECUTE format(
      'ALTER %s %I.%I OWNER TO storesync_migrator',
      CASE object_record.relkind
        WHEN 'S' THEN 'SEQUENCE'
        WHEN 'v' THEN 'VIEW'
        WHEN 'm' THEN 'MATERIALIZED VIEW'
        WHEN 'f' THEN 'FOREIGN TABLE'
        ELSE 'TABLE'
      END,
      object_record.nspname,
      object_record.relname
    );
  END LOOP;

  FOR object_record IN
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
      'ALTER FUNCTION %I.%I(%s) OWNER TO storesync_migrator',
      object_record.nspname,
      object_record.proname,
      object_record.arguments
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON FUNCTION %I.%I(%s) FROM PUBLIC',
      object_record.nspname,
      object_record.proname,
      object_record.arguments
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO storesync_app',
      object_record.nspname,
      object_record.proname,
      object_record.arguments
    );
  END LOOP;

  FOR object_record IN
    SELECT n.nspname, t.typname
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      LEFT JOIN pg_depend extension_dependency
        ON extension_dependency.classid = 'pg_type'::regclass
       AND extension_dependency.objid = t.oid
       AND extension_dependency.deptype = 'e'
     WHERE n.nspname = 'public'
       AND t.typtype IN ('d', 'e')
       AND extension_dependency.objid IS NULL
  LOOP
    EXECUTE format(
      'ALTER TYPE %I.%I OWNER TO storesync_migrator',
      object_record.nspname,
      object_record.typname
    );
  END LOOP;
END
$$;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO storesync_app;
-- Existing security evidence is append-only to the runtime role. This script
-- may run before the first migration, so migration 027 repeats these grants.
DO $$
BEGIN
  IF to_regclass('public.audit_events') IS NOT NULL THEN
    REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
      ON TABLE public.audit_events FROM storesync_app;
    GRANT SELECT, INSERT ON TABLE public.audit_events TO storesync_app;
  END IF;
  IF to_regclass('public.permission_denied_logs') IS NOT NULL THEN
    REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
      ON TABLE public.permission_denied_logs FROM storesync_app;
    GRANT SELECT, INSERT ON TABLE public.permission_denied_logs TO storesync_app;
  END IF;
END
$$;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO storesync_app;

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

DO $$
BEGIN
  IF current_user <> 'storesync_migrator' THEN
    EXECUTE format('REVOKE storesync_migrator FROM %I', current_user);
  END IF;
END
$$;

COMMIT;

\echo 'Role/grant setup complete. Set independent credentials outside this script, apply migrations as storesync_migrator, then run npm run verify:database-role as storesync_app.'
