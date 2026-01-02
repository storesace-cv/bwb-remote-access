# Auth0 Reverse Proxy Deployment Checklist

> **Document Type**: Deployment Guide  
> **Last Updated**: December 2024  
> **Applies to**: Production deployments behind reverse proxy (nginx, Caddy, etc.)

---

## Overview

This document provides a checklist for deploying the application with Auth0 authentication behind a reverse proxy. The most common issue is **session cookies not being readable server-side** due to misconfigured base URLs or missing proxy headers.

---

## Base URL Resolution (Single Source of Truth)

The application uses a **canonical base URL resolver** (`src/lib/baseUrl.ts`) with strict precedence:

1. `AUTH0_BASE_URL` (Auth0 SDK standard)
2. `APP_BASE_URL` (custom deployment variable)
3. `NEXT_PUBLIC_SITE_URL` (Vercel/generic)
4. `NEXT_PUBLIC_VERCEL_URL` (Vercel auto-set)
5. **Development only**: `http://localhost:3000`
6. **Production without config**: **THROWS ERROR** (no silent fallback!)

### IMPORTANT
- `localhost` fallback is **ONLY** used when `NODE_ENV=development`
- In production, if no base URL is configured, the application will **fail explicitly**
- This prevents accidental localhost redirects in production

---

## 1. Required Environment Variables

### On the Droplet/Server

Set these in your environment (e.g., `/opt/rustdesk-frontend/.env.local` or systemd service file):

```bash
# CRITICAL: Must be the PUBLIC URL users access (not localhost!)
# This is checked FIRST in the precedence order
APP_BASE_URL=https://rustdesk.bwb.pt

# Alternative: Auth0 SDK standard variable (also works)
AUTH0_BASE_URL=https://rustdesk.bwb.pt

# Auth0 tenant domain (without https://)
AUTH0_DOMAIN=your-tenant.eu.auth0.com

# Auth0 Application credentials
AUTH0_CLIENT_ID=your_client_id
AUTH0_CLIENT_SECRET=your_client_secret

# Session encryption secret (generate with: openssl rand -hex 32)
AUTH0_SECRET=your_32_char_hex_secret
```

### Common Mistakes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| `APP_BASE_URL=http://localhost:3000` | Session not readable after login | Use public URL: `https://rustdesk.bwb.pt` |
| `APP_BASE_URL=http://...` (when behind HTTPS proxy) | Cookies not sent (secure mismatch) | Use `https://` in APP_BASE_URL |
| Missing `AUTH0_SECRET` | Session encryption fails | Generate and set a 32+ char hex secret |
| No `APP_BASE_URL` or `AUTH0_BASE_URL` set | Application throws `BaseUrlConfigError` | Set one of the base URL variables |

---

## 2. Reverse Proxy Configuration

### Required Headers

Your reverse proxy **MUST** forward these headers to Next.js:

```nginx
# Nginx example
location / {
    proxy_pass http://127.0.0.1:3000;
    
    # REQUIRED for Auth0 session cookies
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;  # CRITICAL
    proxy_set_header X-Forwarded-Host $host;     # CRITICAL
    
    # WebSocket support (if needed)
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

### Why These Headers Matter

| Header | Purpose |
|--------|----------|
| `X-Forwarded-Proto` | Tells Next.js the original protocol (https). Required for secure cookie decisions. |
| `X-Forwarded-Host` | Tells Next.js the original host. Required for correct redirect URLs. |
| `Host` | Standard host header |
| `X-Forwarded-For` | Client IP for logging |

---

## 3. Auth0 Dashboard Configuration

### Application Settings

In Auth0 Dashboard → Applications → Your App:

1. **Allowed Callback URLs**:
   ```
   https://rustdesk.bwb.pt/auth/callback
   ```

2. **Allowed Logout URLs**:
   ```
   https://rustdesk.bwb.pt
   ```

3. **Allowed Web Origins**:
   ```
   https://rustdesk.bwb.pt
   ```

### Common Auth0 Mistakes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Callback URL mismatch | "Callback URL mismatch" error | Add exact public URL to allowed callbacks |
| Missing logout URL | Logout doesn't redirect properly | Add public URL to allowed logout URLs |
| HTTP instead of HTTPS in URLs | Various redirect issues | Use HTTPS URLs in Auth0 dashboard |

---

## 4. Cookie Configuration

The SDK automatically configures cookies based on `APP_BASE_URL`:

| Setting | Value | Condition |
|---------|-------|----------|
| `secure` | `true` | When `APP_BASE_URL` starts with `https://` |
| `sameSite` | `lax` | Default, works with OAuth redirects |
| `httpOnly` | `true` | Always (prevents XSS) |
| `path` | `/` | Always |

### If Cookies Aren't Working

