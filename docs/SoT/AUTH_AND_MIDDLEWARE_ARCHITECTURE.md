# Source of Truth — Authentication & Middleware Architecture (Next.js + Auth0)

> **Document Status**: CANONICAL  
> **Last Updated**: December 2024  
> **Applies To**: All code in this repository  
> **Authority**: This document overrides any conflicting instructions, comments, or patterns found elsewhere.

---

## Purpose & Scope

This document establishes **non-negotiable architectural rules** for authentication and middleware in this Next.js application. It exists to:

1. Prevent the recurrence of production errors like `"NextResponse.next() was used in a app route handler"`
2. Ensure Auth0 integration follows the correct SDK patterns
3. Establish clear boundaries between middleware and route handlers
4. Serve as the definitive reference for any future development

**If future instructions conflict with this document, THIS DOCUMENT WINS.**

---

## 1. Single Source of Truth for Middleware

### RULE: `NextResponse.next()` Location

| Location | Allowed | 
|----------|---------|
| `/middleware.ts` (root) | ✅ YES |
| `src/app/**/route.ts` | ❌ **FORBIDDEN** |
| `src/**/*.ts` (any other file) | ❌ **FORBIDDEN** |
| API handlers | ❌ **FORBIDDEN** |
| Utility/helper files | ❌ **FORBIDDEN** |
| Proxy files | ❌ **FORBIDDEN** |

### DO ✅

```typescript
// /middleware.ts (ROOT LEVEL ONLY)
import { NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  // ... authentication logic ...
  return NextResponse.next(); // ✅ ALLOWED HERE
}
```

### DO NOT ❌

```typescript
// src/app/api/example/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.next(); // ❌ HARD VIOLATION - NEVER DO THIS
}
```

```typescript
// src/lib/proxy.ts or src/proxy.ts
export function proxy(req: NextRequest) {
  return NextResponse.next(); // ❌ HARD VIOLATION - NO PROXY FILES
}
```

### Validation Command

```bash
# This command must return ONLY /middleware.ts
grep -rn "NextResponse.next" --include="*.ts" --include="*.tsx" . | grep -v node_modules | grep -v middleware.ts

# Expected output: (empty - no matches)
# If ANY file appears, it is a VIOLATION
```

---

## 2. Auth0 Route Ownership

### RULE: `/auth/*` Paths Are Reserved

The `/auth/*` URL namespace is **exclusively owned by the Auth0 SDK**. The SDK automatically handles:

- `/auth/login` → Redirects to Auth0 Universal Login
- `/auth/logout` → Clears session and logs out
- `/auth/callback` → Handles OAuth callback
- `/auth/me` → Returns session info (JSON)
- `/auth/profile` → Returns user profile

### DO ✅

- Let `auth0.middleware()` handle all `/auth/*` routes
- Keep `/auth/*` path FREE of any application code

### DO NOT ❌

```
src/app/auth/             ❌ FORBIDDEN - This directory must NOT exist
src/app/auth/page.tsx     ❌ FORBIDDEN - Shadows Auth0 routes
src/app/auth/login/       ❌ FORBIDDEN - Conflicts with SDK
src/app/auth/layout.tsx   ❌ FORBIDDEN - Intercepts Auth0 flow
```

### Why?

When `src/app/auth/` exists, Next.js tries to serve pages from that directory BEFORE the middleware can delegate to Auth0. This causes:

- 404 errors on `/auth/login`
- Auth0 SDK routes being shadowed
- Authentication flow breaking completely

### Validation Command

```bash
# This directory must NOT exist
ls -la src/app/auth/ 2>/dev/null && echo "VIOLATION: src/app/auth/ exists!" || echo "OK: No auth directory"
```

---

## 3. Auth0 Middleware Usage

### RULE: Where `auth0.middleware()` May Be Called

| Location | Allowed |
|----------|---------|
| `/middleware.ts` | ✅ YES |
| Route handlers (`app/**/route.ts`) | ❌ **FORBIDDEN** |
| API routes | ❌ **FORBIDDEN** |
| Server Actions | ❌ **FORBIDDEN** |
| Any other file | ❌ **FORBIDDEN** |

