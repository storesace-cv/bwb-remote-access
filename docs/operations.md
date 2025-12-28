# Operations

## Environment Variables

### Frontend (`.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=https://project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### Edge Functions

Set via Supabase Dashboard or CLI:

```
SUPABASE_URL=https://project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

## Deployment

### Frontend

```bash
# Build
yarn build

# Start production
yarn start
```

Deployed to production server via rsync + systemd.

### Edge Functions

```bash
# Deploy single function
supabase functions deploy register-device

# Deploy all functions
supabase functions deploy
```

## Database

### Key Tables

| Table | Purpose |
|-------|--------|
| `auth.users` | Supabase Auth users |
| `mesh_users` | Maps auth users to mesh identities |
| `android_devices` | Registered devices |
| `mesh_groups` | Device grouping hierarchy |
| `device_registration_sessions` | Temporary QR sessions |

### Row Level Security

All tables have RLS enabled. Users can only:
- Read their own devices
- Modify their own devices
- Read groups (public)

Service role key bypasses RLS for admin operations.

## Monitoring

### Frontend Logs

```bash
journalctl -u rustdesk-frontend -f
```

### Edge Function Logs

Supabase Dashboard → Edge Functions → Logs

Logs are JSON-formatted with:
- `correlationId` - Request tracing
- `action` - Function name
- `authUserId` - Authenticated user

### Log Query Example

Filter by correlation ID:
```
correlationId: "m1abc123-xyz789"
```

Filter errors:
```
level: "error"
```

## Troubleshooting

### JWT Validation Failures

1. Check token expiration (1 hour default)
2. Verify `SUPABASE_SERVICE_ROLE_KEY` is set
3. Check Supabase Auth service status

### Device Not Appearing After QR Scan

1. Verify RustDesk connected to correct server
2. Check `android_devices` table for orphan entries
3. Ensure user has matching `mesh_users` record

### Admin Functions Returning 403

1. Verify user is canonical admin (`9ebfa3dd-392c-489d-882f-8a1762cb36e8`)
2. Check JWT contains correct `sub` claim

## Health Checks

### Frontend

```bash
curl -s http://localhost:3000 | head -1
# Should return HTML
```

### Edge Functions

```bash
curl -s https://project.supabase.co/functions/v1/get-devices \
  -H "Authorization: Bearer $JWT" \
  -H "apikey: $ANON_KEY"
```

## Backup

### Database

Supabase provides automated backups. For manual:

```bash
pg_dump $DATABASE_URL > backup.sql
```

### Code

Git repository is source of truth.

## Security Checklist

- [ ] Service role key not exposed to frontend
- [ ] All Edge Functions validate JWT
- [ ] Input validation on all user-supplied data
- [ ] RLS enabled on all tables
- [ ] CORS restricted in production
- [ ] Logs do not contain sensitive data
