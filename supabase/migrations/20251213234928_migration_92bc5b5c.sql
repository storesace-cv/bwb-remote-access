ALTER TABLE public.android_devices
  DROP CONSTRAINT IF EXISTS android_devices_owner_fkey;

ALTER TABLE public.android_devices
  ADD CONSTRAINT android_devices_owner_fkey
  FOREIGN KEY (owner)
  REFERENCES public.mesh_users(id)
  ON DELETE SET NULL;