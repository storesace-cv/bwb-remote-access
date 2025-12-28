-- Criar tabela para sessões de registro
CREATE TABLE IF NOT EXISTS device_registration_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes'),
  ip_address TEXT,
  user_agent TEXT,
  geolocation JSONB,
  status TEXT NOT NULL DEFAULT 'awaiting_device' CHECK (status IN ('awaiting_device', 'completed', 'expired', 'cancelled')),
  matched_device_id TEXT,
  matched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_registration_sessions_user_id ON device_registration_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_registration_sessions_status ON device_registration_sessions(status);
CREATE INDEX IF NOT EXISTS idx_registration_sessions_expires_at ON device_registration_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_registration_sessions_clicked_at ON device_registration_sessions(clicked_at);

-- RLS policies
ALTER TABLE device_registration_sessions ENABLE ROW LEVEL SECURITY;

-- Users podem ver suas próprias sessões
CREATE POLICY "Users can view own sessions" ON device_registration_sessions
  FOR SELECT USING (auth.uid() = user_id);

-- Users podem inserir suas próprias sessões
CREATE POLICY "Users can insert own sessions" ON device_registration_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users podem atualizar suas próprias sessões
CREATE POLICY "Users can update own sessions" ON device_registration_sessions
  FOR UPDATE USING (auth.uid() = user_id);

-- Função para auto-expirar sessões
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

-- Comentários para documentação
COMMENT ON TABLE device_registration_sessions IS 'Sessões de registro de dispositivos - permite rastrear quando user clicou em "Adicionar Dispositivo"';
COMMENT ON COLUMN device_registration_sessions.status IS 'awaiting_device: aguardando device conectar | completed: device matched | expired: timeout | cancelled: user cancelou';
COMMENT ON COLUMN device_registration_sessions.matched_device_id IS 'device_id do android_devices quando matched';