-- Migration: Add can_access_meshcentral permission to roles table
-- Date: 2025-01-08
-- Description: Adds a new boolean permission column to allow users to access MeshCentral web app

-- Add the new permission column (idempotent - will not fail if already exists)
ALTER TABLE roles ADD COLUMN IF NOT EXISTS can_access_meshcentral boolean NOT NULL DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN roles.can_access_meshcentral IS 'Permite abrir o MeshCentral do domínio do utilizador';
