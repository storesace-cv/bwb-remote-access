ALTER TABLE public.android_devices
  ADD COLUMN IF NOT EXISTS rustdesk_ip TEXT;

CREATE TABLE IF NOT EXISTS public.device_ambiguity_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id TEXT NOT NULL,
  rustdesk_ip TEXT,
  reason TEXT NOT NULL,
  admin_mesh_user_id UUID NOT NULL REFERENCES public.mesh_users(id) ON DELETE RESTRICT,
  candidate_sessions JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

ALTER TABLE public.device_ambiguity_events ENABLE ROW LEVEL SECURITY;