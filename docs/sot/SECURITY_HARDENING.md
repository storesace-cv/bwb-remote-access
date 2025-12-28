# Security Hardening (Sprint 1)

**Last Updated:** 28 December 2025  
**Status:** Implemented

---

## Overview

Sprint 1 introduced centralized security controls for all Supabase Edge Functions, replacing ad-hoc JWT validation with a unified authentication module.

---

## 1. Centralized JWT Validation

**File:** `supabase/functions/_shared/auth.ts`

### Purpose

All Edge Functions now use a single `validateJwt()` function that:
1. Extracts the JWT from `Authorization: Bearer <token>` header
2. Validates token format and expiration locally (fast-fail)
3. Verifies signature via Supabase Auth API (`/auth/v1/user`)
4. Detects `service_role` tokens vs user tokens
5. Returns a normalized `AuthContext` object

### AuthContext Interface

```typescript
interface AuthContext {
  authUserId: string | null;   // User's auth.users.id (null for service_role)
  role: string | null;         // JWT role claim
  isServiceRole: boolean;      // true if service_role token detected
}

interface AuthResult {
  ok: boolean;
  context: AuthContext;
  error?: {
    code: string;              // e.g., "unauthorized", "upstream_error"
    message: string;
    status: number;            // HTTP status code
  };
}
```

### Usage Pattern (All Edge Functions)

```typescript
import {
  validateJwt,
  createLogger,
  generateCorrelationId,
  jsonResponse,
  authErrorResponse,
} from "../_shared/auth.ts";

// Inside handler:
const correlationId = generateCorrelationId();
const logger = createLogger("function-name", correlationId);

const authResult = await validateJwt(
  req.headers.get("Authorization"),
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  logger
);

if (!authResult.ok) {
  return authErrorResponse(authResult, corsHeaders);
}

const { authUserId, isServiceRole } = authResult.context;
```

### Why `verify_jwt: false` is Intentional

All Edge Functions export `config = { verify_jwt: false }` because:

1. **Manual validation provides more control** - We can detect service_role tokens and handle them differently
2. **Custom error messages** - Normalized Portuguese error messages for users
3. **Structured logging** - Every validation step is logged with correlationId
4. **Consistent behavior** - Same validation logic across all functions

**Security Note:** This is NOT a security bypass. JWT validation is always performed via the centralized `validateJwt()` function.

---

## 2. Structured Logging

### Log Format

All Edge Functions output JSON-structured logs:

```json
{
  "level": "info",
  "action": "register-device",
  "correlationId": "lxyz1234-abc5",
  "authUserId": "9ebfa3dd-392c-489d-882f-8a1762cb36e8",
  "message": "Device upserted successfully",
  "data": { "deviceId": "123456789" },
  "timestamp": "2025-12-28T03:15:00.000Z"
}
```

### Log Levels

| Level | Usage |
|-------|-------|
| `info` | Normal operations, successful actions |
| `warn` | Recoverable issues, validation failures |
| `error` | Unrecoverable errors, system failures |
| `debug` | Detailed technical information |

### Correlation ID

Every request receives a unique `correlationId` generated at the start:

```typescript
const correlationId = generateCorrelationId();
// Format: "<timestamp-base36>-<random-8-chars>"
// Example: "lxyz1234-abc5defg"
```

This ID is:
- Included in all log entries for the request
- Useful for tracing requests across distributed systems
- Returned in error responses for support debugging

### Logger Factory

```typescript
const logger = createLogger("function-name", correlationId);

logger.info("Message", { key: "value" }, authUserId);
logger.warn("Warning", { error: "details" });
logger.error("Error occurred", { stack: "..." });
```

---

## 3. Input Validation Rules

### Validation Helpers

**File:** `supabase/functions/_shared/auth.ts` (lines 349-440)

| Function | Rules |
|----------|-------|
| `validateDeviceId(input)` | Must be string, digits only, 6-12 characters |
| `validateMeshUsername(input)` | Must be string, non-empty, alphanumeric + `.@_-` |
| `validateNotes(input)` | Must be string or null, max 1000 characters |
| `validateFriendlyName(input)` | Must be string or null, max 255 characters |