### DO ✅

```typescript
// /middleware.ts
import { auth0 } from "./src/lib/auth0";

export async function middleware(request: NextRequest) {
  if (pathname.startsWith("/auth")) {
    return auth0.middleware(request); // ✅ ALLOWED - middleware calling middleware
  }
}
```

### DO NOT ❌

```typescript
// src/app/api/auth/[...auth0]/route.ts
import { auth0 } from "@/lib/auth0";

export async function GET(req: NextRequest) {
  return auth0.middleware(req); // ❌ HARD VIOLATION
  // auth0.middleware() returns NextResponse.next() internally
  // This causes: "NextResponse.next() was used in a app route handler"
}
```

### Why?

`auth0.middleware()` internally returns `NextResponse.next()`, which is **only valid in middleware context**. When called from a route handler, Next.js throws a fatal error.

---

## 4. Responsibility Separation

### Middleware Responsibilities

The `/middleware.ts` file is responsible for:

| Responsibility | Example |
|----------------|---------|
| Authentication enforcement | Check `appSession` cookie |
| Route protection | Redirect unauthenticated users |
| Auth0 SDK delegation | Call `auth0.middleware()` for `/auth/*` |
| Request continuation | Return `NextResponse.next()` |
| Legacy route handling | Redirect `/api/auth/*` → `/auth/*` |

### Route Handler Responsibilities

Files in `src/app/**/route.ts` are responsible for:

| Responsibility | Example |
|----------------|---------|
| Return data | `NextResponse.json({ data })` |
| Return errors | `NextResponse.json({ error }, { status: 500 })` |
| Return redirects | `NextResponse.redirect(url)` |

### Route Handlers Must NEVER:

- Return `NextResponse.next()`
- Call `auth0.middleware()`
- Delegate flow control to other middleware-like functions
- Import or use proxy/middleware utilities

---

## 5. Legacy Auth Path Policy

### Deprecated Endpoints

| Path | Required Behavior |
|------|-------------------|
| `/api/login` | Return `410 Gone` |
| `/api/auth/login` | Redirect to `/auth/login` |
| `/api/auth/logout` | Redirect to `/auth/logout` |
| `/api/auth/callback` | Redirect to `/auth/callback` |

### Implementation (in middleware.ts)

```typescript
// Deprecated routes - return 410
if (pathname === "/api/login") {
  return NextResponse.json(
    { error: "Gone", message: "Use /auth/login" },
    { status: 410 }
  );
}

// Legacy auth routes - redirect
if (pathname.startsWith("/api/auth/")) {
  const newPath = pathname.replace("/api/auth/", "/auth/");
  return NextResponse.redirect(new URL(newPath, request.url));
}
```

### Why?

Legacy paths must not be silently supported because:

1. They create confusion about the correct auth flow
2. They may bypass security controls
3. They prevent clean deprecation

---

## 6. Regression Prevention

### Build Success Is NOT Sufficient

A successful `yarn build` does not mean the architecture is correct. The following checks MUST pass:

### Compliance Validation Checklist

```bash
# 1. NextResponse.next() only in middleware.ts
grep -rn "NextResponse.next" --include="*.ts" . | grep -v node_modules | grep -v "middleware.ts"
# Expected: (empty)

# 2. No auth0.middleware() in route handlers
grep -rn "auth0.middleware" src/app/ --include="*.ts"
# Expected: (empty)

# 3. No src/app/auth/ directory
test -d src/app/auth && echo "FAIL" || echo "PASS"
# Expected: PASS

# 4. middleware.ts exists at root
test -f middleware.ts && echo "PASS" || echo "FAIL"
# Expected: PASS

# 5. No proxy.ts files
find . -name "proxy.ts" -not -path "./node_modules/*"
# Expected: (empty)
```

### PR Validation Rule

