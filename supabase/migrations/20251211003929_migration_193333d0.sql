-- 1. Criar tabela de tokens de registro
CREATE TABLE IF NOT EXISTS device_registration_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone DEFAULT (now() + interval '30 days'),
  used_count integer DEFAULT 0,
  last_used_at timestamp with time zone NULL,
  is_active boolean DEFAULT true
);

-- Index para performance
CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id ON device_registration_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_token ON device_registration_tokens(token);
CREATE INDEX IF NOT EXISTS idx_device_tokens_active ON device_registration_tokens(is_active, expires_at);

-- Enable RLS
ALTER TABLE device_registration_tokens ENABLE ROW LEVEL SECURITY;

-- Policies: usuário pode ver seus próprios tokens
CREATE POLICY "Users can view their own tokens" 
  ON device_registration_tokens FOR SELECT 
  USING (auth.uid() = user_id);

-- Service role tem acesso total (para validação em register-device)
CREATE POLICY "Service role has full access to tokens" 
  ON device_registration_tokens FOR ALL 
  USING (current_setting('jwt.claims.role', true) = 'service_role')
  WITH CHECK (current_setting('jwt.claims.role', true) = 'service_role');

-- 2. Popular rustdesk_settings com configuração atual
INSERT INTO rustdesk_settings (id, host, relay, key)
VALUES (1, 'rustdesk.bwb.pt', 'rustdesk.bwb.pt', 'UzHEW0gpZLT6NIx3WAr9lvUG4Se2s7euUTKQ+SrvjJs=')
ON CONFLICT (id) DO UPDATE SET
  host = EXCLUDED.host,
  relay = EXCLUDED.relay,
  key = EXCLUDED.key;

COMMENT ON TABLE device_registration_tokens IS 'Tokens únicos para registro automático de dispositivos via QR code';
COMMENT ON COLUMN device_registration_tokens.token IS 'Token UUID único incluído no QR code para identificar o usuário';
COMMENT ON COLUMN device_registration_tokens.expires_at IS 'Data de expiração do token (padrão: 30 dias)';
COMMENT ON COLUMN device_registration_tokens.used_count IS 'Número de dispositivos registrados com este token';