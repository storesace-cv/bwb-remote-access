-- Drop old constraint
ALTER TABLE mesh_users DROP CONSTRAINT IF EXISTS mesh_users_user_type_valid;

-- Create new constraint with minisiteadmin included
ALTER TABLE mesh_users 
ADD CONSTRAINT mesh_users_user_type_valid 
CHECK (user_type = ANY (ARRAY[
  'siteadmin'::text, 
  'minisiteadmin'::text,  -- NEW
  'agent'::text, 
  'colaborador'::text, 
  'inactivo'::text, 
  'candidato'::text
]));