Any Pull Request that violates these rules is **INVALID**, regardless of:

- Whether tests pass
- Whether the build succeeds
- Whether the feature works locally
- Whether the author believes it's an exception

**There are no exceptions to these rules.**

---

## Before vs After Architecture

### BEFORE (Broken Architecture)

```
/app
├── src/
│   ├── app/
│   │   ├── auth/                    ❌ Shadowed Auth0 routes
│   │   │   └── page.tsx             ❌ Caused 404 on /auth/login
│   │   └── api/
│   │       └── auth/
│   │           └── [...auth0]/
│   │               └── route.ts     ❌ Called auth0.middleware()
│   └── proxy.ts                     ❌ Used NextResponse.next()
└── (no middleware.ts)               ❌ No root middleware
```

**Result**: `"NextResponse.next() was used in a app route handler"` → HTTP 500

### AFTER (Correct Architecture)

```
/app
├── middleware.ts                    ✅ Root-level, owns NextResponse.next()
├── src/
│   ├── app/
│   │   ├── auth-status/             ✅ Renamed, doesn't shadow /auth/*
│   │   │   └── page.tsx
│   │   └── api/
│   │       └── (no auth handlers)   ✅ Auth0 handled by middleware
│   └── lib/
│       └── auth0.ts                 ✅ Auth0 client only
└── (no proxy.ts)                    ✅ Deleted
```

**Result**: Auth0 routes work correctly, no middleware errors

---

## Common Failure Modes

### Failure Mode 1: Creating `src/app/auth/`

**Symptom**: `/auth/login` returns 404  
**Cause**: Next.js serves the page instead of letting middleware handle it  
**Fix**: Delete `src/app/auth/` entirely

### Failure Mode 2: Route Handler Calling `auth0.middleware()`

**Symptom**: `"NextResponse.next() was used in a app route handler"`  
**Cause**: `auth0.middleware()` returns `NextResponse.next()` internally  
**Fix**: Only call `auth0.middleware()` from `/middleware.ts`

### Failure Mode 3: Creating Proxy Files

**Symptom**: Various middleware errors, inconsistent behavior  
**Cause**: Proxy files that export `config` confuse Next.js  
**Fix**: Delete all proxy files, use only `/middleware.ts`

### Failure Mode 4: `NextResponse.next()` in API Routes

**Symptom**: `"NextResponse.next() was used in a app route handler"`  
**Cause**: API routes cannot use middleware-style responses  
**Fix**: Return `NextResponse.json()` or `NextResponse.redirect()` instead

---

## Why This Architecture Is Non-Negotiable

1. **Next.js App Router Constraint**: `NextResponse.next()` is architecturally invalid outside middleware
2. **Auth0 SDK Design**: The SDK expects middleware-level integration, not route handlers
3. **Production Stability**: Violations cause HTTP 500 errors that break authentication entirely
4. **Future-Proofing**: These rules align with Next.js and Auth0 best practices

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────────────┐
│                    ARCHITECTURE RULES                           │
├─────────────────────────────────────────────────────────────────┤
│ NextResponse.next()    → ONLY in /middleware.ts                 │
│ auth0.middleware()     → ONLY in /middleware.ts                 │
│ /auth/* routes         → RESERVED for Auth0 SDK                 │
│ src/app/auth/          → MUST NOT EXIST                         │
│ src/proxy.ts           → MUST NOT EXIST                         │
│ /api/login             → Returns 410 Gone                       │
│ /api/auth/*            → Redirects to /auth/*                   │
├─────────────────────────────────────────────────────────────────┤
│ Route handlers return: NextResponse.json() or redirect()        │
│ Middleware returns:    NextResponse.next() or redirect()        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Document Authority

This document is the **canonical Source of Truth** for authentication and middleware architecture in this repository.

- Created in response to production incident: `NextResponse.next() in route handler`
- Establishes permanent architectural constraints
- Must be consulted before any auth-related changes
- Violations are considered critical bugs regardless of test status

**END OF DOCUMENT**
