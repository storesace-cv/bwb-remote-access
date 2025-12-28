-- Add the corrected parent_agent_id constraint
-- Only colaborador and inactivo MUST have parent_agent_id
-- All others (siteadmin, minisiteadmin, agent, candidato) can have NULL
ALTER TABLE mesh_users
ADD CONSTRAINT check_parent_agent_hierarchy
CHECK (
  (user_type IN ('colaborador', 'inactivo') AND parent_agent_id IS NOT NULL) OR
  (user_type IN ('siteadmin', 'minisiteadmin', 'agent', 'candidato'))
);