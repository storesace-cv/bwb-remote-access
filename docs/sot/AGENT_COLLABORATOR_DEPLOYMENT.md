# Agent-Collaborator Model Deployment Guide

**Source of Truth Reference:** `docs/sot/rustdesk-agent-collaborator-model.md`

**Last Updated:** 2025-12-21

## 📋 Overview

This guide covers the deployment of the Agent-Collaborator Model for multi-tenant RustDesk device management. This is a production-grade implementation following the SoT specification.

## 🎯 Prerequisites

- Supabase project configured and connected
- Database migrations access
- Edge Functions deployment access
- Supabase CLI installed and authenticated

## 🚀 Deployment Steps

### Step 1: Database Migration

Deploy the comprehensive schema changes:

```bash
# Navigate to project root
cd /path/to/rustdesk-mesh-integration

# Apply migration
supabase db push

# Or if using direct SQL:
psql $DATABASE_URL -f supabase/migrations/20251221005500_agent_collaborator_model.sql
```

**What this migration does:**
- ✅ Extends `mesh_users` with agent/collaborator fields
- ✅ Creates `mesh_groups` table for hierarchical organization
- ✅ Creates `mesh_group_permissions` for granular access control
- ✅ Creates `mesh_permission_audit` for compliance logging
- ✅ Extends `android_devices` with agent_id and group_id
- ✅ Implements multi-tenant RLS policies
- ✅ Creates helper functions for visibility checks

**Validation:**

```sql
-- Verify tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('mesh_groups', 'mesh_group_permissions', 'mesh_permission_audit');

-- Should return 3 rows

-- Verify mesh_users columns
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'mesh_users' 
  AND column_name IN ('user_type', 'parent_agent_id', 'agent_id');

-- Should return 3 rows
```

### Step 2: Data Migration (Optional)

If you have existing devices with `notes` field containing "Group | Subgroup" format:

```sql
-- Run migration function to create groups from notes
SELECT * FROM migrate_notes_to_groups();

-- Example output: (42, 15)
-- 42 devices migrated, 15 groups created
```

**Recommendation:** Run this in a transaction first to preview:

```sql
BEGIN;
SELECT * FROM migrate_notes_to_groups();
-- Review results
ROLLBACK; -- or COMMIT if satisfied
```

### Step 3: Deploy Edge Functions

Deploy all new admin functions:

```bash
# Create collaborator
supabase functions deploy admin-create-collaborator

# List collaborators
supabase functions deploy admin-list-collaborators

# Grant permission
supabase functions deploy admin-grant-permission

# Revoke permission
supabase functions deploy admin-revoke-permission

# List groups
supabase functions deploy admin-list-groups

# Create group
supabase functions deploy admin-create-group
```

**Batch deployment:**

```bash
# Deploy all at once
for func in admin-create-collaborator admin-list-collaborators admin-grant-permission admin-revoke-permission admin-list-groups admin-create-group; do
  echo "Deploying $func..."
  supabase functions deploy $func
done
```

**Validation:**

```bash
# List deployed functions
supabase functions list

# Should show all 6 new functions
```

### Step 4: Environment Variables

Ensure all Edge Functions have required secrets:

```bash
# Set Supabase service role key (if not already set)
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# Verify secrets
supabase secrets list
```

### Step 5: Update Frontend (Future)

**Note:** Frontend UI for agent-collaborator management is not yet implemented. Current deployment focuses on backend infrastructure.

**Future UI locations:**
- `/dashboard/collaborators` - Collaborator management
- `/dashboard/groups` - Group management
- `/dashboard/permissions` - Permission viewer

## 🧪 Testing the Deployment

### Test 1: Verify Existing Users are Agents

```sql
-- All existing users should have user_type='agent'
SELECT mesh_username, user_type, agent_id, parent_agent_id
FROM mesh_users;

-- Expected: user_type='agent', parent_agent_id=NULL, agent_id=id
```

### Test 2: Create a Test Collaborator

```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/admin-create-collaborator \
  -H "Authorization: Bearer <agent-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test-collab@example.com",
    "mesh_username": "test_collab",
    "display_name": "Test Collaborator"
  }'
```

**Expected Response:**

```json
{
  "success": true,
  "collaborator": {
    "id": "uuid",
    "mesh_username": "test_collab",
    "email": "test-collab@example.com",
    "user_type": "collaborator",
    "parent_agent_id": "agent-uuid"
  },
  "temporary_password": "random-password"
}
```

### Test 3: Create a Test Group

```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/admin-create-group \
  -H "Authorization: Bearer <agent-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Group",
    "description": "Testing hierarchical groups"
  }'
```

### Test 4: Grant Permission

```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/admin-grant-permission \
  -H "Authorization: Bearer <agent-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "collaborator_id": "collab-uuid",
    "group_id": "group-uuid",
    "permission": "view"
  }'
```

### Test 5: Verify RLS Isolation

```sql
-- Login as collaborator (set auth.uid() to collaborator)
SET LOCAL jwt.claims.sub = '<collaborator-uuid>';

-- Collaborator should only see permitted devices
SELECT id, device_id, friendly_name, group_id 
FROM android_devices;

-- Should return ONLY devices in permitted groups or owned by collaborator
```

## 🔍 Monitoring & Observability

### Key Metrics to Monitor

1. **Permission Changes:**
```sql
SELECT COUNT(*) as total_permission_changes
FROM mesh_permission_audit
WHERE performed_at > NOW() - INTERVAL '24 hours';
```

2. **Active Collaborators per Agent:**
```sql
SELECT * FROM agent_hierarchy_summary;
```

