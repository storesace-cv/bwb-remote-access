# STEP 6.2: MeshCentral Remote Control Session

## Overview

This implementation enables Auth0-authenticated users to open remote control sessions to MeshCentral devices without ever logging into MeshCentral directly.

## Architecture

```
┌─────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│   User Browser  │──────│  RustDesk Web    │──────│   MeshCentral    │
│                 │      │  (Next.js)       │      │                  │
└─────────────────┘      └──────────────────┘      └──────────────────┘
         │                        │                         │
         │  1. Auth0 Login        │                         │
         │────────────────────────│                         │
         │                        │                         │
         │  2. View Devices       │                         │
         │────────────────────────│                         │
         │                        │                         │
         │  3. Click "Controlo    │                         │
         │     Remoto"            │                         │
         │────────────────────────│                         │
         │                        │  4. Generate Session    │
         │                        │     Token (AES-256-GCM) │
         │                        │─────────────────────────│
         │  5. Open Session URL   │                         │
         │<───────────────────────│                         │
         │                        │                         │
         │  6. Auto-login to      │                         │
         │     MeshCentral        │                         │
         │─────────────────────────────────────────────────>│
         │                        │                         │
         │  7. Remote Control     │                         │
         │     Session Active     │                         │
         │<─────────────────────────────────────────────────│
```

## Security Model

1. **Auth0 is the ONLY authentication authority**
   - Users authenticate via Auth0
   - No MeshCentral login screen is ever shown
   - No MeshCentral passwords are used or exposed

2. **Domain-based access control**
   - Users can only access devices in their assigned domain
   - SuperAdmins can access devices across all domains
   - Cross-domain access is denied with HTTP 403

3. **Time-limited tokens**
   - Session tokens expire after 5 minutes
   - Tokens are single-use (consumed on first login)
   - Regenerating the login token key invalidates ALL tokens

4. **No credential exposure**
   - The `MESHCENTRAL_LOGIN_TOKEN_KEY` is never sent to the frontend
   - Only the session URL (containing the encrypted token) is returned
   - The raw token is not included in API responses

## Files Created/Modified

### New Files

1. **`/app/src/lib/meshcentral-session.ts`**
   - MeshCentral login token generation using AES-256-GCM
   - User-to-MeshCentral mapping functions
   - Access control validation

2. **`/app/src/app/api/mesh/open-session/route.ts`**
   - POST endpoint for session creation
   - Auth0 JWT validation
   - Authorization checks
   - Returns session URL

### Modified Files

1. **`/app/src/components/mesh/MeshDevicesClient.tsx`**
   - Added "Controlo Remoto" button
   - Loading/success/error states
   - Opens session in new tab

2. **`/app/.env.example`**
   - Added `MESHCENTRAL_URL`
   - Added `MESHCENTRAL_LOGIN_TOKEN_KEY`

## Required Environment Variables

Add these to your `.env` file on the droplet:

```bash
# MeshCentral base URL (no trailing slash)
MESHCENTRAL_URL=https://mesh.yourdomain.com

# MeshCentral Login Token Key (hex string)
# Obtain via: node node_modules/meshcentral --logintokenkey
MESHCENTRAL_LOGIN_TOKEN_KEY=your_hex_key_here
```

## MeshCentral Configuration

1. Enable login tokens in MeshCentral `config.json`:

```json
{
  "settings": {
    "AllowLoginToken": true
  }
}
```

2. Restart MeshCentral after changing config

3. Get the login token key:

```bash
cd /opt/meshcentral
node node_modules/meshcentral --logintokenkey
```

4. Copy the hex string output to `MESHCENTRAL_LOGIN_TOKEN_KEY`

## API Endpoint

### POST /api/mesh/open-session

**Request:**
```json
{
  "nodeId": "node/mesh/xxxxx",
  "domain": "mesh"
}
```

**Response (Success):**
```json
{
  "success": true,
  "sessionUrl": "https://mesh.example.com/?login=TOKEN&node=node/mesh/xxxxx",
  "expiresAt": "2025-01-01T12:05:00.000Z"
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Forbidden",
  "details": "You do not have permission to access devices in this domain"
}
```

## User Flow

1. User logs in via Auth0
2. User navigates to `/mesh/devices`
3. User sees list of devices in their domain
4. User clicks "Controlo Remoto" on an online device
5. Backend validates Auth0 session and domain access
6. Backend generates time-limited MeshCentral token
7. Frontend opens MeshCentral URL in new tab
8. MeshCentral auto-authenticates user via token
9. Remote control session starts immediately

## Error Handling

| HTTP Status | Error | Meaning |
|-------------|-------|---------|
| 401 | Unauthorized | No Auth0 session |
| 403 | Forbidden | No permission for domain |
| 400 | Bad Request | Invalid request body |
| 503 | Service Unavailable | MeshCentral not configured |
| 500 | Internal Server Error | Token generation failed |

## Testing Checklist

- [ ] User can log in via Auth0
- [ ] Devices list loads correctly
- [ ] "Controlo Remoto" button is visible for online devices
- [ ] Button is disabled for offline devices
- [ ] Clicking button opens MeshCentral in new tab
- [ ] No MeshCentral login screen appears
- [ ] Remote control session starts automatically
- [ ] Access denied for devices outside user's domain
- [ ] SuperAdmin can access devices in all domains

## Deployment Notes

1. Add environment variables to droplet `.env`
2. Deploy via Step-4 rsync script
3. Restart Next.js service
4. Test end-to-end flow

## Troubleshooting

### Session URL doesn't work

- Verify `MESHCENTRAL_LOGIN_TOKEN_KEY` is correct
- Check MeshCentral has `AllowLoginToken: true`
- Ensure key hasn't been regenerated

### 503 Service Unavailable

- Check `MESHCENTRAL_URL` is set
- Check `MESHCENTRAL_LOGIN_TOKEN_KEY` is set

### 403 Forbidden

- Verify user has correct domain assignment in Auth0
- Check user's org_roles include the device's domain
