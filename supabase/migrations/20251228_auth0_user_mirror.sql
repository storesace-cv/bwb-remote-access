-- =============================================================================
-- Migration: Auth0 User Mirror Tables
-- Purpose: Mirror Auth0 users to Supabase for fast listing/audit
-- Created: 2025-12-28
-- =============================================================================

-- Table A: app_users - Main user mirror table
CREATE TABLE IF NOT EXISTS app_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth0_user_id TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    display_name TEXT,
    is_superadmin_meshcentral BOOLEAN NOT NULL DEFAULT FALSE,
    is_superadmin_rustdesk BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Indexes for app_users
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_auth0_user_id ON app_users(auth0_user_id);
CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users(email);
CREATE INDEX IF NOT EXISTS idx_app_users_deleted_at ON app_users(deleted_at);

-- Table B: app_user_domains - User domain/role assignments
CREATE TABLE IF NOT EXISTS app_user_domains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    domain TEXT NOT NULL CHECK (domain IN ('mesh', 'zonetech', 'zsangola')),
    role TEXT NOT NULL CHECK (role IN ('DOMAIN_ADMIN', 'AGENT')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, domain, role)
);

-- Indexes for app_user_domains
CREATE INDEX IF NOT EXISTS idx_app_user_domains_domain ON app_user_domains(domain);
CREATE INDEX IF NOT EXISTS idx_app_user_domains_user_domain ON app_user_domains(user_id, domain);

-- Trigger to auto-update updated_at on app_users
CREATE OR REPLACE FUNCTION update_app_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_app_users_updated_at ON app_users;
CREATE TRIGGER trigger_update_app_users_updated_at
    BEFORE UPDATE ON app_users
    FOR EACH ROW
    EXECUTE FUNCTION update_app_users_updated_at();

-- Note: RLS is disabled for these tables.
-- Access is controlled server-side using service role key.
-- This is intentional for STEP 3 - can add RLS in future steps if needed.

COMMENT ON TABLE app_users IS 'Mirror of Auth0 users for fast listing/audit';
COMMENT ON TABLE app_user_domains IS 'Domain and role assignments for app_users';
