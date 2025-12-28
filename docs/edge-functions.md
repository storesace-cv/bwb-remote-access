# Edge Functions

## Overview

Supabase Edge Functions provide the backend API. All functions are written in TypeScript and run on Deno.

## Security Module (`_shared/auth.ts`)

Centralized security for all Edge Functions.

### JWT Validation

```typescript
import { validateJwt, createLogger, generateCorrelationId } from "../_shared/auth.ts";

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

### Validation Flow

1. Check `Authorization` header present and starts with `Bearer `
2. Decode JWT payload (without signature verification)
3. Check token expiration locally (fast fail)
4. Validate signature via Supabase Auth API (`/auth/v1/user`)
5. Return `AuthContext` with `authUserId`, `role`, `isServiceRole`

### Service Role Detection

Service role tokens bypass user-level restrictions:

- Direct match with `SUPABASE_SERVICE_ROLE_KEY`
- JWT payload contains `role: "service_role"`

### Input Validators

| Function | Rules |
|----------|-------|
| `validateDeviceId(value)` | String, digits only, 6-12 characters |
| `validateMeshUsername(value)` | String, alphanumeric + `.`, `_`, `-`, `@`, max 255 |
| `validateFriendlyName(value)` | Optional string, max 255 |
| `validateNotes(value)` | Optional string, max 1000 |

Each returns `{ valid: boolean; value: string; error?: string }`.

### Structured Logging

All logs output as JSON:

```json
{
  "level": "info",
  "action": "register-device",
  "correlationId": "m1abc123-xyz789",
  "timestamp": "2025-12-28T10:00:00.000Z",
  "message": "Device upserted successfully",
  "data": { "device_id": "123456789" },
  "authUserId": "uuid-here"
}
```

Logger methods: `info()`, `warn()`, `error()`, `debug()`

### Response Helpers

```typescript
// Success response
return jsonResponse({ success: true, data }, 200, corsHeaders);

// Auth error (from validateJwt result)
return authErrorResponse(authResult, corsHeaders);

// Custom error
return jsonResponse({ error: "code", message: "desc" }, 400, corsHeaders);
```

## Functions Reference

### `register-device`

Registers or updates a device. Uses upsert on `device_id` for idempotency.

**Method:** POST

**Body:**
```json
{
  "device_id": "123456789",
  "friendly_name": "Tablet Reception",
  "group_id": "uuid",
  "subgroup_id": "uuid",
  "observations": "Optional notes",
  "rustdesk_password": "optional"
}
```

**Logic:**
1. Validate all inputs using `_shared/auth.ts` validators
2. Resolve caller from JWT → `mesh_users` table
3. If device exists with owner, preserve existing owner
4. If device has no owner, assign to caller
5. Build `notes` field from group names + observations
6. Upsert to `android_devices`

### `get-devices`

Lists devices owned by the authenticated user.

**Method:** GET

**Returns:** Array of device objects

### `admin-*` Functions

Admin-only operations (require canonical admin user):

- `admin-list-mesh-users` - List all mesh users
- `admin-list-groups` - List device groups
- `admin-update-device` - Reassign device ownership
- `admin-delete-device` - Delete a device

### Other Functions

- `start-registration-session` - Create QR code session (5 min TTL)
- `check-registration-status` - Check if device appeared during session
- `generate-qr-image` - Generate QR code SVG
- `remove-device` - User deletes own device

## CORS Configuration

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, PATCH, OPTIONS",
};
```

All functions handle `OPTIONS` preflight requests.

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `unauthorized` | 401 | Missing/invalid/expired token |
| `invalid_device_id` | 400 | Device ID format invalid |
| `mesh_user_not_found` | 404 | No mesh_user for auth user |
| `upsert_failed` | 500 | Database operation failed |
| `config_error` | 500 | Missing environment variables |