3. **Audit Trail:**
```sql
SELECT 
  performed_at,
  action,
  collab.mesh_username,
  g.path
FROM mesh_permission_audit a
JOIN mesh_users collab ON a.collaborator_id = collab.id
JOIN mesh_groups g ON a.group_id = g.id
ORDER BY performed_at DESC
LIMIT 20;
```

## 🚨 Rollback Plan

If issues occur, rollback in reverse order:

### 1. Remove Edge Functions

```bash
# Delete all new functions
for func in admin-create-collaborator admin-list-collaborators admin-grant-permission admin-revoke-permission admin-list-groups admin-create-group; do
  supabase functions delete $func
done
```

### 2. Rollback Database

**Option A: Manual Reversal**

```sql
-- Drop new tables
DROP TABLE IF EXISTS mesh_permission_audit CASCADE;
DROP TABLE IF EXISTS mesh_group_permissions CASCADE;
DROP TABLE IF EXISTS mesh_groups CASCADE;

-- Remove new columns from mesh_users
ALTER TABLE mesh_users 
  DROP COLUMN IF EXISTS user_type CASCADE,
  DROP COLUMN IF EXISTS parent_agent_id CASCADE,
  DROP COLUMN IF EXISTS agent_id CASCADE;

-- Remove new columns from android_devices
ALTER TABLE android_devices 
  DROP COLUMN IF EXISTS agent_id CASCADE,
  DROP COLUMN IF EXISTS group_id CASCADE;
```

**Option B: Restore from Backup**

```bash
# Using Supabase CLI
supabase db reset --db-url $DATABASE_URL
```

## 📊 Performance Considerations

### Index Optimization

The migration creates comprehensive indexes. Monitor query performance:

```sql
-- Check index usage
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan as times_used,
  idx_tup_read as rows_read
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND tablename IN ('mesh_groups', 'mesh_group_permissions', 'mesh_users', 'android_devices')
ORDER BY idx_scan DESC;
```

### RLS Performance

For large datasets (>10,000 devices), consider:

1. **Materialized Views for Visibility:**
```sql
CREATE MATERIALIZED VIEW collaborator_visible_devices AS
SELECT 
  u.id as collaborator_id,
  d.id as device_id,
  d.*
FROM mesh_users u
CROSS JOIN android_devices d
WHERE u.user_type = 'collaborator'
  AND (
    d.owner = u.id
    OR d.group_id IN (
      SELECT group_id FROM get_visible_groups(u.id)
    )
  );

CREATE INDEX ON collaborator_visible_devices(collaborator_id, device_id);
```

2. **Periodic Refresh:**
```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY collaborator_visible_devices;
```

## 🔐 Security Checklist

- [x] RLS enabled on all new tables
- [x] Tenant isolation enforced via agent_id
- [x] Permission validation in Edge Functions
- [x] Audit trail for all permission changes
- [x] Service role key secured in environment
- [x] No client-side permission filtering
- [x] JWT validation on all admin endpoints
- [x] `mesh_users` RLS simplificada:
  - Policy única `"mesh_users_select_policy"` (self + `service_role`)
  - Agents/siteadmins obtêm visibilidade multi‑tenant **exclusivamente** através das Edge Functions `admin-*` com `SUPABASE_SERVICE_ROLE_KEY` (sem RLS recursiva em `mesh_users`)

## 📝 Post-Deployment Tasks

1. **Update Documentation:**
   - [x] Architecture diagrams
   - [x] Data model documentation
   - [ ] API reference (add new endpoints)
   - [ ] User guide (add collaborator management)

2. **Communication:**
   - [ ] Notify existing users about new capabilities
   - [ ] Provide training materials for agent role
   - [ ] Document migration path for existing devices

3. **Monitoring Setup:**
   - [ ] Set up alerts for permission changes
   - [ ] Monitor RLS policy performance
   - [ ] Track collaborator creation rate

## 🎯 Success Criteria

Deployment is successful when:

- ✅ All migrations applied without errors
- ✅ All Edge Functions deployed and accessible
- ✅ Existing users remain functional as agents
- ✅ RLS policies enforce tenant isolation
- ✅ Audit trail captures permission changes
- ✅ Test collaborator creation works
- ✅ Test group creation and permission granting works

## 🆘 Troubleshooting

### Issue: Migration Fails on agent_id Population

**Symptom:** `UPDATE mesh_users SET agent_id...` fails

**Solution:**
```sql
-- Manually set agent_id for all users
UPDATE mesh_users 
SET agent_id = id 
WHERE user_type = 'agent' AND agent_id IS NULL;

-- Then make it NOT NULL
ALTER TABLE mesh_users ALTER COLUMN agent_id SET NOT NULL;
```

### Issue: RLS Prevents Agent from Seeing Data

**Symptom:** Agent can't see their own devices

**Solution:**
```sql
-- Verify agent_id is set correctly
SELECT id, mesh_username, user_type, agent_id 
FROM mesh_users 
WHERE auth_user_id = '<user-uuid>';

-- Manually fix if needed
UPDATE mesh_users SET agent_id = id WHERE user_type = 'agent';
```

### Issue: Edge Function Returns 401 Unauthorized

**Symptom:** All admin function calls fail with 401

**Solution:**
```bash
# Verify JWT is valid
curl https://<project-ref>.supabase.co/auth/v1/user \
  -H "Authorization: Bearer <jwt-token>"

# Verify user exists in mesh_users
# Check user_type is 'agent'
```

## 📚 Reference

- **Source of Truth:** `docs/sot/rustdesk-agent-collaborator-model.md`
- **Architecture:** `docs/sot/architecture.md`
- **Data Models:** `docs/sot/data-models.md`
- **API Reference:** `docs/API_REFERENCE.md` (to be updated)

---

**Deployment Status:** Ready for Production ✅

**Last Tested:** 2025-12-21

**Version:** 1.0.0 (Initial Agent-Collaborator Implementation)