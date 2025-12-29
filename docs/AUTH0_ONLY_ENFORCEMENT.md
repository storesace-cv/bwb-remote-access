# Auth0-Only Authentication Enforcement

## Overview

The RustDesk Web application has been migrated to **Auth0-only authentication**. No local email/password authentication is available.

## Architecture (CRITICAL)

**`NextResponse.next()` may ONLY exist in `middleware.ts` at root level.**

Route handlers (`app/**/route.ts`) must NEVER:
- Return `NextResponse.next()`
- Call `auth0.middleware()`
- Import or call proxy functions

## Changes Made

### 1. Middleware (`/middleware.ts` - ROOT LEVEL)
- Handles ALL authentication enforcement
- Auth0 routes (`/auth/*`) delegated to `auth0.middleware()`
- **PUBLIC routes** (no auth): `/_next/*`, static assets
- **PROTECTED routes**: Everything else - redirects to `/auth/login` if no session
- Legacy `/api/auth/*` routes redirect to `/auth/*`

### 2. Removed Files
- `src/proxy.ts` - DELETED (was incorrectly structured)
- `src/middleware.ts` - DELETED (wrong location)
- `src/app/api/auth/[...auth0]/route.ts` - DELETED (caused NextResponse.next() error)

### 3. Renamed Directories  
- `src/app/auth/` → `src/app/auth-status/` (to not conflict with Auth0 SDK routes)

### 2. Root Page (`/app/src/app/page.tsx`)
- Replaced local login form with Auth0-only landing page
- Shows "Entrar com Auth0" button
- Redirects to `/dashboard/profile` if already logged in

### 3. Legacy Login API (`/app/src/app/api/login/route.ts`)
- Now returns **410 Gone** with deprecation message
- Directs users to use `/auth/login` instead

### 4. Dashboard (`/app/src/app/dashboard/page.tsx`)
- Converted to Server Component for Auth0 session handling
- Uses `auth0.getSession()` instead of legacy JWT
- Created `DashboardClient.tsx` for client interactions

### 5. Profile Page (`/app/src/app/dashboard/profile/page.tsx`)
- Shows Auth0 session info, claims, and roles
- No local password management (Auth0 handles that)
- Links to admin/mesh sections based on RBAC

### 6. Auth Page (`/app/src/app/auth/page.tsx`)
- Redirects to Auth0 login if not authenticated
- Shows session details and claims if authenticated

## Authentication Flow

```
User visits https://rustdesk.bwb.pt/
         │
         ▼
    Proxy checks for appSession cookie
         │
    ┌────┴────┐
    │         │
    ▼         ▼
 No cookie   Cookie exists
    │         │
    ▼         │
Redirect to   │
/auth/        │
login         │
    │         │
    ▼         │
Auth0 Login   │
Page          │
    │         │
    ▼         │
Auth0         │
Callback      │
    │         │
    ▼         ▼
         Dashboard
```

## Verification Checklist

### Pre-Deployment
1. ✅ Build successful (`yarn build` completes without errors)
2. ✅ Proxy created and registered (migrated from middleware.ts)
3. ✅ Root page converted to Auth0-only
4. ✅ Legacy `/api/login` returns 410 Gone
5. ✅ Dashboard uses Auth0 session
6. ✅ Profile page shows Auth0 info

### Post-Deployment (User Must Verify)

**Test 1: Auth0 Redirect**
1. Open private/incognito browser window
2. Navigate to https://rustdesk.bwb.pt/
3. **Expected**: Immediate redirect to Auth0 login page OR landing page with "Entrar com Auth0" button

**Test 2: No Local Login**
1. Verify NO email/password form exists anywhere
2. All login flows go through Auth0

**Test 3: Auth0 Login Success**
1. Complete Auth0 login
2. Check Auth0 Dashboard → Users → History
3. **Expected**: "Success Login" event visible

**Test 4: API Verification**
```bash
# Should return 410 Gone
curl -X POST https://rustdesk.bwb.pt/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test"}'

# Should return session info (after Auth0 login)
curl https://rustdesk.bwb.pt/api/auth0/me \
  --cookie "appSession=<your_session_cookie>"
```

**Test 5: MeshCentral Remote Session**
1. Login via Auth0
2. Navigate to /mesh/devices
3. Click "Controlo Remoto" on online device
4. **Expected**: MeshCentral opens in new tab WITHOUT login prompt

## Required Environment Variables

### Auth0 Configuration (Already Set)
```bash
AUTH0_SECRET=<random_32+_chars>
AUTH0_BASE_URL=https://rustdesk.bwb.pt
AUTH0_DOMAIN=<your-tenant>.eu.auth0.com
AUTH0_CLIENT_ID=<client_id>
AUTH0_CLIENT_SECRET=<client_secret>
```

### MeshCentral Session (NEW - For STEP 6.2)
```bash
MESHCENTRAL_URL=https://mesh.yourdomain.com
MESHCENTRAL_LOGIN_TOKEN_KEY=<hex_string_from_meshcentral>
```

## Security Model

1. **Auth0 is the ONLY authentication authority**
   - No local passwords stored
   - No MeshCentral login screen for users

2. **Domain-based RBAC**
   - Users see only their organization's devices
   - SuperAdmins can access all domains

3. **Time-limited MeshCentral tokens**
   - 5-minute expiry
   - Generated server-side only

## Files Changed

| File | Change |
|------|--------|
| `/src/proxy.ts` | NEW - Auth0 enforcement (Next.js 16 proxy convention) |
| `/src/middleware.ts` | DELETED - Replaced by proxy.ts |
| `/src/app/page.tsx` | Auth0-only landing |
| `/src/app/api/login/route.ts` | Returns 410 Gone |
| `/src/app/dashboard/page.tsx` | Auth0 Server Component |
| `/src/app/dashboard/DashboardClient.tsx` | NEW - Client interactions |
| `/src/app/dashboard/profile/page.tsx` | Auth0 profile display |
| `/src/app/auth/page.tsx` | Auth0 session viewer |

## Status: AUTH0-ONLY READY

The codebase is now configured for Auth0-only authentication. After deployment:
- Verify with the checklist above
- Check Auth0 Dashboard for successful logins
- Test MeshCentral remote session flow
