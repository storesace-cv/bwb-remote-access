UPDATE public.android_devices AS d
SET owner = NULL,
    mesh_username = NULL
WHERE owner IS NOT NULL
  AND owner NOT IN (
    SELECT id FROM public.mesh_users
  );

ALTER TABLE public.android_devices
DROP CONSTRAINT IF EXISTS android_devices_owner_fkey;

ALTER TABLE public.android_devices
ADD CONSTRAINT android_devices_owner_fkey
  FOREIGN KEY (owner)
  REFERENCES public.mesh_users(id)
  ON DELETE SET NULL;