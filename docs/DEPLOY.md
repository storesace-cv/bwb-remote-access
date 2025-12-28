# Deploy Guide

Complete deployment workflow for the RustDesk management portal.

## Prerequisites

- Node.js 18+ and npm
- SSH access to the droplet (`~/.ssh/rustdeskweb-digitalocean`)
- Supabase CLI (for Edge Functions/migrations)
- Git configured with access to the repository

## Deployment Sequence

```
┌─────────────────────────────────────────────────────────────┐
│                    DEPLOY WORKFLOW                          │
├─────────────────────────────────────────────────────────────┤
│  1. Sync main → local mirror                                │
│  2. Step-2: Build locally                                   │
│  3. Step-3: Run tests + Supabase gate                       │
│  4. Supabase deploy (if required)                           │
│  5. Step-4: Deploy to droplet                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Step 1: Sync from GitHub main

Ensure your local mirror is up-to-date with the source of truth.

```bash
cd /Users/jorgepeixinho/desenvolvimento/my-bwb-remote-access

# Fetch latest from GitHub
git fetch origin main

# Reset local branch to match main (or merge/rebase as preferred)
git checkout my-bwb-remote-access
git rebase origin/main
```

**What this ensures:** Your deploy is based on the latest approved code.

---

## Step 2: Build Locally

```bash
./scripts/Step-2-build-local.sh
```

**What this does:**
- Runs `npm install` to sync dependencies
- Runs `npm run build` to create production `.next/` bundle
- Validates that `.next/BUILD_ID` exists

**Success criteria:** Script exits 0, `.next/BUILD_ID` file exists.

---

## Step 3: Run Tests + Supabase Gate

```bash
./scripts/Step-3-test-local.sh
```

**What this does:**
1. **ESLint** - Static code analysis
   - Warnings do NOT fail the build
   - Only errors cause failure
2. **Jest** - Unit tests
3. **TypeScript** - Type checking (`tsc --noEmit`)
4. **Supabase Deploy Gate** - Detects changes in:
   - `supabase/functions/**` → Warns about Edge Function deploy
   - `supabase/migrations/**` → Warns about DB migrations

**Success criteria:** Script exits 0. Review any Supabase warnings.

---

## Step 4: Supabase Deploy (If Required)

The Step-3 gate will warn you if Supabase changes are detected.

### Edge Functions

If changes in `supabase/functions/**`:

```bash
# Option A: Manual deploy (recommended for review)
supabase functions deploy --project-ref kqwaibgvmzcqeoctukoy

# Option B: Use included script
./scripts/supabase-deploy-functions.sh

# Option C: Auto-deploy during Step-4
export RUN_SUPABASE_EDGE_DEPLOY=1
./scripts/Step-4-deploy-tested-build.sh
```

### Database Migrations

If changes in `supabase/migrations/**`:

```bash
# Review pending changes first
supabase db diff --project-ref kqwaibgvmzcqeoctukoy

# Apply migrations (REVIEW SQL FILES FIRST - can be destructive!)
supabase db push --project-ref kqwaibgvmzcqeoctukoy
```

⚠️ **Migrations are NEVER applied automatically.** Always review SQL files.

---

## Step 5: Deploy to Droplet

```bash
./scripts/Step-4-deploy-tested-build.sh
```

**What this does:**
- Validates local build exists (`.next/BUILD_ID`)
- Checks SSH connectivity to droplet
- Rsyncs to droplet:
  - `.next/` (production build)
  - `node_modules/` (dependencies)
  - `src/`, `public/` (code and assets)
  - `package.json`, `next.config.mjs`
  - Sync scripts

**What this does NOT do:**
- Run `npm install` on droplet
- Restart systemd services
- Modify nginx/firewall

### Post-Deploy Manual Steps

After rsync completes, SSH to droplet and restart:

```bash
# SSH as admin
ssh root@46.101.78.179

# Fix ownership (if needed)
chown -R rustdeskweb:rustdeskweb /opt/rustdesk-frontend

# Restart service
systemctl restart rustdesk-frontend.service

# Verify
systemctl status rustdesk-frontend.service
curl -k -I https://rustdesk.bwb.pt/
```

---

## Quick Reference

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DEPLOY_HOST` | `46.101.78.179` | Droplet IP |
| `DEPLOY_USER` | `rustdeskweb` | SSH user |
| `DEPLOY_PATH` | `/opt/rustdesk-frontend` | Remote path |
| `DEPLOY_SSH_KEY` | `~/.ssh/rustdeskweb-digitalocean` | SSH key |
| `RUN_SUPABASE_EDGE_DEPLOY` | `0` | Set to `1` for auto Edge deploy |
| `SUPABASE_PROJECT_REF` | `kqwaibgvmzcqeoctukoy` | Supabase project |

### Common Commands

```bash
# Full deploy sequence (no Supabase changes)
./scripts/Step-2-build-local.sh && \
./scripts/Step-3-test-local.sh && \
./scripts/Step-4-deploy-tested-build.sh

# Full deploy with Edge Functions
./scripts/Step-2-build-local.sh && \
./scripts/Step-3-test-local.sh && \
RUN_SUPABASE_EDGE_DEPLOY=1 ./scripts/Step-4-deploy-tested-build.sh

# Deploy Edge Functions only
supabase functions deploy --project-ref kqwaibgvmzcqeoctukoy

# Check droplet service status
ssh root@46.101.78.179 'systemctl status rustdesk-frontend --no-pager'
```

---

## Troubleshooting

### ESLint warnings but not errors
- **Expected behavior**: Warnings don't fail the build
- Fix warnings when convenient, but they don't block deploy

### "Supabase CLI not found"
```bash
# Install Supabase CLI
npm install -g supabase
# or
brew install supabase/tap/supabase
```

### SSH connection fails
1. Check SSH key exists: `ls -la ~/.ssh/rustdeskweb-digitalocean`
2. Check SSH config in `~/.ssh/config`
3. Test manually: `ssh -i ~/.ssh/rustdeskweb-digitalocean rustdeskweb@46.101.78.179`

### Service won't start after deploy
```bash
ssh root@46.101.78.179
journalctl -u rustdesk-frontend -n 100 --no-pager
# Check for missing env vars or build issues
```

---

## Git Workflow

**Source of truth:** `main` branch on GitHub

**Deploy workflow:**
1. Merge PRs to `main` on GitHub
2. Sync local mirror from `main`
3. Run deploy steps from local mirror
4. Never push directly to `main` from deploy machine

**Never:**
- Force push to `main`
- Deploy from uncommitted changes
- Skip the test step
