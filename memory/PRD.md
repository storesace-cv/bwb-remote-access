# BWB Remote Access - Product Requirements Document

**Last Updated:** January 4, 2026

## Overview

BWB Remote Access is a web application for managing remote devices via MeshCentral. The application provides:
- User authentication via MeshCentral credentials
- Device listing and remote session management
- Role-based access control (RBAC) using `mesh_users.user_type`
- Multi-domain support (mesh.bwb.pt, zonetech.bwb.pt, zsangola.bwb.pt)

## Core Requirements

### Authentication (MeshCentral-based)
- [x] Users authenticate with email/password against MeshCentral
- [x] Session management via encrypted cookies (7-day rolling TTL)
- [x] Multi-domain support based on request host
- [x] Protected routes redirect to login
- [x] username = email (enforced)

### User Management (mesh_users table)
- [x] User records in `public.mesh_users` table
- [x] User types: siteadmin, minisiteadmin, agent, colaborador, inactivo, candidato
- [x] Default type for new users: candidato
- [x] Admin can create/edit/deactivate users

### Device Management
- [x] List devices from Supabase mirror
- [x] Domain-scoped device access
- [x] Remote session generation via MeshCentral login tokens

## Technical Architecture

### Tech Stack
- **Frontend**: Next.js 16.0 (App Router)
- **Backend**: Next.js API Routes
- **Database**: Supabase (PostgreSQL)
- **Authentication**: MeshCentral credential validation
- **Session**: Encrypted cookies (AES-256-GCM)

### Database Tables (from remote_schema.sql)
- `public.mesh_users` - User identity and roles
- `public.mesh_groups` - Device groups
- `public.mesh_group_permissions` - User permissions on groups
- `public.profiles` - Basic user profiles (minimal)

### Key Files
```
/middleware.ts              - Route protection
/src/lib/mesh-auth.ts       - Authentication logic (uses mesh_users)
/src/lib/rbac-mesh.ts       - Role-based access control (user_type)
/src/lib/user-mirror.ts     - Supabase user management (mesh_users)
/src/lib/supabase-admin.ts  - Supabase admin client
```

## What's Implemented

### January 2026 - Auth0 Removal Complete

**Completed:**
- ✅ Removed Auth0 dependency completely
- ✅ Removed all @auth0/nextjs-auth0 references
- ✅ Implemented MeshCentral credential validation (3-step browser flow)
- ✅ Created encrypted cookie session management
- ✅ Built RBAC system using mesh_users.user_type
- ✅ Updated all protected routes and middleware
- ✅ Created new login page
- ✅ Updated admin user management to use mesh_users table
- ✅ Updated deploy scripts (Step-2, Step-3, Step-4) - removed Auth0 checks
- ✅ Added Supabase migration phase to deploy script

**Environment Variables Required:**
- `SESSION_SECRET` (required) - 32-byte hex for session encryption
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - For server-side operations
- `MESHCENTRAL_URL` - MeshCentral base URL (optional)
- `MESHCENTRAL_LOGIN_TOKEN_KEY` - For remote sessions (optional)
- `APP_BASE_URL` - Production base URL

## User Types (RBAC)

| Type | Description | Permissions |
|------|-------------|-------------|
| siteadmin | Global super admin | All domains, all users |
| minisiteadmin | Domain super admin | Own domain, all users in domain |
| agent | Agent/technician | Manage collaborators |
| colaborador | Active collaborator | Standard access |
| inactivo | Disabled user | No access |
| candidato | New user | Limited access |

## Pending / Future Work

### P0 - Testing Required
- [ ] End-to-end testing with real MeshCentral credentials
- [ ] Test user creation flow
- [ ] Test device listing and remote sessions
- [ ] Test multi-domain routing

### P1 - Supabase Migrations
- [x] Baseline migration for android_devices table (20251207000000)
- [x] Migrations align with remote_schema.sql
- [x] Deploy script includes `supabase db push` phase
- [ ] Run `supabase db push` on Mac to verify migrations apply cleanly

### P2 - Documentation
- [x] Updated authentication architecture
- [ ] Clean up outdated docs in /docs/

## Completed - January 4, 2026

### Lint Warning Fixes (Security & Correctness)
All lint warnings resolved by implementing actual logic, not by deletion:

1. **`/api/mesh/devices/route.ts`** - `canAccessDomain`
   - Now enforces domain access check
   - Returns 403 if user requests a domain they cannot access

2. **`/api/mesh/open-session/route.ts`** - `getShortDomain`, `isSuperAdmin`  
   - Removed unused imports (functionality exists elsewhere)

3. **`/lib/mesh-auth.ts`** - `fetchError`
   - Now logs database errors explicitly
   - Returns null safely instead of silently failing

4. **`/lib/rbac-mesh.ts`** - `getSupabase`
   - Removed unused function (Supabase client already available in mesh-auth.ts)

5. **`/lib/user-mirror.ts`** - `VALID_DOMAINS`
   - Added `isValidDomain()` helper function
   - `upsertMirrorUser()` now validates domain before DB write

### Deploy Script (Step-4)
- [x] Already includes Supabase CLI phase
- [x] Runs `supabase db push` before deploy
- [x] Checks for CLI installation
- [x] Aborts deploy on migration failure

## Validation Commands

```bash
# Build
npm run build

# Local test
npm run dev

# Supabase migrations
supabase db push

# Deploy
./scripts/Step-4-deploy-tested-build.sh
```
