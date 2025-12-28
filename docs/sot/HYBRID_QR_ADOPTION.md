# Hybrid QR-Code Adoption Flow

**Last Updated:** 28 December 2025  
**Status:** Implemented

---

## Overview

The Hybrid QR-Code Adoption flow provides **deterministic device ownership** by requiring users to explicitly submit the RustDesk ID. This replaces the previous heuristic-based temporal matching.

---

## Problem Statement

### Previous Behavior (Temporal Matching)

1. User clicks "Add Device" → creates session with timestamp
2. User scans QR code with RustDesk app
3. Device connects to RustDesk server (no user association)
4. Sync script runs every minute, finds orphan devices
5. **Heuristic:** Matches orphan device to oldest waiting session within time window

**Problems with heuristic matching:**
- Race conditions when multiple users register simultaneously
- Incorrect matches when devices take longer than expected
- Devices "orphaned" and assigned to admin for manual triage
- No certainty about which device was intended

### New Behavior (Deterministic)

1. User clicks "Add Device" → modal with QR code appears
2. User scans QR code (unchanged - configures RustDesk app)
3. User reads RustDesk ID from device screen (6-12 digit number)
4. User enters ID in modal and clicks "ENVIAR RUSTDESK ID"
5. **Deterministic:** Backend associates exact device_id to user

**Benefits:**
- 100% accurate device-to-user association
- No race conditions
- No admin intervention required
- User explicitly confirms which device they're registering

---

## Step-by-Step Flow

### Step 1: User Opens Registration Modal

```
┌─────────────────────────────────────────┐
│ 📱 Registar Dispositivo              ✕ │
├─────────────────────────────────────────┤
│                                         │
│         ┌───────────────┐               │
│         │   QR CODE     │               │
│         │   (SVG)       │               │
│         └───────────────┘               │
│                                         │
│         Tempo restante:                 │
│         04:32                           │
│                                         │
│   Abra a app RustDesk e escaneie       │
│   este QR code para configurar.        │
└─────────────────────────────────────────┘
```

**Backend call:** `POST /functions/v1/start-registration-session`  
**QR image:** `GET /functions/v1/generate-qr-image`

The QR code contains RustDesk server configuration (unchanged).

### Step 2: User Scans QR with RustDesk App

RustDesk app:
1. Reads QR code configuration
2. Configures server address, relay, public key
3. Connects to RustDesk server
4. Displays device's RustDesk ID (e.g., `123456789`)

**This step is unchanged from before.**

### Step 3: User Provides RustDesk ID

```
┌─────────────────────────────────────────┐
│           ... (QR section above) ...    │
├─────────────────────────────────────────┤
│ 📋 Introduza o RustDesk ID:             │
│                                         │
│ ┌─────────────────────┐ ┌─────────────┐ │
│ │ 123456789           │ │📋PASTE RD ID│ │
│ └─────────────────────┘ └─────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │       📤 ENVIAR RUSTDESK ID         │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ✓ Formato válido (9 dígitos)           │
└─────────────────────────────────────────┘
```

**User can:**
- Type the ID manually (digits only)
- Click "PASTE RD ID" to paste from clipboard

**Frontend validates:**
- Must be digits only (`/^\d+$/`)
- Must be 6-12 characters
- Real-time validation hint shown

### Step 4: Adoption Request (Explicit Confirmation)

User clicks "ENVIAR RUSTDESK ID":

**Request:**
```http
POST /functions/v1/register-device
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "device_id": "123456789",
  "last_seen": "2025-12-28T12:00:00Z",
  "observations": "QR-hybrid adoption"
}
```

**Backend behavior:**
1. Validates JWT → extracts `auth_user_id`
2. Validates `device_id` (digits only, 6-12 length)
3. Looks up `mesh_users` by `auth_user_id` → gets `mesh_user.id`
4. Checks if device exists:
   - If NO → Creates new device with `owner = mesh_user.id`
   - If YES with `owner = null` → Sets `owner = mesh_user.id`
   - If YES with existing owner → Keeps existing owner (idempotent)
5. Returns success with device details

### Step 5: Success State

```
┌─────────────────────────────────────────┐
│ 📱 Registar Dispositivo              ✕ │
├─────────────────────────────────────────┤
│                                         │
│               ✅                        │
│                                         │
│      Dispositivo Registado!             │
│                                         │
│      123456789                          │
│                                         │
│         [ Fechar ]                      │
└─────────────────────────────────────────┘
```

Device list refreshes automatically.

