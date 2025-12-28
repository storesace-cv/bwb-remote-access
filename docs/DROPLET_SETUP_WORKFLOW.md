# Droplet Setup & Deployment Workflow

Complete guide for setting up and deploying to the droplet at **46.101.78.179**

## 🎯 Overview

This project uses a **local-first workflow**:
1. Work on local branch `my-softgen-rustdesk-mesh-integration`
2. Build and test locally
3. Deploy directly to droplet via SCP/SSH

**No GitHub cloning involved - direct local → droplet deployment**

## 🚀 Initial Droplet Setup (One-Time)

### Step 1: Connect to Fresh Droplet

```bash
ssh root@46.101.78.179
```

### Step 2: Download and Run System Setup Script

```bash
# Download the setup script
wget https://raw.githubusercontent.com/YOUR_USERNAME/rustdesk-mesh-integration/main/scripts/droplet-full-install.sh

# Or if you have the code locally, upload it first
# On your local machine:
scp scripts/droplet-full-install.sh root@46.101.78.179:/root/

# Then on droplet:
chmod +x droplet-full-install.sh
./droplet-full-install.sh
```

This script installs:
- ✅ Node.js 20
- ✅ npm
- ✅ PM2 process manager
- ✅ System dependencies
- ✅ Firewall configuration (UFW)
- ✅ Application directory structure
- ✅ systemd service

### Step 3: Exit SSH Session

```bash
exit
```

The droplet is now ready to receive your application code!

## 🔄 Regular Deployment Workflow

From your local machine, in your project directory:

### 1. Update from Main Branch

```bash
./scripts/Step-1-download-from-main.sh
```

Downloads latest changes from main branch to your local machine.

### 2. Build Locally

```bash
./scripts/Step-2-build-local.sh
```

Builds the Next.js application locally.

### 3. Test Locally

```bash
./scripts/Step-3-test-local.sh
```

Runs the application locally to verify everything works.

### 4. Deploy to Droplet

```bash
./scripts/Step-4-deploy-tested-build.sh
```

This script:
- Uploads your tested build to droplet
- Installs production dependencies
- Restarts the service
- Verifies deployment

## 📁 Directory Structure

### Local Machine

```
my-softgen-rustdesk-mesh-integration/
├── src/                    # Source code
├── public/                 # Static files
├── scripts/                # Deployment scripts
│   ├── Step-1-download-from-main.sh
│   ├── Step-2-build-local.sh
│   ├── Step-3-test-local.sh
│   ├── Step-4-deploy-tested-build.sh
│   └── droplet-full-install.sh
├── .next/                  # Build output (after Step-2)
├── .env.local              # Environment variables
└── package.json
```

### Droplet (46.101.78.179)

```
/opt/rustdesk-frontend/     # Application root
├── src/                    # Deployed source
├── public/                 # Deployed static files
├── .next/                  # Deployed build
├── scripts/                # Deployment scripts
├── .env.local              # Environment variables
├── package.json
├── ecosystem.config.js     # PM2 configuration
└── logs/                   # Application logs

/opt/meshcentral/           # MeshCentral installation
├── MeshCentral/
│   └── meshcentral.js      # MeshCentral executable
└── meshcentral-data/       # MeshCentral data
    ├── config.json         # MeshCentral config
    └── meshcentral.db      # MeshCentral database
```

## 🔧 Configuration

### Environment Variables (.env.local)

```bash
NEXT_PUBLIC_SUPABASE_URL=https://kqwaibgvmzcqeoctukoy.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
NEXT_PUBLIC_SITE_URL=http://46.101.78.179:3000
NODE_ENV=production
```

### Firewall Rules (UFW)

Automatically configured by setup script:
- Port 22 (SSH)
- Port 80 (HTTP)
- Port 443 (HTTPS)
- Port 3000 (Next.js)
- Ports 4430-4433 (MeshCentral)

## 📊 Service Management

### Check Application Status

```bash
ssh root@46.101.78.179 'sudo systemctl status rustdesk-frontend'
```

### View Application Logs

```bash
ssh root@46.101.78.179 'sudo journalctl -u rustdesk-frontend -f'
```

### Restart Application

```bash
ssh root@46.101.78.179 'sudo systemctl restart rustdesk-frontend'
```

### PM2 Status

```bash
ssh root@46.101.78.179 'pm2 status'
```

### PM2 Logs

```bash
ssh root@46.101.78.179 'pm2 logs'
```

## 🐛 Troubleshooting

### Deployment Fails

1. **Check if system setup was run:**
   ```bash
   ssh root@46.101.78.179 'test -d /opt/rustdesk-frontend && echo "Directory exists" || echo "Run droplet-full-install.sh first"'
   ```

2. **Check Node.js installation:**
   ```bash
   ssh root@46.101.78.179 'node --version'
   ```

3. **Check service status:**
   ```bash
   ssh root@46.101.78.179 'sudo systemctl status rustdesk-frontend'
   ```

### Application Won't Start

1. **Check logs:**
   ```bash
   ssh root@46.101.78.179 'sudo journalctl -u rustdesk-frontend -n 100 --no-pager'
   ```

2. **Check port availability:**
   ```bash
   ssh root@46.101.78.179 'sudo lsof -i :3000'
   ```

3. **Manually test:**
   ```bash
   ssh root@46.101.78.179
   cd /opt/rustdesk-frontend
   npm start
   ```

### Build Issues Locally

1. **Clean rebuild:**
   ```bash
   rm -rf .next node_modules package-lock.json
   npm install
   npm run build
   ```

2. **Check .env.local:**
   ```bash
   cat .env.local
   ```

## 🔄 Update Workflow

### Quick Update (No Code Changes)

If only environment variables changed:

```bash
# Edit .env.local locally
nano .env.local

# Deploy
./scripts/Step-4-deploy-tested-build.sh
```

### Full Update (With Code Changes)

```bash
# Update from main
./scripts/Step-1-download-from-main.sh

# Build and test
./scripts/Step-2-build-local.sh
./scripts/Step-3-test-local.sh

# Deploy
./scripts/Step-4-deploy-tested-build.sh
```

### Emergency Rollback

If deployment breaks production:

```bash
# SSH to droplet
ssh root@46.101.78.179

# Check logs
sudo journalctl -u rustdesk-frontend -n 100

# Restart service
sudo systemctl restart rustdesk-frontend

# Or restore from backup (if configured)
```

## 📦 MeshCentral Integration

The droplet also runs MeshCentral at these locations:

```
Root: /opt/meshcentral
Executable: /opt/meshcentral/MeshCentral/meshcentral.js
Data: /opt/meshcentral/meshcentral-data
Config: /opt/meshcentral/meshcentral-data/config.json
Database: /opt/meshcentral/meshcentral-data/meshcentral.db
Service: /etc/systemd/system/meshcentral.service
```

### Check MeshCentral Status

```bash
ssh root@46.101.78.179 'sudo systemctl status meshcentral'
```

### Restart MeshCentral

```bash
ssh root@46.101.78.179 'sudo systemctl restart meshcentral'
```

## 🎯 Access Points

After successful deployment:

- **Frontend Application:** http://46.101.78.179:3000
- **MeshCentral:** https://46.101.78.179:4430 (if configured)

## 📚 Related Documentation

- [README.md](../README.md) - Project overview
- [ROADMAP.md](./ROADMAP.md) - Development roadmap
- [QUICK_START.md](./QUICK_START.md) - Quick reference guide

---

**Last Updated:** 2025-12-10
**Droplet IP:** 46.101.78.179
**Deployment Method:** Local → Droplet (via SCP/SSH)