1. Check `APP_BASE_URL` matches the public URL exactly
2. Check `X-Forwarded-Proto: https` is being sent
3. Use `/api/auth0/debug` to diagnose

---

## 5. Validation Endpoints

### Debug Endpoint

```bash
curl -s https://rustdesk.bwb.pt/api/auth0/debug | jq
```

Expected output (when working):
```json
{
  "session": {
    "exists": true,
    "userSubPrefix": "auth0|abc..."
  },
  "cookies": {
    "hasAppSession": true
  },
  "headers": {
    "x-forwarded-proto": "https",
    "x-forwarded-host": "rustdesk.bwb.pt"
  },
  "urlAnalysis": {
    "configuredBaseUrl": "https://rustdesk.bwb.pt",
    "baseUrlMatchesOrigin": true,
    "isHttps": true
  },
  "potentialIssues": ["None detected"]
}
```

### Session Endpoint

```bash
# After logging in via browser, test with cookies:
curl -s -b cookies.txt https://rustdesk.bwb.pt/api/auth0/me | jq
```

Expected:
```json
{
  "authenticated": true,
  "email": "user@example.com"
}
```

---

## 6. Troubleshooting Flowchart

```
/auth/login works?
    │
    ├─ NO → Check AUTH0_DOMAIN, CLIENT_ID, CLIENT_SECRET
    │
    └─ YES → Auth0 redirects back?
                │
                ├─ NO → Check Allowed Callback URLs in Auth0 dashboard
                │
                └─ YES → Session readable server-side?
                            │
                            ├─ NO → Check:
                            │       1. APP_BASE_URL matches public URL
                            │       2. APP_BASE_URL uses https://
                            │       3. X-Forwarded-Proto header is set
                            │       4. AUTH0_SECRET is set
                            │       5. Use /api/auth0/debug
                            │
                            └─ YES → ✅ Working!
```

---

## 7. Quick Validation Script

Run this on the droplet to validate configuration:

```bash
#!/bin/bash
echo "=== Auth0 Proxy Configuration Check ==="
echo ""

# Check env vars
echo "1. Environment Variables:"
[[ -n "$APP_BASE_URL" ]] && echo "   ✅ APP_BASE_URL=$APP_BASE_URL" || echo "   ❌ APP_BASE_URL not set"
[[ -n "$AUTH0_DOMAIN" ]] && echo "   ✅ AUTH0_DOMAIN is set" || echo "   ❌ AUTH0_DOMAIN not set"
[[ -n "$AUTH0_CLIENT_ID" ]] && echo "   ✅ AUTH0_CLIENT_ID is set" || echo "   ❌ AUTH0_CLIENT_ID not set"
[[ -n "$AUTH0_CLIENT_SECRET" ]] && echo "   ✅ AUTH0_CLIENT_SECRET is set" || echo "   ❌ AUTH0_CLIENT_SECRET not set"
[[ -n "$AUTH0_SECRET" ]] && echo "   ✅ AUTH0_SECRET is set" || echo "   ❌ AUTH0_SECRET not set"

echo ""
echo "2. Base URL Analysis:"
if [[ "$APP_BASE_URL" == https://* ]]; then
    echo "   ✅ APP_BASE_URL uses HTTPS (cookies will be secure)"
else
    echo "   ⚠️  APP_BASE_URL does not use HTTPS - cookies may not work behind HTTPS proxy"
fi

echo ""
echo "3. Local Service Check:"
curl -s -o /dev/null -w "   HTTP %{http_code}" http://127.0.0.1:3000/ && echo " - Local service responding" || echo " - Local service NOT responding"

echo ""
echo "4. Debug Endpoint:"
curl -s http://127.0.0.1:3000/api/auth0/debug | head -c 500
echo ""
```

---

## 8. Systemd Service Example

Example systemd service file with correct environment:

```ini
[Unit]
Description=RustDesk Frontend
After=network.target

[Service]
Type=simple
User=rustdeskweb
WorkingDirectory=/opt/rustdesk-frontend
ExecStart=/usr/bin/npm run start
Restart=on-failure
RestartSec=10

# Environment variables
Environment=NODE_ENV=production
Environment=APP_BASE_URL=https://rustdesk.bwb.pt
Environment=AUTH0_DOMAIN=your-tenant.eu.auth0.com
Environment=AUTH0_CLIENT_ID=your_client_id
Environment=AUTH0_CLIENT_SECRET=your_client_secret
Environment=AUTH0_SECRET=your_32_char_hex_secret

[Install]
WantedBy=multi-user.target
```

---

## Document History

| Date | Change |
|------|--------|
| December 2024 | Initial creation for Auth0 reverse proxy deployment |

---

**If sessions still don't work after following this checklist, use `/api/auth0/debug` to identify the specific issue.**
