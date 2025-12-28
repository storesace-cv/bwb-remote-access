# Fresh Droplet Installation Guide

Complete guide for installing RustDesk Mesh Integration on a fresh Ubuntu droplet.

## 📋 Prerequisites

- **Fresh Ubuntu 22.04 or 24.04 droplet** (tested on DigitalOcean)
- **SSH access** to the droplet
- **Minimum specs**: 1GB RAM, 1 vCPU, 25GB disk
- **Supabase project** with credentials

## 🚀 Quick Install (Recommended)

### Option 1: One-Command Install

```bash
wget https://raw.githubusercontent.com/YOUR_USERNAME/rustdesk-mesh-integration/main/scripts/droplet-full-install.sh
chmod +x droplet-full-install.sh
./droplet-full-install.sh
```

### Option 2: Direct Execution

```bash
curl -sSL https://raw.githubusercontent.com/YOUR_USERNAME/rustdesk-mesh-integration/main/scripts/droplet-full-install.sh | bash
```

⚠️ **Before running, update the script with your GitHub repository URL!**

## 📝 What Gets Installed

The script installs and configures everything automatically:

### System Components
- ✅ Node.js 20.x
- ✅ npm (latest)
- ✅ PM2 process manager
- ✅ Git
- ✅ Build essentials
- ✅ UFW firewall (configured)

### Application Setup
- ✅ Repository cloned to `/var/www/rustdesk-frontend`
- ✅ Dependencies installed
- ✅ Application built
- ✅ Environment variables configured
- ✅ systemd service created and enabled
- ✅ PM2 configured for process management

### Security
- ✅ Firewall configured (ports 22, 80, 443, 3000)
- ✅ Non-root user setup (recommended)
- ✅ Service running with proper permissions

## 📖 Step-by-Step Manual Installation

If you prefer manual control over each step:

### 1. Connect to Your Droplet

```bash
ssh root@YOUR_DROPLET_IP
```

### 2. Create Application User (Recommended)

```bash
# Create new user
adduser rustdesk

# Add to sudo group
usermod -aG sudo rustdesk

# Switch to new user
su - rustdesk
```

### 3. Download and Prepare Script

```bash
# Download script
wget https://raw.githubusercontent.com/YOUR_USERNAME/rustdesk-mesh-integration/main/scripts/droplet-full-install.sh

# Make executable
chmod +x droplet-full-install.sh

# Edit to update REPO_URL
nano droplet-full-install.sh
```

Update this line:
```bash
REPO_URL="https://github.com/YOUR_USERNAME/rustdesk-mesh-integration.git"
```

### 4. Run Installation

```bash
./droplet-full-install.sh
```

The script will guide you through the installation with clear progress indicators.

### 5. Verify Installation

```bash
# Check service status
sudo systemctl status rustdesk-frontend

# Check PM2
pm2 status

# View logs
sudo journalctl -u rustdesk-frontend -f
```

## 🌐 Accessing Your Application

After installation, access at:
```
http://YOUR_DROPLET_IP:3000
```

## 🔧 Post-Installation Configuration

### Update Environment Variables

If you need to modify Supabase credentials:

```bash
cd /var/www/rustdesk-frontend
nano .env.local
```

After changes:
```bash
sudo systemctl restart rustdesk-frontend
pm2 restart all
```

### Configure Custom Domain

1. **Update DNS records:**
   ```
   A record: @ -> YOUR_DROPLET_IP
   ```

2. **Update .env.local:**
   ```bash
   NEXT_PUBLIC_SITE_URL=https://yourdomain.com
   ```

3. **Restart services:**
   ```bash
   sudo systemctl restart rustdesk-frontend
   ```

### Set Up SSL/TLS (Recommended)

Install Certbot:
```bash
sudo apt-get install certbot python3-certbot-nginx -y
```

Get certificate:
```bash
sudo certbot --nginx -d yourdomain.com
```

### Configure Nginx as Reverse Proxy

Install Nginx:
```bash
sudo apt-get install nginx -y
```

Create site configuration:
```bash
sudo nano /etc/nginx/sites-available/rustdesk
```

Add configuration:
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/rustdesk /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## 📊 Management Commands

### Service Management

```bash
# Check status
sudo systemctl status rustdesk-frontend

# Start service
sudo systemctl start rustdesk-frontend

# Stop service
sudo systemctl stop rustdesk-frontend

# Restart service
sudo systemctl restart rustdesk-frontend

# Enable on boot
sudo systemctl enable rustdesk-frontend

# Disable on boot
sudo systemctl disable rustdesk-frontend
```

### PM2 Management

```bash
# View all processes
pm2 status

# View logs
pm2 logs

# View specific app logs
pm2 logs rustdesk-frontend

# Restart all
pm2 restart all

# Stop all
pm2 stop all

# Save PM2 configuration
pm2 save
```

### Log Files

