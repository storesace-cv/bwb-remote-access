-- View to normalize device grouping derived from the `notes` field.
-- It splits the first two pipe-separated segments into group/subgroup,
-- exposes the optional rustdesk_password and rustdesk_ip used for deep-links
-- and diagnostics, includes provisioning_status, and flags devices without
-- notes as unassigned.
CREATE OR REPLACE VIEW public.android_devices_grouping AS
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
  d.rustdesk_ip,
  d.provisioning_status,
  COALESCE(NULLIF(TRIM(SPLIT_PART(d.notes, '|', 1)), ''), 'Dispositivos por Adotar') AS group_name,
  NULLIF(TRIM(SPLIT_PART(d.notes, '|', 2)), '') AS subgroup_name,
  (COALESCE(TRIM(d.notes), '') = '') AS is_unassigned
FROM
  public.android_devices d;

GRANT SELECT ON public.android_devices_grouping TO authenticated;
GRANT SELECT ON public.android_devices_grouping TO service_role;

COMMENT ON VIEW public.android_devices_grouping IS 'Normalized view for device grouping derived from notes field, including grouping columns, rustdesk_password, rustdesk_ip and provisioning_status.';