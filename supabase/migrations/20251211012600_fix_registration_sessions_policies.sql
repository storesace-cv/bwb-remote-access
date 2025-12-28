-- Migration segura: recria policies se necessário
-- Esta versão remove policies existentes antes de recriá-las

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own sessions" ON device_registration_sessions;
DROP POLICY IF EXISTS "Users can insert own sessions" ON device_registration_sessions;
DROP POLICY IF EXISTS "Users can update own sessions" ON device_registration_sessions;

-- Recreate policies
CREATE POLICY "Users can view own sessions" ON device_registration_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions" ON device_registration_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions" ON device_registration_sessions
  FOR UPDATE USING (auth.uid() = user_id);

-- Verificar se função existe, caso contrário criar
CREATE OR REPLACE FUNCTION expire_old_registration_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE device_registration_sessions
  SET status = 'expired',
      updated_at = NOW()
  WHERE status = 'awaiting_device'
    AND expires_at < NOW();
END;
$$;