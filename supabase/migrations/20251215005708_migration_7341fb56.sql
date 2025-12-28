CREATE TABLE IF NOT EXISTS device_provisioning_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unused'
    CHECK (status IN ('unused','claimed','expired','consumed','locked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  last_client_ip TEXT
);

ALTER TABLE device_provisioning_codes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'device_provisioning_codes' 
      AND policyname = 'Users can view own provisioning codes'
  ) THEN
    CREATE POLICY "Users can view own provisioning codes"
    ON device_provisioning_codes
    FOR SELECT
    USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'device_provisioning_codes' 
      AND policyname = 'Users can create own provisioning codes'
  ) THEN
    CREATE POLICY "Users can create own provisioning codes"
    ON device_provisioning_codes
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'device_provisioning_codes' 
      AND policyname = 'Users can update own provisioning codes'
  ) THEN
    CREATE POLICY "Users can update own provisioning codes"
    ON device_provisioning_codes
    FOR UPDATE
    USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'device_provisioning_codes' 
      AND policyname = 'Users can delete own provisioning codes'
  ) THEN
    CREATE POLICY "Users can delete own provisioning codes"
    ON device_provisioning_codes
    FOR DELETE
    USING (auth.uid() = user_id);
  END IF;
END
$$;

------------------------------------------------------------

CREATE TABLE IF NOT EXISTS device_provisioning_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id UUID NOT NULL REFERENCES device_provisioning_codes(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','revoked','expired')),
  device_hint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ,
  client_ip TEXT,
  nonce_hash TEXT,
  used_by_device_id TEXT
);

ALTER TABLE device_provisioning_tokens ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'device_provisioning_tokens' 
      AND policyname = 'Service role only (tokens)'
  ) THEN
    CREATE POLICY "Service role only (tokens)"
    ON device_provisioning_tokens
    FOR ALL
    USING (FALSE)
    WITH CHECK (FALSE);
  END IF;
END
$$;

------------------------------------------------------------

CREATE TABLE IF NOT EXISTS device_provisioning_attempts (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  client_ip TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  success BOOLEAN NOT NULL
);

CREATE INDEX IF NOT EXISTS device_provisioning_attempts_code_time_idx
  ON device_provisioning_attempts (code, attempted_at DESC);

CREATE INDEX IF NOT EXISTS device_provisioning_attempts_ip_time_idx
  ON device_provisioning_attempts (client_ip, attempted_at DESC);

ALTER TABLE device_provisioning_attempts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'device_provisioning_attempts' 
      AND policyname = 'Service role only (attempts)'
  ) THEN
    CREATE POLICY "Service role only (attempts)"
    ON device_provisioning_attempts
    FOR ALL
    USING (FALSE)
    WITH CHECK (FALSE);
  END IF;
END
$$;