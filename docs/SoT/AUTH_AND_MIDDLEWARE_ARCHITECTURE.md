# Source of Truth — Authentication & Middleware Architecture

> **Document Status**: CANONICAL  
> **Last Updated**: January 2026  
> **Next.js Version**: 16.x  
> **Auth0 SDK Version**: @auth0/nextjs-auth0 v4.x  
> **Authority**: This document overrides any conflicting instructions.

---

## Purpose

This document establishes **non-negotiable architectural rules** for authentication in this Next.js application. It exists to prevent:

- "The state parameter is invalid" errors
- Infinite redirect loops
- Cookie explosion (multiple transaction cookies)
- Multiple concurrent OAuth transactions
- 404 errors on `/auth/login` or `/auth/callback`

---

## OAuth/OIDC Invariants (NON-NEGOTIABLE)

### INVARIANT 1: CALLBACK IS TERMINAL AND UNGUARDED

> `/auth/callback` MUST complete without any authentication guards or redirects.

**Rules:**
- The `/auth/*` routes are delegated directly to `auth0.middleware()`
- Middleware MUST NOT check for session cookies on `/auth/*` routes
- Middleware MUST NOT redirect `/auth/*` routes to `/auth/login`
- The callback handler processes the OAuth response and establishes the session

**Violation causes:** Infinite redirect loops, "state invalid" errors

### INVARIANT 2: SINGLE ACTIVE AUTH TRANSACTION

> Only ONE authentication transaction may exist per client at any time.

**Implementation:**
```typescript
// In auth0.ts
new Auth0Client({
  enableParallelTransactions: false,  // CRITICAL
})
```

**Rules:**
- While a transaction is pending, no new `/authorize` request may be initiated
- No new `state` value may be generated until current transaction completes
- Re-entrancy is forbidden

**Violation causes:** Multiple state values, transaction cookie explosion, "state invalid" errors

### INVARIANT 3: STATE ↔ TRANSACTION CONSISTENCY

> Every authorization `state` MUST map 1:1 to persisted transaction data.

**Rules:**
- Transaction data MUST exist when callback is processed
- No logic may invalidate or overwrite transaction data prematurely
- Cookie secure/sameSite settings must be consistent across login and callback

**Violation causes:** "state invalid" errors, lost auth context

### INVARIANT 4: NO AUTH LOOPS

> Authentication failures MUST terminate cleanly, never restart auth.

**Implementation:**
```typescript
// In auth0.ts
new Auth0Client({
  onCallback: async (error, context, session) => {
    if (error) {
      // Redirect to error page, NOT back to login
      return NextResponse.redirect('/auth-error?e=' + error.code);
    }
    // Success continues normally
  },
})
```

**Rules:**
- After successful callback, user reaches protected page (NOT login)
- On failure, user reaches `/auth-error` (NOT login)
- `/auth-error` is PUBLIC - no auth required
- User must manually click "Try Again" to restart auth

**Violation causes:** Infinite redirect loops

### INVARIANT 5: SESSION PAYLOAD CONTROL

> Cookies must remain bounded and consistent.

**Rules:**
- No "infinitely stacking cookies"
- Session cookie must not exceed safe size limits
- Transaction cookie is single-use and cleaned up after callback
- Cookie settings must match proxy configuration:
  - `secure: true` in production (HTTPS)
  - `sameSite: 'lax'` for OAuth redirects
  - `path: '/'` for both session and transaction cookies

**Violation causes:** Header explosion, proxy failures

### INVARIANT 6: CONFIGURATION COHERENCE

> All URLs and environment bindings must be internally consistent.

**Required Environment Variables:**
```
AUTH0_SECRET=<32+ char random hex string>
AUTH0_DOMAIN=<tenant>.eu.auth0.com
AUTH0_CLIENT_ID=<from Auth0 dashboard>
AUTH0_CLIENT_SECRET=<from Auth0 dashboard>
APP_BASE_URL=https://rustdesk.bwb.pt
```

**Auth0 Dashboard Settings:**
```
Allowed Callback URLs: https://rustdesk.bwb.pt/auth/callback
Allowed Logout URLs:   https://rustdesk.bwb.pt
Allowed Web Origins:   https://rustdesk.bwb.pt
```

**Violation causes:** Redirect URI mismatch, cookie domain issues

---

## Middleware Architecture

### Model: ALLOWLIST-BASED PROTECTION

The middleware uses an **allowlist model** where only explicitly listed routes require authentication. This prevents accidental auth triggers.

