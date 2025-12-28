# QR Hybrid Adoption Flow

## Overview

Devices are registered using a hybrid approach:

1. **QR Code** - Configures RustDesk on the Android device
2. **Manual ID Entry** - User enters the RustDesk ID to claim ownership

This ensures deterministic ownership: the device belongs to whoever submits its ID.

## Flow Sequence

```
┌──────────────┐     ┌─────────────────┐     ┌──────────────────┐
│   User       │     │    Frontend     │     │  Edge Functions  │
└──────┬───────┘     └────────┬────────┘     └────────┬─────────┘
       │                      │                       │
       │ Click "Add Device"   │                       │
       │─────────────────────>│                       │
       │                      │                       │
       │                      │ POST start-session    │
       │                      │──────────────────────>│
       │                      │                       │
       │                      │ GET generate-qr-image │
       │                      │──────────────────────>│
       │                      │                       │
       │     Modal with QR    │<──────────────────────│
       │<─────────────────────│                       │
       │                      │                       │
       │ Scan QR on Android   │                       │
       │                      │                       │
       │ See RustDesk ID      │                       │
       │ (e.g., 123456789)    │                       │
       │                      │                       │
       │ Enter ID in modal    │                       │
       │─────────────────────>│                       │
       │                      │                       │
       │                      │ POST register-device  │
       │                      │ { device_id: "..." }  │
       │                      │──────────────────────>│
       │                      │                       │
       │                      │     Upsert device     │
       │                      │     Set owner = user  │
       │                      │                       │
       │                      │<──────────────────────│
       │   Success message    │                       │
       │<─────────────────────│                       │
       │                      │                       │
       │ Device in "Unadopted"│                       │
       │<─────────────────────│                       │
       │                      │                       │
       │ Click "Adopt"        │                       │
       │─────────────────────>│                       │
       │                      │                       │
       │ Fill form (group,    │                       │
       │ name, etc.)          │                       │
       │─────────────────────>│                       │
       │                      │ POST register-device  │
       │                      │ { device_id, notes }  │
       │                      │──────────────────────>│
       │                      │                       │
       │ Device adopted       │<──────────────────────│
       │<─────────────────────│                       │
```

## Frontend Implementation

### Registration Modal (`RegistrationModal.tsx`)

Displays:
- QR code image (for RustDesk configuration)
- Countdown timer (5 minutes)
- Manual ID entry form

```typescript
// Hybrid ID entry section
<input
  type="text"
  value={hybridDeviceIdInput}
  onChange={(e) => onHybridInputChange(e.target.value.replace(/\D/g, ""))}
  maxLength={12}
  placeholder="RustDesk ID (ex: 123456789)"
/>
<button onClick={onHybridSubmit}>Submit</button>
```

### Registration Hook (`useDeviceRegistration.ts`)

Validation rules:
- Digits only (`/^\d+$/`)
- Length: 6-12 characters
- Whitespace stripped

```typescript
const submitHybridDeviceId = async () => {
  const sanitized = hybridDeviceIdInput.replace(/\s+/g, "");

  // Validation
  if (!/^\d+$/.test(sanitized)) { /* error */ }
  if (sanitized.length < 6 || sanitized.length > 12) { /* error */ }

  // Submit to backend
  await callEdgeFunction("register-device", {
    method: "POST",
    body: { device_id: sanitized }
  });
};
```

## Backend Implementation

### register-device Function

1. **Input Validation** (via `_shared/auth.ts`):
   ```typescript
   const deviceIdValidation = validateDeviceId(body.device_id);
   if (!deviceIdValidation.valid) {
     return jsonResponse(
       { error: "invalid_device_id", message: deviceIdValidation.error },
       400
     );
   }
   ```

2. **Resolve Caller**:
   ```typescript
   // Get mesh_user from JWT's auth_user_id
   const caller = await getMeshUserByAuthUserId(authUserId);
   ```

3. **Ownership Logic**:
   ```typescript
   if (existingDevice?.owner) {
     // Keep existing owner
     ownerForUpsert = existingDevice.owner;
   } else {
     // Assign to caller
     ownerForUpsert = caller.id;
   }
   ```

4. **Upsert**:
   ```typescript
   await supabaseAdmin
     .from("android_devices")
     .upsert({ device_id, owner, ... }, { onConflict: "device_id" });
   ```

## Device States

| State | Condition | UI Location |
|-------|-----------|-------------|
| Unregistered | Not in database | N/A |
| Unadopted | `owner` set, `notes` empty | "Devices to Adopt" |
| Adopted | `owner` set, `notes` has content | Grouped device list |

## Adoption Process

After hybrid registration, device appears in "Unadopted" list. User clicks "Adopt" to:

1. Set `friendly_name`
2. Assign to `group_id` / `subgroup_id`
3. Add optional `observations`
4. Set `rustdesk_password` (optional)

The `notes` field is built as: `"Group Name | Subgroup Name | Observations"`

## Error Handling

| Error Code | Cause | User Message |
|------------|-------|---------------|
| `invalid_device_id` | Non-digits or wrong length | "RustDesk ID must be 6-12 digits" |
| `mesh_user_not_found` | User not in mesh_users table | "User not found" |
| `unauthorized` | Invalid/expired JWT | "Session expired" |

## Idempotency

The `device_id` column has a unique constraint. Upsert behavior:
- New ID → Insert new row
- Existing ID → Update existing row
- Ownership preserved if already set
