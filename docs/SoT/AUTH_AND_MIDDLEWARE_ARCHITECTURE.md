# Source of Truth — Authentication & Middleware Architecture (Next.js 16 + Auth0)

> **Document Status**: CANONICAL  
> **Last Updated**: December 2024  
> **Next.js Version**: 16.x  
> **Auth0 SDK Version**: @auth0/nextjs-auth0 v4.x  
> **Authority**: This document overrides any conflicting instructions, comments, or patterns found elsewhere.

---

## Purpose & Scope

This document establishes **non-negotiable architectural rules** for authentication and routing in this Next.js 16 application. It exists to:

1. Prevent the recurrence of production errors like `"NextResponse.next() was used in a app route handler"` and `/auth/login` returning 404
2. Ensure Auth0 integration follows the correct SDK patterns for Next.js 16
3. Establish clear boundaries between proxy and route handlers
4. Serve as the definitive reference for any future development

**If future instructions conflict with this document, THIS DOCUMENT WINS.**

---

## 1. Next.js 16 Boundary File Convention

### CRITICAL CHANGE FROM PREVIOUS VERSIONS

In **Next.js 16**, the boundary file convention changed:

| Version | File Name | Function Name | Location |
|---------|-----------|---------------|----------|
| Next.js 15 and earlier | `middleware.ts` | `middleware()` | Root or src/ |
| **Next.js 16** | **`proxy.ts`** | **`proxy()`** | **Root ONLY** |

### RULE: Boundary File Location and Naming

| Requirement | Value |
|-------------|-------|
| File name | `proxy.ts` |
| Location | **Project root** (same level as `package.json`) |
| Function name | `export async function proxy(request)` |
| NOT allowed | `middleware.ts`, `src/proxy.ts`, `src/middleware.ts` |

### DO ✅

```
/app
├── proxy.ts          ✅ CORRECT - Root level, named proxy.ts
├── package.json
├── next.config.mjs
└── src/
    └── app/
```

### DO NOT ❌

```
/app
├── middleware.ts     ❌ WRONG - Deprecated name in Next.js 16
├── src/
│   ├── proxy.ts      ❌ WRONG - Must be at root, not in src/
│   └── middleware.ts ❌ WRONG - Deprecated name
```

---

## 2. `NextResponse.next()` Location

### RULE: Only Allowed in `/proxy.ts`

| Location | Allowed | 
|----------|---------|
| `/proxy.ts` (root) | ✅ YES |
| `src/app/**/route.ts` | ❌ **FORBIDDEN** |
| `src/**/*.ts` (any other file) | ❌ **FORBIDDEN** |
| API handlers | ❌ **FORBIDDEN** |

### DO ✅

```typescript
// /proxy.ts (ROOT LEVEL ONLY)
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  // ... authentication logic ...
  return NextResponse.next(); // ✅ ALLOWED HERE
}
```

### DO NOT ❌

```typescript
// src/app/api/example/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.next(); // ❌ HARD VIOLATION - Causes runtime error
}
```

---

## 3. Auth0 Route Ownership

### RULE: `/auth/*` Paths Are Reserved for Auth0 SDK

The `/auth/*` URL namespace is **exclusively owned by the Auth0 SDK**. The SDK automatically handles:

| Route | Purpose |
|-------|---------|
| `/auth/login` | Redirects to Auth0 Universal Login |
| `/auth/logout` | Clears session and logs out |
| `/auth/callback` | Handles OAuth callback |
| `/auth/me` | Returns session info (JSON) |
| `/auth/profile` | Returns user profile |
| `/auth/access-token` | Returns access token |
| `/auth/backchannel-logout` | Handles backchannel logout |

### DO ✅

- Delegate all `/auth/*` routes to `auth0.middleware(request)` in `proxy.ts`
- Keep `/auth/*` path FREE of any application code

### DO NOT ❌

```
src/app/auth/             ❌ FORBIDDEN - This directory must NOT exist
src/app/auth/page.tsx     ❌ FORBIDDEN - Shadows Auth0 routes
src/app/auth/login/       ❌ FORBIDDEN - Conflicts with SDK
src/app/auth/layout.tsx   ❌ FORBIDDEN - Intercepts Auth0 flow
```

### Why?

When `src/app/auth/` exists, Next.js serves pages from that directory BEFORE the proxy can delegate to Auth0. This causes:

- **404 errors** on `/auth/login`
- Auth0 SDK routes being shadowed
- Authentication flow breaking completely

---

## 4. Auth0 SDK Integration in Proxy

### RULE: How to Delegate to Auth0

The proxy MUST delegate `/auth/*` routes to the Auth0 SDK:

```typescript
// /proxy.ts
import { auth0 } from "./src/lib/auth0";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // CRITICAL: Delegate /auth/* to Auth0 SDK
  if (pathname.startsWith("/auth")) {
    return auth0.middleware(request);  // ✅ CORRECT
  }

  // ... other routing logic ...
}
```

### RULE: Where `auth0.middleware()` May Be Called

| Location | Allowed |
|----------|---------|
| `/proxy.ts` | ✅ YES |
| Route handlers (`app/**/route.ts`) | ❌ **FORBIDDEN** |
| API routes | ❌ **FORBIDDEN** |
| Server Actions | ❌ **FORBIDDEN** |
| Any other file | ❌ **FORBIDDEN** |

---

## 5. Responsibility Separation

### Proxy Responsibilities (`/proxy.ts`)

