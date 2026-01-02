# Source of Truth — Authentication & Middleware Architecture

> **Document Status**: CANONICAL  
> **Last Updated**: December 2024  
> **Next.js Version**: 16.x  
> **Auth0 SDK Version**: @auth0/nextjs-auth0 v4.x  
> **Authority**: This document overrides any conflicting instructions, comments, or patterns found elsewhere.

---

## Purpose & Scope

This document establishes **non-negotiable architectural rules** for authentication and routing in this Next.js application. It exists to:

1. Prevent the recurrence of production errors like `/auth/login` returning 404
2. Ensure Auth0 integration follows the correct SDK v4 patterns
3. Establish clear boundaries between middleware and route handlers
4. Serve as the definitive reference for any future development

**If future instructions conflict with this document, THIS DOCUMENT WINS.**

---

## 1. Next.js Middleware File Convention

### RULE: Boundary File Location and Naming

| Requirement | Value |
|-------------|-------|
| File name | `middleware.ts` |
| Location | **Project root** (same level as `package.json`) |
| Function name | `export async function middleware(request)` |
| NOT allowed | `proxy.ts`, `src/middleware.ts`, any other name |

### DO ✅

```
/project-root
├── middleware.ts     ✅ CORRECT - Root level, named middleware.ts
├── package.json
├── next.config.mjs
└── src/
    └── app/
```

### DO NOT ❌

```
/project-root
├── proxy.ts          ❌ WRONG - Must be middleware.ts
├── src/
│   ├── middleware.ts ❌ WRONG - Must be at root, not in src/
│   └── proxy.ts      ❌ WRONG - Invalid name and location
```

---

## 2. `NextResponse.next()` Location

### RULE: Only Allowed in `/middleware.ts`

| Location | Allowed | 
|----------|--------|
| `/middleware.ts` (root) | ✅ YES |
| `src/app/**/route.ts` | ❌ **FORBIDDEN** |
| `src/**/*.ts` (any other file) | ❌ **FORBIDDEN** |
| API handlers | ❌ **FORBIDDEN** |

### DO ✅

```typescript
// /middleware.ts (ROOT LEVEL ONLY)
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
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

## 3. Auth0 Route Ownership (SDK v4)

### RULE: `/auth/*` Paths Are Reserved for Auth0 SDK

The `/auth/*` URL namespace is **exclusively owned by the Auth0 SDK v4**. The SDK handles these routes via middleware:

| Route | Purpose |
|-------|---------|
| `/auth/login` | Redirects to Auth0 Universal Login |
| `/auth/logout` | Clears session and logs out |
| `/auth/callback` | Handles OAuth callback |
| `/auth/me` | Returns session info (JSON) |
| `/auth/profile` | Returns user profile |
| `/auth/access-token` | Returns access token |
| `/auth/backchannel-logout` | Handles backchannel logout |

### CRITICAL: Auth0 SDK v4 Routes via Middleware (NOT Route Handlers)

In **@auth0/nextjs-auth0 v4**, auth routes are processed **directly by middleware**:

| Pattern | Status |
|---------|--------|
| `/middleware.ts` calling `auth0.middleware()` | ✅ **REQUIRED** |
| `src/app/auth/[auth0]/route.ts` | ❌ **FORBIDDEN** (SDK needs full pathname) |
| `src/app/auth/[...auth0]/route.ts` | ❌ **FORBIDDEN** |
| `src/pages/api/auth/[...auth0].ts` | ❌ **FORBIDDEN** (Pages Router pattern) |
| `src/app/auth/page.tsx` | ❌ **FORBIDDEN** (shadows routes) |

### DO ✅

```typescript
// /middleware.ts
if (pathname.startsWith('/auth')) {
  return await auth0.middleware(request);  // ✅ Direct delegation
}
```

### DO NOT ❌

```
src/app/auth/                    ❌ FORBIDDEN - Shadows middleware
src/app/auth/[auth0]/route.ts    ❌ FORBIDDEN - SDK needs full pathname
```

### Why Middleware, Not Route Handlers?

The Auth0 SDK v4 `handler()` function expects the **full pathname** (`/auth/login`, `/auth/callback`). 
Route handlers only receive the dynamic segment (`login`, `callback`), which breaks route matching.

---

## 4. Auth0 SDK Integration Pattern

### RULE: Middleware Processes /auth/* Directly

The architecture is simple:

1. **Middleware** (`/middleware.ts`): Processes `/auth/*` via `auth0.middleware()`, protects other routes
2. **No route handlers** for `/auth/*` - SDK handles everything via middleware

```typescript
// /middleware.ts
import { auth0 } from "./src/lib/auth0";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // CRITICAL: Delegate /auth/* directly to Auth0 SDK v4
  if (pathname.startsWith("/auth")) {
    return await auth0.middleware(request);  // ✅ Direct processing
  }

  // ... other routing logic (session checks, etc.) ...
}
```

### RULE: Where `auth0.middleware()` May Be Called

| Location | Allowed |
|----------|--------|
| `/middleware.ts` | ✅ YES |
| Route handlers (`app/**/route.ts`) | ❌ **FORBIDDEN** |
| Server Actions | ❌ **FORBIDDEN** |

---

## 5. Responsibility Separation

### Middleware Responsibilities (`/middleware.ts`)

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
- Delegate flow control to middleware functions

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
# 1. middleware.ts exists at root
test -f middleware.ts && echo "PASS" || echo "FAIL: middleware.ts missing"

# 2. proxy.ts does NOT exist (deprecated pattern)
test -f proxy.ts && echo "FAIL: proxy.ts exists" || echo "PASS"

# 3. src/middleware.ts does NOT exist (wrong location)
test -f src/middleware.ts && echo "FAIL: src/middleware.ts exists" || echo "PASS"

# 4. Auth0 route handler EXISTS
test -f src/app/auth/\[auth0\]/route.ts && echo "PASS" || echo "FAIL: Auth0 route handler missing"

# 5. No pages router Auth0 handlers
test -f src/pages/api/auth/\[...auth0\].ts && echo "FAIL" || echo "PASS"

# 6. No page.tsx in auth directory (would shadow routes)
test -f src/app/auth/page.tsx && echo "FAIL" || echo "PASS"
```