```
┌─────────────────────────────────────────────────────────────────┐
│                    MIDDLEWARE FLOW                               │
├─────────────────────────────────────────────────────────────────┤
│  1. Static assets (/_next/*, etc)  → NextResponse.next()        │
│  2. Auth0 routes (/auth/*)         → auth0.middleware() [1]     │
│  3. Explicitly public routes       → NextResponse.next()        │
│  4. Protected routes (/dashboard)  → Check session [2]          │
│  5. Everything else                → NextResponse.next()        │
├─────────────────────────────────────────────────────────────────┤
│  [1] INVARIANT 1: No guards, no redirects, just delegate        │
│  [2] Redirect to /auth/login?returnTo=<path> if no session      │
└─────────────────────────────────────────────────────────────────┘
```

### Protected Routes (Require Auth)

```typescript
const PROTECTED_ROUTE_PREFIXES = [
  "/dashboard",
  "/mesh",
  "/admin",
  "/provisioning",
];
```

Only these routes trigger a redirect to `/auth/login` when no session exists.

### Explicitly Public Routes

```typescript
const PUBLIC_ROUTES = [
  "/",
  "/auth-error",
  "/api/auth0/debug",
  "/api/auth0/me",
  "/api/auth0/test-config",
];
```

### Auth0 SDK Routes

```
/auth/login     → Initiates login (redirect to Auth0)
/auth/logout    → Clears session (redirect to Auth0)
/auth/callback  → Processes OAuth response [TERMINAL]
/auth/me        → Returns session info (JSON)
```

---

## File Structure

```
/project-root
├── middleware.ts                    # Auth boundary (root level)
├── src/
│   ├── lib/
│   │   ├── auth0.ts                 # Auth0 client configuration
│   │   └── baseUrl.ts               # Canonical URL resolver
│   └── app/
│       ├── auth-error/
│       │   └── page.tsx             # Error page (PUBLIC)
│       ├── dashboard/               # Protected
│       ├── mesh/                    # Protected
│       └── (public pages)           # Public
└── docs/
    └── SoT/
        └── AUTH_AND_MIDDLEWARE_ARCHITECTURE.md  # This file
```

---

## Validation Commands

### Pre-Deploy Checklist

```bash
# 1. middleware.ts at root
test -f middleware.ts && echo "✓ middleware.ts exists" || echo "✗ FAIL"

# 2. Auth0 config in auth0.ts has parallel transactions disabled
grep -q "enableParallelTransactions: false" src/lib/auth0.ts && \
  echo "✓ Parallel transactions disabled" || echo "✗ FAIL"

# 3. onCallback handler exists
grep -q "onCallback:" src/lib/auth0.ts && \
  echo "✓ onCallback handler exists" || echo "✗ FAIL"

# 4. auth-error page exists
test -f src/app/auth-error/page.tsx && \
  echo "✓ auth-error page exists" || echo "✗ FAIL"

# 5. No src/app/auth/ directory (would shadow SDK routes)
test ! -d src/app/auth && \
  echo "✓ No shadowing auth directory" || echo "✗ FAIL"
```

### Runtime Validation

```bash
# /auth/login returns redirect (302) to Auth0, not 404
curl -sI https://rustdesk.bwb.pt/auth/login | head -5

# /auth-error is accessible without auth
curl -sI https://rustdesk.bwb.pt/auth-error | grep "200 OK"

# Protected route redirects to login
curl -sI https://rustdesk.bwb.pt/dashboard | grep "307"
```

---

## Troubleshooting

### "The state parameter is invalid"

**Cause:** Multiple concurrent auth transactions overwriting transaction cookies.

**Fix:** Ensure `enableParallelTransactions: false` in auth0.ts.

### Infinite redirect loops

**Cause:** `/auth/callback` is protected or `onCallback` restarts auth on error.

**Fix:** 
- Middleware must NOT guard `/auth/*` routes
- `onCallback` must redirect to `/auth-error` on failure

### Cookie explosion in headers

**Cause:** Parallel transactions enabled, or session too large.

**Fix:** 
- Disable parallel transactions
- Keep session payload minimal

### 404 on /auth/login

**Cause:** Auth routes shadowed by `src/app/auth/` directory.

**Fix:** Delete `src/app/auth/` - SDK handles these routes via middleware.

---

## Acceptance Criteria

A deploy is BLOCKED unless ALL of the following are true:

| # | Criterion | Test |
|---|-----------|------|
| 1 | Login produces exactly ONE /authorize request | NetLog |
| 2 | Login produces exactly ONE /auth/callback | NetLog |
| 3 | No "state invalid" errors in 50 login attempts | Automated test |
| 4 | No redirect loops | Manual + automated |
| 5 | Failure terminates in /auth-error | Automated test |
| 6 | Cookie count stable (no explosion) | NetLog |

---

**END OF DOCUMENT**
