# Authentication Architecture - MeshCentral

## Overview

This application uses **MeshCentral** for user authentication. Credentials are validated directly against the MeshCentral server using a browser-equivalent login flow. Supabase is used for storing user profiles and role assignments.

## Authentication Flow

```
┌──────────────────┐       ┌─────────────────┐        ┌───────────────┐
│   User Browser   │       │    Next.js      │        │ MeshCentral   │
│                  │       │   Application   │        │    Server     │
└────────┬─────────┘       └────────┬────────┘        └───────┬───────┘
         │                          │                         │
         │ 1. Submit credentials    │                         │
         │ ──────────────────────>  │                         │
         │                          │ 2. Validate credentials │
         │                          │ ─────────────────────>  │
         │                          │                         │
         │                          │ 3. Return auth result   │
         │                          │ <─────────────────────  │
         │                          │                         │
         │ 4. Set session cookie    │                         │
         │ <──────────────────────  │                         │
         │                          │                         │
         │ 5. Redirect to dashboard │                         │
         │ <──────────────────────  │                         │
```

## Key Components

### 1. MeshCentral Authentication (`/src/lib/mesh-auth.ts`)

Handles all authentication logic:
- `validateMeshCredentials()`: 3-step browser-equivalent login validation
- `setSessionCookie()` / `getSession()` / `clearSession()`: Encrypted cookie session management
- `ensureSupabaseUser()`: Creates/syncs user records in Supabase

### 2. Session Management

- **Cookie Name**: `mesh_session`
- **Encryption**: AES-256-GCM with SESSION_SECRET
- **TTL**: 7 days rolling (refreshes on each request)
- **Flags**: HttpOnly, Secure, SameSite=Lax

### 3. Multi-Domain Support

Domains are determined from the request host:
- `mesh.bwb.pt` → Domain: `mesh`
- `zonetech.bwb.pt` → Domain: `zonetech`
- `zsangola.bwb.pt` → Domain: `zsangola`

### 4. RBAC (`/src/lib/rbac-mesh.ts`)

Role-based access control:
- `SUPERADMIN`: Full access to all domains
- `DOMAIN_ADMIN`: Admin access within their domain
- `AGENT`: Standard user access within their domain
- `USER`: Basic user access

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login` | POST | Authenticate with MeshCentral |
| `/api/auth/logout` | GET/POST | Clear session |
| `/api/auth/session` | GET | Get current session info |

## Protected Routes

The middleware (`/middleware.ts`) protects these routes:
- `/dashboard/*`
- `/mesh/*`
- `/admin/*`
- `/provisioning/*`

Unauthenticated users are redirected to `/login`.

## Environment Variables

```env
# Required
SESSION_SECRET=your-32-byte-hex-secret

# Optional (for Supabase user mirroring)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Optional (for MeshCentral session generation)
MESHCENTRAL_URL=https://mesh.bwb.pt
MESHCENTRAL_LOGIN_TOKEN_KEY=your-login-token-key

# Optional (development override)
MESH_BASE_URL=https://mesh.bwb.pt
```

## Security Considerations

1. **Passwords**: Never stored anywhere (logs, DB, cookies)
2. **Session**: Encrypted with AES-256-GCM
3. **Rate Limiting**: Consider implementing at infrastructure level
4. **HTTPS**: Required in production

## Migration from Auth0

Auth0 was completely removed. All authentication now goes through MeshCentral:
- Removed: `@auth0/nextjs-auth0` package
- Removed: Auth0 environment variables
- Removed: `/auth/*` routes and handlers
- Added: MeshCentral credential validation
- Added: Encrypted cookie sessions