### RUNTIME VALIDATION (After Deployment)

```bash
# /auth/login must NOT return 404
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/auth/login
# Expected: 200 or 302 (redirect to Auth0) - NOT 404

curl -s -o /dev/null -w "%{http_code}" https://your-domain.com/auth/login
# Expected: 200 or 302 (redirect to Auth0) - NOT 404
```

---

## 8. Before vs After Architecture

### BEFORE (Broken)

```
/project-root
├── proxy.ts                     ❌ Wrong file name
├── src/
│   ├── middleware.ts            ❌ Wrong location
│   └── app/
│       └── (no auth/ directory) → 404 on /auth/login
```

**Result**: `/auth/login` returns 404

### AFTER (Correct)

```
/project-root
├── middleware.ts                ✅ Root level, correct name
├── src/
│   ├── lib/
│   │   └── auth0.ts             ✅ Auth0 client
│   └── app/
│       ├── auth/
│       │   └── [auth0]/
│       │       └── route.ts     ✅ Auth0 route handler
│       └── auth-status/         ✅ Doesn't shadow /auth/*
```

**Result**: `/auth/login` works correctly (redirects to Auth0)

---

## 9. Common Failure Modes

### Failure Mode 1: `/auth/login` Returns 404

**Symptoms**: Production shows 404 for `/auth/login`  
**Cause**: One of:
- `middleware.ts` not at root level
- `proxy.ts` used instead of `middleware.ts`
- `src/app/auth/` directory exists
- Explicit Auth0 route handlers shadowing SDK routes  
**Fix**: Follow this SoT exactly

### Failure Mode 2: `NextResponse.next() in route handler`

**Symptoms**: Runtime error in production  
**Cause**: Route handler calls `NextResponse.next()` or `auth0.middleware()`  
**Fix**: Only call these in `/middleware.ts`

### Failure Mode 3: Middleware Not Running

**Symptoms**: No authentication enforcement  
**Cause**: `middleware.ts` not exported correctly or wrong function name  
**Fix**: Ensure `export async function middleware(request)` exists

---

## 10. Quick Reference Card

```
┌─────────────────────────────────────────────────────────────────┐
│              AUTHENTICATION ARCHITECTURE RULES                   │
├─────────────────────────────────────────────────────────────────┤
│ Middleware file       → /middleware.ts (ROOT, not src/)          │
│ Function name         → export async function middleware()       │
│ NextResponse.next()   → ONLY in /middleware.ts                   │
│ auth0.middleware()    → In /src/app/auth/[auth0]/route.ts        │
│ /auth/* routes        → Handled by route handler + SDK           │
│ src/app/auth/[auth0]/ → MUST EXIST (route handler)               │
│ src/app/auth/page.tsx → MUST NOT EXIST (shadows routes)          │
│ proxy.ts              → MUST NOT EXIST (use middleware.ts)       │
│ /api/login            → Returns 410 Gone                         │
│ /api/auth/*           → Redirects to /auth/*                     │
├─────────────────────────────────────────────────────────────────┤
│ Route handlers return: NextResponse.json() or redirect()         │
│ Middleware returns:    NextResponse.next() or redirect()         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Document Authority

This document is the **canonical Source of Truth** for authentication and middleware architecture in this repository.

- Created in response to production incident: `/auth/login` returning 404
- Updated for Auth0 SDK v4 (middleware-based route auto-mounting)
- Establishes permanent architectural constraints
- Must be consulted before any auth-related changes
- Violations are considered critical bugs regardless of test status

**END OF DOCUMENT**