---

## Idempotency Guarantees

### Same User, Same Device ID

| Attempt | Result |
|---------|--------|
| 1st | Device created, owner = user |
| 2nd | No change, same owner returned |
| Nth | No change, same owner returned |

### Different User, Same Device ID

| Scenario | Result |
|----------|--------|
| Device has no owner | New user becomes owner |
| Device already owned | Original owner preserved |

**Important:** Once a device has an owner, it cannot be "stolen" by another user. The existing owner is always preserved.

---

## Validation Rules

### Frontend Validation

```typescript
// Only digits allowed
if (!/^\d+$/.test(sanitized)) {
  error = "O RustDesk ID deve conter apenas dígitos.";
}

// Length 6-12
if (sanitized.length < 6) {
  error = "O RustDesk ID deve ter pelo menos 6 dígitos.";
}
if (sanitized.length > 12) {
  error = "O RustDesk ID deve ter no máximo 12 dígitos.";
}
```

### Backend Validation

```typescript
// supabase/functions/_shared/auth.ts
export function validateDeviceId(deviceId: unknown) {
  // Type check
  if (typeof deviceId !== "string") {
    return { valid: false, error: "device_id must be a string" };
  }
  
  // Sanitize
  const trimmed = deviceId.trim().replace(/\s+/g, "");
  
  // Required
  if (trimmed.length === 0) {
    return { valid: false, error: "device_id is required" };
  }
  
  // Digits only
  if (!/^\d+$/.test(trimmed)) {
    return { valid: false, error: "device_id must contain only digits" };
  }
  
  // Length 6-12
  if (trimmed.length < 6 || trimmed.length > 12) {
    return { valid: false, error: "device_id must be between 6 and 12 digits" };
  }
  
  return { valid: true, value: trimmed };
}
```

---

## What Remains Unchanged

| Component | Status |
|-----------|--------|
| QR code content | Unchanged - same RustDesk config |
| RustDesk app behavior | Unchanged - scans QR, connects |
| `generate-qr-image` endpoint | Unchanged |
| `start-registration-session` endpoint | Unchanged |
| `check-registration-status` endpoint | Unchanged (still available) |
| Provisioning code flow (no QR) | Unchanged |
| Device grouping/notes | Unchanged |

---

## Admin Intervention: No Longer Required

### Before (Temporal Matching)

- Unmatched devices → assigned to canonical admin
- Admin sees "Dispositivos sem Utilizador Atribuido" section
- Admin manually reassigns to correct user

### After (Hybrid Adoption)

- User explicitly provides device ID → 100% match rate
- No orphan devices from new registrations
- Admin section only shows legacy orphans (if any)

---

## Error Scenarios

| Scenario | Frontend Message |
|----------|------------------|
| Empty device ID | "Por favor, introduza o RustDesk ID." |
| Non-digit characters | "O RustDesk ID deve conter apenas dígitos." |
| Too short (<6 digits) | "O RustDesk ID deve ter pelo menos 6 dígitos." |
| Too long (>12 digits) | "O RustDesk ID deve ter no máximo 12 dígitos." |
| JWT expired | "Sessão expirada. Por favor, inicie sessão novamente." |
| Network error | "Ocorreu um erro de rede. Por favor, tente novamente." |
| User not in mesh_users | "Utilizador não encontrado." |

---

## Clipboard API Usage

"PASTE RD ID" button uses the browser Clipboard API:

```typescript
const handlePasteFromClipboard = async () => {
  try {
    if (!navigator.clipboard?.readText) {
      console.warn("Clipboard API not available");
      return;
    }
    
    const text = await navigator.clipboard.readText();
    const cleanedText = text.replace(/\s+/g, "").replace(/\D/g, "");
    
    if (cleanedText) {
      onHybridInputChange(cleanedText);
    }
  } catch (err) {
    // User denied clipboard access
    console.warn("Failed to read clipboard:", err);
  }
};
```

**Browser support:** Modern browsers require HTTPS and user gesture.

---

## Testing Checklist

- [ ] Open registration modal → QR loads correctly
- [ ] Timer counts down from 5:00
- [ ] Type RustDesk ID → digits only enforced
- [ ] PASTE button → reads clipboard (HTTPS required)
- [ ] Validation hint shows correct status
- [ ] Submit with valid ID → device registered
- [ ] Submit same ID again → idempotent (no error)
- [ ] Submit with invalid format → clear error message
- [ ] Device appears in list after success

---

**Next Review:** When registration flow requirements change