```bash
# Application logs (systemd)
sudo journalctl -u rustdesk-frontend -f

# PM2 logs
pm2 logs

# PM2 error logs
pm2 logs --err

# Application debug logs
tail -f /var/www/rustdesk-frontend/logs/app-debug.log
```

### Update Application

```bash
cd /var/www/rustdesk-frontend

# Pull latest changes
git pull origin main

# Install new dependencies
npm install

# Rebuild
npm run build

# Restart
sudo systemctl restart rustdesk-frontend
pm2 restart all
```

## 🐛 Troubleshooting

### Service Won't Start

```bash
# Check detailed logs
sudo journalctl -u rustdesk-frontend -n 100 --no-pager

# Check if port 3000 is in use
sudo lsof -i :3000

# Kill process on port 3000
sudo kill -9 $(sudo lsof -t -i:3000)
```

### Build Errors

```bash
cd /var/www/rustdesk-frontend

# Clean rebuild
rm -rf node_modules .next package-lock.json
npm install
npm run build
```

### Permission Issues

```bash
# Fix ownership
sudo chown -R $USER:$USER /var/www/rustdesk-frontend

# Fix permissions
chmod -R 755 /var/www/rustdesk-frontend
```

### Environment Variable Issues

```bash
# Check environment file
cat /var/www/rustdesk-frontend/.env.local

# Verify Supabase connection
curl -I https://kqwaibgvmzcqeoctukoy.supabase.co
```

### Firewall Issues

```bash
# Check firewall status
sudo ufw status verbose

# Allow port 3000
sudo ufw allow 3000/tcp
sudo ufw reload

# Disable firewall temporarily (testing only)
sudo ufw disable
```

### Memory Issues

```bash
# Check memory usage
free -h

# Check Node.js memory
pm2 monit

# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=2048"
npm run build
```

## 🔒 Security Best Practices

### 1. Change SSH Port

```bash
sudo nano /etc/ssh/sshd_config
```

Change `Port 22` to another port (e.g., `2222`), then:
```bash
sudo systemctl restart sshd
sudo ufw allow 2222/tcp
```

### 2. Disable Root SSH Login

```bash
sudo nano /etc/ssh/sshd_config
```

Set `PermitRootLogin no`, then:
```bash
sudo systemctl restart sshd
```

### 3. Set Up SSH Keys

```bash
# On your local machine
ssh-keygen -t ed25519

# Copy to droplet
ssh-copy-id user@YOUR_DROPLET_IP
```

### 4. Enable Automatic Security Updates

```bash
sudo apt-get install unattended-upgrades -y
sudo dpkg-reconfigure -plow unattended-upgrades
```

### 5. Install Fail2Ban

```bash
sudo apt-get install fail2ban -y
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

## 📈 Monitoring

### Install Netdata

```bash
bash <(curl -Ss https://my-netdata.io/kickstart.sh)
```

Access at: `http://YOUR_DROPLET_IP:19999`

### Basic Health Checks

```bash
# CPU usage
top

# Memory usage
free -h

# Disk usage
df -h

# Network connections
netstat -tuln
```

## 💾 Backup Strategy

### Database Backup

Set up automated Supabase backups through Supabase dashboard.

### Application Backup

```bash
# Create backup script
sudo nano /usr/local/bin/backup-rustdesk.sh
```

Add:
```bash
#!/bin/bash
BACKUP_DIR="/backups/rustdesk"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR
tar -czf $BACKUP_DIR/rustdesk_$DATE.tar.gz /var/www/rustdesk-frontend

# Keep only last 7 backups
ls -t $BACKUP_DIR/rustdesk_*.tar.gz | tail -n +8 | xargs rm -f
```

Make executable:
```bash
sudo chmod +x /usr/local/bin/backup-rustdesk.sh
```

Add to crontab:
```bash
sudo crontab -e
```

Add line:
```
0 2 * * * /usr/local/bin/backup-rustdesk.sh
```

## 🗑️ Complete Removal

To completely uninstall:

```bash
# Stop services
sudo systemctl stop rustdesk-frontend
pm2 delete all

# Remove application
sudo rm -rf /var/www/rustdesk-frontend

# Remove service
sudo rm /etc/systemd/system/rustdesk-frontend.service
sudo systemctl daemon-reload

# Remove Node.js (optional)
sudo apt-get remove nodejs npm -y

# Remove PM2 (optional)
sudo npm uninstall -g pm2
```

## 📞 Support

If you encounter issues:

1. **Check logs:** `sudo journalctl -u rustdesk-frontend -f`
2. **Verify environment:** Check `.env.local` file
3. **Check firewall:** `sudo ufw status`
4. **Review this guide:** Most issues are covered in troubleshooting

## 📚 Additional Resources

- [QUICK_START.md](./QUICK_START.md) - Quick reference guide
- [README.md](../README.md) - Project overview
- [ROADMAP.md](./ROADMAP.md) - Future plans

---

**Last Updated:** 2025-12-10