-- Corrigir RLS policies com sintaxe correta
-- 1. Drop old policies
DROP POLICY IF EXISTS "collaborators_view_permitted_devices" ON android_devices;
DROP POLICY IF EXISTS "collaborators_update_permitted_devices" ON android_devices;

-- 2. Recreate with simpler logic
CREATE POLICY "collaborators_view_permitted_devices"
ON android_devices FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM mesh_users u
    WHERE u.auth_user_id = auth.uid()
      AND u.user_type = 'colaborador'
      AND (
        -- Own devices
        android_devices.owner = u.id
        OR
        -- Devices in groups with hierarchical permission
        (android_devices.group_id IS NOT NULL AND has_group_access(u.id, android_devices.group_id))
      )
  )
);

CREATE POLICY "collaborators_update_permitted_devices"
ON android_devices FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM mesh_users u
    WHERE u.auth_user_id = auth.uid()
      AND u.user_type = 'colaborador'
      AND (
        -- Own devices
        android_devices.owner = u.id
        OR
        -- Devices in groups with hierarchical permission
        (android_devices.group_id IS NOT NULL AND has_group_access(u.id, android_devices.group_id))
      )
  )
);