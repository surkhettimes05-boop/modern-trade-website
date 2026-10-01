-- Password hashing and verification must remain available in runtimes that do
-- not support Node.js native addons (for example Cloudflare Workers).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'storesync_app') THEN
    GRANT EXECUTE ON FUNCTION public.crypt(text, text) TO storesync_app;
    GRANT EXECUTE ON FUNCTION public.gen_salt(text, integer) TO storesync_app;
  END IF;
END
$$;
