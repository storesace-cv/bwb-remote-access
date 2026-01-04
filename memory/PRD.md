# BWB Remote Access - Product Requirements Document

## Overview

BWB Remote Access is a web application for managing remote devices via MeshCentral. The application provides:
- User authentication via MeshCentral credentials
- Device listing and remote session management
- Role-based access control (RBAC)
- Multi-domain support (mesh.bwb.pt, zonetech.bwb.pt, zsangola.bwb.pt)

## Core Requirements

### Authentication (MeshCentral-based)
- [x] Users authenticate with email/password against MeshCentral
- [x] Session management via encrypted cookies (7-day rolling TTL)
- [x] Multi-domain support based on request host
- [x] Protected routes redirect to login

### User Management
- [x] Supabase user mirroring on first login
- [x] Role assignments (SUPERADMIN, DOMAIN_ADMIN, AGENT, USER)
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

### Key Files
```
/middleware.ts           - Route protection
/src/lib/mesh-auth.ts    - Authentication logic
/src/lib/rbac-mesh.ts    - Role-based access control
/src/lib/user-mirror.ts  - Supabase user management
```

## What's Implemented

### December 2025 - Auth0 Removal & MeshCentral Integration

**Completed:**
- Removed Auth0 dependency completely
- Implemented MeshCentral credential validation (3-step browser flow)
- Created encrypted cookie session management
- Built new RBAC system
- Updated all protected routes and middleware
- Created new login page
- Updated admin user management routes
- Cleaned up all Auth0 references from codebase

**Environment Variables Required:**
- `SESSION_SECRET` (required) - 32-byte hex for session encryption
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - For server-side operations
- `MESHCENTRAL_URL` - MeshCentral base URL (optional)
- `MESHCENTRAL_LOGIN_TOKEN_KEY` - For remote sessions (optional)

## Pending / Future Work

### P1 - Testing Required
- [ ] End-to-end testing of login flow with real MeshCentral credentials
- [ ] Test user creation and role assignment
- [ ] Test device listing and remote sessions
- [ ] Test multi-domain routing

### P2 - Documentation
- [x] Update authentication architecture docs
- [ ] Clean up outdated Auth0 references in `/docs/`
- [ ] Create deployment guide

### P3 - Enhancements
- [ ] Rate limiting on login endpoint
- [ ] Session activity logging
- [ ] Password reset flow guidance
