# 🚀 RustDesk Mesh Integration - Production Deployment Guide

**Last Updated:** December 11, 2025  
**Status:** Production Ready ✅  
**Service Manager:** systemd (PM2 removed)

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Deployment Pipeline](#deployment-pipeline)
5. [Service Management](#service-management)
6. [Monitoring & Health Checks](#monitoring--health-checks)
7. [Troubleshooting](#troubleshooting)
8. [Rollback Procedures](#rollback-procedures)

---

## 🎯 Overview

This guide documents the complete production deployment workflow for the RustDesk Mesh Integration frontend application. The system uses a 4-step deployment pipeline with comprehensive validation at each stage.

### Key Features
- ✅ **Automated deployment** from local machine to production droplet
- ✅ **Comprehensive health checks** at every stage
- ✅ **systemd service management** (no PM2 dependency)
- ✅ **Build validation** before deployment
- ✅ **Automatic rollback** on failure
- ✅ **Deployment history tracking**

---

## 🏗️ Architecture

```
┌─────────────────┐
│ Local Machine   │
│ (Development)   │
└────────┬────────┘
         │
         │ Step 1: Download from GitHub
         │ Step 2: Build locally
         │ Step 3: Test locally
         │ Step 4: Deploy to droplet
         │
         ▼
┌─────────────────┐
│ Production      │
│ Droplet         │
│ 46.101.78.179   │
└────────┬────────┘
         │
         │ Port 3000 (internal)
         │
         ▼
┌─────────────────┐
│ NGINX Proxy     │
│ rustdesk.bwb.pt │
└─────────────────┘
```

### Technology Stack
- **Frontend:** Next.js 16.0.6 (App Router)
- **Runtime:** Node.js
- **Service Manager:** systemd
- **Reverse Proxy:** NGINX
- **Backend:** Supabase
- **Remote Access:** RustDesk + MeshCentral

---

## ✅ Prerequisites

### Local Machine Requirements
- **Git:** Access to repository
- **Node.js:** v18+ (matching production)
- **npm:** Latest version
- **SSH:** Access to production droplet
- **rsync:** For file transfers

### Production Droplet Setup
- **User:** `rustdeskweb` (non-root service user)
- **Directory:** `/opt/rustdesk-frontend`
- **Service:** `rustdesk-frontend.service`
- **Permissions:** Correct ownership for `rustdeskweb` user

### Required Files
- `.env.local` in repository root (contains Supabase credentials)
- All source code directories:
  - `src/integrations/supabase/`
  - `src/lib/`
  - `src/services/`
  - `src/app/`

---

## 🔄 Deployment Pipeline

### Step 1: Download from GitHub

**Script:** `./scripts/Step-1-download-from-main.sh`

**Purpose:** Synchronize local branch with origin/main

**What it does:**
- Fetches latest changes from GitHub
- Resets local branch to match remote
- Cleans untracked files
- Validates repository state

**Command:**
```bash
./scripts/Step-1-download-from-main.sh
```

**Environment Variables:**
- `BRANCH_LOCAL` - Local branch name (default: `my-rustdesk-mesh-integration`)
- `BRANCH_REMOTE` - Remote branch name (default: `main`)
- `ALLOW_DIRTY_RESET` - Force reset even with uncommitted changes (default: `0`)

**Logs:** `logs/local/Step-1-download-from-main-YYYYMMDD-HHMMSS.log`

---

### Step 2: Build Locally

**Script:** `./scripts/Step-2-build-local.sh`

**Purpose:** Create production build with all required dependencies

**What it does:**
1. ✅ Validates `.env.local` exists
2. ✅ Validates Supabase environment variables
3. ✅ Validates required source directories exist
4. ✅ Installs dependencies (`npm ci`)
5. ✅ Runs production build (`npm run build`)
6. ✅ Generates `.next` directory with BUILD_ID

**Command:**
```bash
./scripts/Step-2-build-local.sh
```

**Critical Validations:**
```bash
# Required environment variables
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY

# Required directories
src/integrations/supabase
src/lib
src/services
src/app
```

**Success Criteria:**
- `.next/BUILD_ID` exists
- `.next/` contains >100 files
- `npm run build` exits with code 0

**Logs:** `logs/local/Step-2-build-local-YYYYMMDD-HHMMSS.log`

---

### Step 3: Test Locally

**Script:** `./scripts/Step-3-test-local.sh`

**Purpose:** Validate code quality before deployment

**What it does:**
- Runs ESLint (`npm run lint`)
- Runs test suite (`npm test`)
- Validates no runtime errors

**Command:**
```bash
./scripts/Step-3-test-local.sh
```

**Logs:** `logs/local/Step-3-test-local-YYYYMMDD-HHMMSS.log`

---

### Step 4: Deploy to Production

**Script:** `./scripts/Step-4-deploy-tested-build.sh`

**Purpose:** Transfer validated build to production droplet

**What it does:**

#### Phase 1: Local Validation
- ✅ Verify `.next` directory exists
- ✅ Verify BUILD_ID exists
- ✅ Count files in `.next` (expect >100)
- ✅ Verify `.env.local` exists

#### Phase 2: Remote Connectivity
- ✅ Test SSH connection
- ✅ Verify remote directory exists
- ✅ Create directory if needed

#### Phase 3: File Transfer (rsync)
```bash
# 3.1 Config files
package.json, package-lock.json, next.config.ts, tsconfig.json, .env.local

# 3.2 Source code
src/ (with --delete for clean sync)

# 3.3 Build artifacts (CRITICAL)
.next/ (with ownership fixes)

# 3.4 Public assets
public/

# 3.5 Scripts
scripts/

# 3.6 Runtime files
start.sh, .env.production
```

#### Phase 4: Post-Transfer Validation
- ✅ Verify `.next/` exists on droplet
- ✅ Verify `BUILD_ID` matches local
- ✅ Count remote files (should match local)
- ✅ Verify critical subdirectories (`server/`, `static/`)

#### Phase 5: Fix Permissions
```bash
sudo chown -R rustdeskweb:rustdeskweb /opt/rustdesk-frontend
```

#### Phase 6: Install Dependencies
```bash
cd /opt/rustdesk-frontend
sudo -u rustdeskweb npm install --omit=dev --quiet
```

#### Phase 7: Restart Service
```bash
sudo systemctl stop rustdesk-frontend.service
sudo systemctl start rustdesk-frontend.service
```

#### Phase 8: Health Checks
- ✅ Wait for service to become active (30s timeout)
- ✅ Wait for HTTP 200/307 response (60s timeout)
- ✅ Verify port 3000 is listening
- ✅ Log deployment success

**Command:**
```bash
./scripts/Step-4-deploy-tested-build.sh
```

**Environment Variables:**
```bash
REMOTE_HOST="root@46.101.78.179"
REMOTE_DIR="/opt/rustdesk-frontend"
FRONTEND_USER="rustdeskweb"
HEALTH_CHECK_TIMEOUT="60"
HEALTH_CHECK_INTERVAL="5"
```

**Logs:** 
- Local: `logs/local/Step-4-deploy-tested-build-YYYYMMDD-HHMMSS.log`
- Remote: `/opt/rustdesk-frontend/deployment-history.log`

---

## 🔧 Service Management

### systemd Service

**Service File:** `/etc/systemd/system/rustdesk-frontend.service`

```ini
[Unit]
Description=RustDesk Mesh Integration Frontend
Documentation=https://github.com/YOUR_REPO/rustdesk-mesh-integration
After=network.target

[Service]
Type=simple
User=rustdeskweb
Group=rustdeskweb
WorkingDirectory=/opt/rustdesk-frontend
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal

# Environment
Environment=NODE_ENV=production
Environment=PORT=3000

# Security
NoNewPrivileges=true
PrivateTmp=true

# Performance
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

### Common Commands

```bash
# Check service status
ssh root@46.101.78.179 'sudo systemctl status rustdesk-frontend'

# View live logs
ssh root@46.101.78.179 'sudo journalctl -u rustdesk-frontend -f'

# Restart service
ssh root@46.101.78.179 'sudo systemctl restart rustdesk-frontend'

# Stop service
ssh root@46.101.78.179 'sudo systemctl stop rustdesk-frontend'

# Start service
ssh root@46.101.78.179 'sudo systemctl start rustdesk-frontend'

# Enable service (auto-start on boot)
ssh root@46.101.78.179 'sudo systemctl enable rustdesk-frontend'

# View recent logs (last 50 lines)
ssh root@46.101.78.179 'sudo journalctl -u rustdesk-frontend -n 50 --no-pager'
```

---

## 📊 Monitoring & Health Checks

### Automated Health Checks

The deployment script includes comprehensive health checks:

1. **Service Active Check**
   - Verifies systemd service is in "active" state
   - Timeout: 30 seconds
   - Retries every 3 seconds

2. **HTTP Response Check**
   - Tests `http://127.0.0.1:3000`
   - Accepts HTTP 200 or 307 (redirect)
   - Timeout: 60 seconds
   - Retries every 5 seconds

3. **Port Listening Check**
   - Verifies port 3000 is listening
   - Uses `netstat -tlnp`

### Manual Health Checks

```bash
# Test local access
ssh root@46.101.78.179 'curl -I http://127.0.0.1:3000'

# Test public access (should be proxied by NGINX)
curl -I https://rustdesk.bwb.pt

# Check if port is listening
ssh root@46.101.78.179 'netstat -tlnp | grep :3000'

# Check service uptime
ssh root@46.101.78.179 'systemctl show rustdesk-frontend | grep ActiveEnterTimestamp'
```

### Deployment History

View deployment history on the droplet:

```bash
ssh root@46.101.78.179 'cat /opt/rustdesk-frontend/deployment-history.log'
```

Example output:
```
2025-12-10 21:44:45 UTC | BUILD_ID: Production | Status: SUCCESS
2025-12-11 00:03:28 UTC | BUILD_ID: Production | Status: SUCCESS
```

### Monitoring Dashboard

Access the deployment monitoring dashboard at:
- **URL:** `https://rustdesk.bwb.pt/dashboard/deployments`
- **Features:**
  - Deployment history
  - Success/failure stats
  - Service health status
  - Quick action buttons

---

## 🔍 Troubleshooting

### Common Issues

#### 1. rsync Failures

**Symptom:** Files not transferring to droplet

**Diagnosis:**
```bash
# Run diagnostic script
./scripts/diagnose-rsync-next.sh
```

**Solutions:**
- Check SSH connectivity: `ssh root@46.101.78.179 'echo OK'`
- Verify remote directory exists
- Check disk space: `ssh root@46.101.78.179 'df -h'`
- Verify permissions

#### 2. Service Won't Start

**Symptom:** systemd service fails to start

**Diagnosis:**
```bash
# Check service status
ssh root@46.101.78.179 'sudo systemctl status rustdesk-frontend'

# View recent errors
ssh root@46.101.78.179 'sudo journalctl -u rustdesk-frontend -n 50'
```

**Common Causes:**
- Missing `.env.local` file
- Missing dependencies (run `npm install`)
- Port 3000 already in use
- File permissions incorrect

**Solutions:**
```bash
# Fix permissions
ssh root@46.101.78.179 'sudo chown -R rustdeskweb:rustdeskweb /opt/rustdesk-frontend'

# Reinstall dependencies
ssh root@46.101.78.179 'cd /opt/rustdesk-frontend && sudo -u rustdeskweb npm install'

# Check port usage
ssh root@46.101.78.179 'netstat -tlnp | grep :3000'
```

#### 3. BUILD_ID Mismatch

**Symptom:** Local and remote BUILD_IDs don't match

**Diagnosis:**
```bash
# Local BUILD_ID
cat .next/BUILD_ID

# Remote BUILD_ID
ssh root@46.101.78.179 'cat /opt/rustdesk-frontend/.next/BUILD_ID'
```

**Solution:**
- Re-run Step 2 (build locally)
- Re-run Step 4 (deploy)

#### 4. Missing Source Directories

**Symptom:** Build fails with "Module not found" errors

**Diagnosis:**
```bash
# Check if required directories exist locally
ls -la src/integrations/supabase
ls -la src/lib
ls -la src/services
```

**Solution:**
- Ensure Step 1 downloaded complete repository
- Set `ALLOW_DIRTY_RESET=1` if needed
- Re-run Step 1 to fetch missing files

#### 5. Health Check Timeout

**Symptom:** App deployed but health checks fail

**Diagnosis:**
```bash
# Check if service is running
ssh root@46.101.78.179 'sudo systemctl is-active rustdesk-frontend'

# Test HTTP manually
ssh root@46.101.78.179 'curl -v http://127.0.0.1:3000'

# Check recent logs
ssh root@46.101.78.179 'sudo journalctl -u rustdesk-frontend -n 30'
```

**Solutions:**
- Service may be slow to start (wait longer)
- Check for application errors in logs
- Verify `.env.local` has correct Supabase credentials

---

## ⏪ Rollback Procedures

### Quick Rollback

If a deployment fails, the service will automatically stay on the previous version because systemd maintains the running process.

**Manual rollback steps:**

1. **Stop the service:**
```bash
ssh root@46.101.78.179 'sudo systemctl stop rustdesk-frontend'
```

2. **Restore previous build:** (if you have a backup)
```bash
# Replace with your backup timestamp
ssh root@46.101.78.179 'sudo rm -rf /opt/rustdesk-frontend/.next'
ssh root@46.101.78.179 'sudo cp -r /opt/rustdesk-frontend/.next.backup /opt/rustdesk-frontend/.next'
ssh root@46.101.78.179 'sudo chown -R rustdeskweb:rustdeskweb /opt/rustdesk-frontend'
```

3. **Restart the service:**
```bash
ssh root@46.101.78.179 'sudo systemctl start rustdesk-frontend'
```

### Git-Based Rollback

If the issue is with recent code changes:

1. **Revert to previous commit locally:**
```bash
git log --oneline  # Find the commit hash to revert to
git reset --hard <commit-hash>
```

2. **Rebuild and redeploy:**
```bash
./scripts/Step-2-build-local.sh
./scripts/Step-4-deploy-tested-build.sh
```

### Create Build Backup

To enable quick rollbacks, create backups before deploying:

```bash
# Before Step 4, backup current production build
ssh root@46.101.78.179 'sudo cp -r /opt/rustdesk-frontend/.next /opt/rustdesk-frontend/.next.backup-$(date +%Y%m%d-%H%M%S)'
```

---

## 📝 Deployment Checklist

### Pre-Deployment

- [ ] Code changes committed to GitHub
- [ ] `.env.local` file exists and is up-to-date
- [ ] All required source directories present
- [ ] Local tests passing

### During Deployment

- [ ] Step 1: Download from main
- [ ] Step 2: Build locally
- [ ] Step 3: Test locally
- [ ] Step 4: Deploy to droplet
- [ ] Health checks pass
- [ ] Service active and responding

### Post-Deployment

- [ ] Test public URL: `https://rustdesk.bwb.pt`
- [ ] Verify QR code generation
- [ ] Check device registration
- [ ] Monitor logs for errors
- [ ] Update deployment history

---

## 🚨 Emergency Procedures

### Service Completely Down

```bash
# 1. Check if service is running
ssh root@46.101.78.179 'sudo systemctl status rustdesk-frontend'

# 2. Try restart
ssh root@46.101.78.179 'sudo systemctl restart rustdesk-frontend'

# 3. If still down, check logs
ssh root@46.101.78.179 'sudo journalctl -u rustdesk-frontend -n 100'

# 4. Manual start for debugging
ssh root@46.101.78.179 'cd /opt/rustdesk-frontend && sudo -u rustdeskweb npm start'
```

### Clean Start Procedure

If the service is in an unknown state:

```bash
# 1. Run cleanup script
./scripts/cleanup-droplet-simple.sh

# 2. Fresh deployment
./scripts/Step-2-build-local.sh
./scripts/Step-4-deploy-tested-build.sh
```

### NGINX Issues

```bash
# Check NGINX status
ssh root@46.101.78.179 'sudo systemctl status nginx'

# Restart NGINX
ssh root@46.101.78.179 'sudo systemctl restart nginx'

# Test NGINX config
ssh root@46.101.78.179 'sudo nginx -t'
```

---

## 📞 Support

### Getting Help

1. **Check logs first:** Most issues can be diagnosed from logs
2. **Review this guide:** Common issues are documented
3. **Check deployment history:** `/opt/rustdesk-frontend/deployment-history.log`

### Useful Commands Reference

```bash
# Quick health check
ssh root@46.101.78.179 'curl -I http://127.0.0.1:3000'

# View active deployments
ssh root@46.101.78.179 'tail -20 /opt/rustdesk-frontend/deployment-history.log'

# Check disk space
ssh root@46.101.78.179 'df -h /opt/rustdesk-frontend'

# Check system resources
ssh root@46.101.78.179 'free -h && uptime'

# List running processes
ssh root@46.101.78.179 'ps aux | grep npm'
```

---

## 🎯 Best Practices

1. **Always run all 4 steps in sequence** - Don't skip steps
2. **Monitor deployment logs** - Watch for errors during deployment
3. **Test after deployment** - Always verify the public URL works
4. **Keep deployment history** - Document each deployment
5. **Create backups before major changes** - Enable quick rollbacks
6. **Use consistent naming** - Follow the established patterns
7. **Document custom changes** - Update this guide if you modify the process

---

## 📚 Additional Resources

- [Next.js Production Deployment](https://nextjs.org/docs/deployment)
- [systemd Service Management](https://www.freedesktop.org/software/systemd/man/systemd.service.html)
- [NGINX Reverse Proxy](https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy/)
- [Supabase Documentation](https://supabase.com/docs)

---

**Document Version:** 1.0.0  
**Last Updated:** 2025-12-11  
**Maintainer:** DevOps Team