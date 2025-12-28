ALTER TABLE public.android_devices
  ADD COLUMN IF NOT EXISTS rustdesk_password TEXT;

DROP VIEW IF EXISTS public.android_devices_grouping;

CREATE VIEW public.android_devices_grouping AS
SELECT
  d.id,
  d.device_id,
  d.owner,
  d.mesh_username,
  d.friendly_name,
  d.notes,
  d.last_seen_at,
  d.created_at,
  d.deleted_at,
  d.rustdesk_password,
  COALESCE(NULLIF(TRIM(SPLIT_PART(d.notes, '|', 1)), ''), 'Dispositivos por Adotar') AS group_name,
  NULLIF(TRIM(SPLIT_PART(d.notes, '|', 2)), '') AS subgroup_name,
  (COALESCE(TRIM(d.notes), '') = '') AS is_unassigned
FROM
  public.android_devices d;

GRANT SELECT ON public.android_devices_grouping TO authenticated;
GRANT SELECT ON public.android_devices_grouping TO service_role;

COMMENT ON VIEW public.android_devices_grouping IS 'Normalized view for device grouping derived from notes field, including grouping columns and rustdesk_password.';