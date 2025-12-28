ALTER TABLE public.android_devices
  ADD COLUMN updated_at timestamptz NULL DEFAULT now();