### Validation Response Format

```typescript
// Success
{ valid: true, value: "123456789" }

// Failure
{ valid: false, value: "", error: "device_id must contain only digits" }
```

### register-device Specific Validation

```typescript
// device_id: REQUIRED, strictly validated
const deviceIdValidation = validateDeviceId(body.device_id);
if (!deviceIdValidation.valid) {
  return jsonResponse(
    { error: "invalid_device_id", message: deviceIdValidation.error },
    400,
    corsHeaders
  );
}

// friendly_name: optional, max 255 chars
// notes: optional, max 1000 chars
// observations: optional, max 1000 chars
// mesh_username: required only for service_role calls
```

---

## 4. Idempotency Guarantees

### register-device Idempotency

The `register-device` function uses PostgreSQL `UPSERT` with conflict resolution:

```typescript
const { data, error } = await supabaseAdmin
  .from("android_devices")
  .upsert(upsertRow, { onConflict: "device_id" })  // <-- Key constraint
  .select()
  .single();
```

**Behavior:**
- If `device_id` does not exist → INSERT new row
- If `device_id` exists → UPDATE existing row
- Multiple calls with same `device_id` → Same result (idempotent)

### Ownership Model

```typescript
if (existingOwner) {
  // Device already has an owner → keep existing owner
  ownerForUpsert = existingOwner;
} else {
  // Device has no owner → assign to caller
  ownerForUpsert = caller.id;
}
```

**Important:** Once a device has an owner, it cannot be "stolen" by another user via `register-device`. The original owner is preserved.

---

## 5. Updated Edge Functions

All 17 Edge Functions now use centralized auth:

| Function | Auth | Logging | Validation |
|----------|------|---------|------------|
| `register-device` | ✅ | ✅ | ✅ Full |
| `get-devices` | ✅ | ✅ | - |
| `remove-device` | ✅ | ✅ | ✅ device_id |
| `check-registration-status` | ✅ | ✅ | - |
| `start-registration-session` | ✅ | ✅ | - |
| `generate-qr-image` | ✅ | ✅ | - |
| `get-qr` | ✅ | ✅ | - |
| `get-registration-token` | ✅ | ✅ | - |
| `login` | ✅* | ✅ | - |
| `admin-create-auth-user` | ✅ | ✅ | - |
| `admin-list-mesh-users` | ✅ | ✅ | - |
| `admin-update-device` | ✅ | ✅ | - |
| `admin-delete-device` | ✅ | ✅ | - |
| `admin-list-groups` | ✅ | ✅ | - |
| `admin-create-group` | ✅ | ✅ | - |
| `admin-grant-permission` | ✅ | ✅ | - |
| `admin-revoke-permission` | ✅ | ✅ | - |

*`login` uses structured logging only (it issues tokens, doesn't validate them)

---

## 6. Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| `unauthorized` | 401 | Missing/invalid/expired token |
| `forbidden` | 403 | Valid token but insufficient permissions |
| `invalid_device_id` | 400 | Device ID validation failed |
| `invalid_json` | 400 | Request body is not valid JSON |
| `mesh_user_not_found` | 404 | No mesh_users record for auth user |
| `config_error` | 500 | Missing environment configuration |
| `database_error` | 500 | Database operation failed |
| `upstream_error` | 502 | Auth API call failed |
| `timeout` | 408 | Request timed out |

---

## 7. Security Considerations

### What Changed

- ✅ JWT validation is now consistent across all functions
- ✅ All validation failures are logged with context
- ✅ Input validation prevents malformed data
- ✅ Error messages are user-friendly (Portuguese)

### What Did NOT Change

- ❌ CORS remains `Access-Control-Allow-Origin: *` (documented as known constraint)
- ❌ JWT storage remains in localStorage (documented as known constraint)
- ❌ No new authentication mechanism introduced
- ❌ No database schema changes

---

**Next Review:** When security policies change or new Edge Functions are added
