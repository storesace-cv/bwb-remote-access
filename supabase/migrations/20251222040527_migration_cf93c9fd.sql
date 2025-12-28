-- Step 6: Populate agent_id in mesh_users
-- For agents: agent_id = id (self-reference)
-- For collaborators: agent_id = parent_agent_id
-- For others: need to determine based on domain/hierarchy

UPDATE mesh_users
SET agent_id = CASE
  WHEN user_type IN ('agent', 'siteadmin', 'minisiteadmin') THEN id
  WHEN user_type = 'colaborador' AND parent_agent_id IS NOT NULL THEN parent_agent_id
  ELSE id -- Default to self for candidatos until we assign them
END
WHERE agent_id IS NULL;

-- Make agent_id NOT NULL after population
ALTER TABLE mesh_users ALTER COLUMN agent_id SET NOT NULL;