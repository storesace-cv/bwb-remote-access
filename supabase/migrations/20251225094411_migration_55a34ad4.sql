DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'android_devices'
      AND column_name = 'provisioning_status'
  ) THEN
    ALTER TABLE public.android_devices
      ADD COLUMN provisioning_status text NOT NULL DEFAULT 'ready';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'android_devices_provisioning_status_check'
  ) THEN
    ALTER TABLE public.android_devices
      ADD CONSTRAINT android_devices_provisioning_status_check
      CHECK (provisioning_status IN ('provisioning','ready'));
  END IF;
END
$$;