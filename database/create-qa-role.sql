\set ON_ERROR_STOP on

-- Extensions are provisioned by the privileged database owner, never by the
-- least-privilege runtime role used by the seed and application containers.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

SELECT format(
  'CREATE ROLE storesync_app LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'app_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'storesync_app')
\gexec

ALTER ROLE storesync_app NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS;
REVOKE storesync_migrator FROM storesync_app;
GRANT CONNECT ON DATABASE storesync_qa TO storesync_app;
REVOKE CREATE, TEMPORARY ON DATABASE storesync_qa FROM storesync_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO storesync_app;
