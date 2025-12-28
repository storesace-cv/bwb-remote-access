-- Step 17: Create audit log table for permission changes
CREATE TABLE IF NOT EXISTS mesh_permission_audit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES mesh_users(id),
  collaborator_id UUID NOT NULL REFERENCES mesh_users(id),
  group_id UUID NOT NULL REFERENCES mesh_groups(id),
  action TEXT NOT NULL CHECK (action IN ('grant', 'revoke')),
  permission TEXT NOT NULL,
  performed_by UUID REFERENCES mesh_users(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_mesh_permission_audit_agent_id ON mesh_permission_audit(agent_id);
CREATE INDEX IF NOT EXISTS idx_mesh_permission_audit_collaborator_id ON mesh_permission_audit(collaborator_id);
CREATE INDEX IF NOT EXISTS idx_mesh_permission_audit_performed_at ON mesh_permission_audit(performed_at DESC);

-- Trigger to log permission changes
CREATE OR REPLACE FUNCTION log_permission_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO mesh_permission_audit (
      agent_id, collaborator_id, group_id, action, permission, performed_by
    ) VALUES (
      NEW.agent_id, NEW.collaborator_id, NEW.group_id, 'grant', NEW.permission, NEW.granted_by
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL THEN
    INSERT INTO mesh_permission_audit (
      agent_id, collaborator_id, group_id, action, permission, performed_by
    ) VALUES (
      NEW.agent_id, NEW.collaborator_id, NEW.group_id, 'revoke', NEW.permission, NEW.revoked_by
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER log_permission_change_trigger
AFTER INSERT OR UPDATE ON mesh_group_permissions
FOR EACH ROW
EXECUTE FUNCTION log_permission_change();