| Responsibility | Example |
|----------------|---------|
| Authentication enforcement | Check `appSession` cookie |
| Route protection | Redirect unauthenticated users to `/auth/login` |
| Auth0 SDK delegation | Call `auth0.middleware()` for `/auth/*` |
| Request continuation | Return `NextResponse.next()` |
| Legacy route handling | Redirect `/api/auth/*` → `/auth/*` |

### Route Handler Responsibilities (`src/app/**/route.ts`)

| Responsibility | Example |
|----------------|---------|
| Return data | `NextResponse.json({ data })` |
| Return errors | `NextResponse.json({ error }, { status: 500 })` |
| Return redirects | `NextResponse.redirect(url)` |

### Route Handlers Must NEVER:

- Return `NextResponse.next()`
- Call `auth0.middleware()`
- Delegate flow control to proxy functions

---

## 6. Legacy Auth Path Policy

### Deprecated and Redirected Endpoints

| Path | Required Behavior |
|------|-------------------|
| `/api/login` | Return `410 Gone` |
| `/api/auth/login` | Redirect to `/auth/login` |
| `/api/auth/logout` | Redirect to `/auth/logout` |
| `/api/auth/callback` | Redirect to `/auth/callback` |

---

## 7. Validation Commands

### MANDATORY: Run Before Any PR Merge

```bash
# 1. proxy.ts exists at root
test -f proxy.ts && echo "PASS" || echo "FAIL: proxy.ts missing"

# 2. src/proxy.ts does NOT exist
test -f src/proxy.ts && echo "FAIL: src/proxy.ts exists" || echo "PASS"

# 3. middleware.ts does NOT exist (deprecated)
test -f middleware.ts && echo "FAIL: middleware.ts exists" || echo "PASS"

# 4. src/app/auth/ directory does NOT exist
test -d src/app/auth && echo "FAIL: src/app/auth/ exists" || echo "PASS"

# 5. NextResponse.next() only in proxy.ts
grep -rn "NextResponse.next" --include="*.ts" . | grep -v node_modules | grep -v "proxy.ts"
# Expected: (empty - no matches)
```

### RUNTIME VALIDATION (After Deployment)

```bash
# /auth/login must NOT return 404
curl -s -o /dev/null -w "%{http_code}" https://your-domain.com/auth/login
# Expected: 200 or 302 (redirect to Auth0) - NOT 404
```

---

## 8. Before vs After Architecture

### BEFORE (Broken - Next.js 16)

```
/app
├── middleware.ts                ❌ Deprecated in Next.js 16
├── src/
│   ├── proxy.ts                 ❌ Wrong location
│   └── app/
│       └── auth/                ❌ Shadows Auth0 routes
│           └── page.tsx
```

**Result**: `/auth/login` returns 404

### AFTER (Correct - Next.js 16)

```
/app
├── proxy.ts                     ✅ Root level, correct name
├── src/
│   ├── lib/
│   │   └── auth0.ts             ✅ Auth0 client (no middleware calls)
│   └── app/
│       ├── auth-status/         ✅ Renamed, doesn't shadow /auth/*
│       └── (no auth/ directory) ✅ Path free for Auth0 SDK
```

**Result**: `/auth/login` works correctly (redirects to Auth0)

---

## 9. Common Failure Modes

### Failure Mode 1: `/auth/login` Returns 404

**Symptoms**: Production shows 404 for `/auth/login`  
**Cause**: One of:
- `proxy.ts` not at root level
- `middleware.ts` used instead of `proxy.ts`
- `src/app/auth/` directory exists  
**Fix**: Follow this SoT exactly

### Failure Mode 2: `NextResponse.next() in route handler`

**Symptoms**: Runtime error in production  
**Cause**: Route handler calls `NextResponse.next()` or `auth0.middleware()`  
**Fix**: Only call these in `/proxy.ts`

### Failure Mode 3: Proxy Not Running

**Symptoms**: No authentication enforcement  
**Cause**: `proxy.ts` not exported correctly or wrong function name  
**Fix**: Ensure `export async function proxy(request)` exists

---

## 10. Quick Reference Card

```
┌─────────────────────────────────────────────────────────────────┐
│              NEXT.JS 16 AUTHENTICATION RULES                    │
├─────────────────────────────────────────────────────────────────┤
│ Boundary file         → /proxy.ts (ROOT, not src/)              │
│ Function name         → export async function proxy()           │
│ NextResponse.next()   → ONLY in /proxy.ts                       │
│ auth0.middleware()    → ONLY in /proxy.ts                       │
│ /auth/* routes        → RESERVED for Auth0 SDK                  │
│ src/app/auth/         → MUST NOT EXIST                          │
│ middleware.ts         → DEPRECATED, do not use                  │
│ /api/login            → Returns 410 Gone                        │
│ /api/auth/*           → Redirects to /auth/*                    │
├─────────────────────────────────────────────────────────────────┤
│ Route handlers return: NextResponse.json() or redirect()        │
│ Proxy returns:         NextResponse.next() or redirect()        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Document Authority

This document is the **canonical Source of Truth** for authentication and proxy architecture in this repository.

- Created in response to production incident: `/auth/login` returning 404
- Updated for Next.js 16 proxy convention (replaces middleware)
- Establishes permanent architectural constraints
- Must be consulted before any auth-related changes
- Violations are considered critical bugs regardless of test status

**END OF DOCUMENT**
