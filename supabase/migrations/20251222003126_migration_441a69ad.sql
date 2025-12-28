-- Add minisiteadmin user type to mesh_users (simplified version)
-- Version: 2025-12-22T00:30:00Z

-- Drop existing constraint
ALTER TABLE mesh_users 
DROP CONSTRAINT IF EXISTS mesh_users_user_type_check;

-- Add new constraint with minisiteadmin
ALTER TABLE mesh_users 
ADD CONSTRAINT mesh_users_user_type_check 
CHECK (user_type IN ('siteadmin', 'minisiteadmin', 'agent', 'colaborador', 'inactivo', 'candidato'));

-- Add comment
COMMENT ON CONSTRAINT mesh_users_user_type_check ON mesh_users IS 
'User type hierarchy: siteadmin (global) → minisiteadmin (domain) → agent (creates collaborators) → colaborador (active) → inactivo (disabled) → candidato (no account)';