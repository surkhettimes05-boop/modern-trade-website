-- 043_creator_portal_otp_sessions
-- Isolated creator sessions; no reuse of staff or customer authentication cookies.
CREATE TABLE IF NOT EXISTS creator_portal_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE RESTRICT,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_creator_portal_sessions_active
  ON creator_portal_sessions(creator_id, expires_at DESC)
  WHERE revoked_at IS NULL;
ALTER TABLE creator_portal_sessions ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'storesync_app')
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies WHERE schemaname = 'public'
       AND tablename = 'creator_portal_sessions'
       AND policyname = 'storesync_backend_access'
     ) THEN
    CREATE POLICY storesync_backend_access ON public.creator_portal_sessions
      FOR ALL TO storesync_app USING (true) WITH CHECK (true);
  END IF;
END $$;
