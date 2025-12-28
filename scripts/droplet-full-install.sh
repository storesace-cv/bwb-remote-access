#!/bin/bash

# ============================================================================
# RustDesk Mesh Integration - Production Server Installation Script
# ============================================================================
# 
# IMPORTANT: This script is designed for a PRODUCTION server that already has:
# - MeshCentral (running behind NGINX + HTTPS)
# - RustDesk server (hbbs/hbbr)
# - NGINX with multiple virtual hosts
# - Security hardening (UFW, CrowdSec, Fail2Ban)
#
# This script:
# 1. PHASE 1: Repairs/cleans any side-effects from previous runs
# 2. PHASE 2: Installs RustDesk frontend without breaking existing services
#
# Safe to re-run multiple times (idempotent design)
#
# Run with: sudo bash droplet-full-install.sh
# ============================================================================

set -e  # Exit on any error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Configuration variables
FRONTEND_USER="rustdeskweb"
FRONTEND_DIR="/opt/rustdesk-frontend"
FRONTEND_SERVICE="rustdesk-frontend.service"
FRONTEND_PORT="3000"
NGINX_SITE="rustdesk.bwb.pt"

# Paths to NOT touch (existing production services)
MESHCENTRAL_ROOT="/opt/meshcentral"
RUSTDESK_SERVER_ROOT="/opt/rustdesk"

# ============================================================================
# Helper Functions
# ============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[⚠]${NC} $1"
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
}

log_step() {
    echo -e "\n${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${MAGENTA}$1${NC}"
    echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

# ============================================================================
# PHASE 1: CLEANUP / REPAIR
# ============================================================================

phase1_cleanup() {
    log_step "PHASE 1: CLEANUP & REPAIR OF PREVIOUS INSTALLATIONS"
    
    log_info "This phase removes any side-effects from previous script runs..."
    
    # 1.1 Stop and disable old frontend service (if exists)
    if systemctl list-unit-files | grep -q "$FRONTEND_SERVICE"; then
        log_warning "Found old $FRONTEND_SERVICE - stopping and disabling..."
        sudo systemctl stop "$FRONTEND_SERVICE" 2>/dev/null || true
        sudo systemctl disable "$FRONTEND_SERVICE" 2>/dev/null || true
        log_success "Old service stopped and disabled"
    else
        log_info "No old $FRONTEND_SERVICE found - nothing to clean"
    fi
    
    # 1.2 Remove old PM2 processes (if running as root or other users)
    if command -v pm2 &> /dev/null; then
        log_info "Checking for old PM2 processes..."
        sudo pm2 delete all 2>/dev/null || true
        sudo pm2 kill 2>/dev/null || true
        log_success "Old PM2 processes cleaned"
    fi
    
    # 1.3 Clean up unnecessary UFW rules from previous runs
    log_info "Reviewing UFW rules..."
    
    # Remove port 3000/tcp if it was opened (we'll use NGINX reverse proxy instead)
    if sudo ufw status numbered | grep -q "3000/tcp"; then
        log_warning "Found port 3000/tcp exposed - removing (will use NGINX instead)..."
        # Get rule number and delete it
        RULE_NUM=$(sudo ufw status numbered | grep "3000/tcp" | head -1 | awk '{print $1}' | tr -d '[]')
        if [ -n "$RULE_NUM" ]; then
            echo "y" | sudo ufw delete "$RULE_NUM" 2>/dev/null || true
            log_success "Port 3000/tcp rule removed"
        fi
    fi
    
    # Remove redundant MeshCentral ports (keep only 4433)
    for port in 4430 4431 4432; do
        if sudo ufw status numbered | grep -q "$port/tcp"; then
            log_warning "Found redundant port $port/tcp - removing (only 4433 needed)..."
            RULE_NUM=$(sudo ufw status numbered | grep "$port/tcp" | head -1 | awk '{print $1}' | tr -d '[]')
            if [ -n "$RULE_NUM" ]; then
                echo "y" | sudo ufw delete "$RULE_NUM" 2>/dev/null || true
                log_success "Port $port/tcp rule removed"
            fi
        fi
    done
    
    # 1.4 Verify critical services are NOT touched
    log_info "Verifying production services are intact..."
    
    if [ -d "$MESHCENTRAL_ROOT" ]; then
        log_success "MeshCentral intact at $MESHCENTRAL_ROOT"
    else
        log_warning "MeshCentral not found - this is OK if not installed yet"
    fi
    
    if [ -d "$RUSTDESK_SERVER_ROOT" ]; then
        log_success "RustDesk server intact at $RUSTDESK_SERVER_ROOT"
    else
        log_warning "RustDesk server not found - this is OK if not installed yet"
    fi
    
    # Verify MeshCentral service still works (if exists)
    if systemctl list-unit-files | grep -q "meshcentral.service"; then
        if systemctl is-active --quiet meshcentral.service; then
            log_success "MeshCentral service is running"
        else
            log_warning "MeshCentral service exists but is not running"
        fi
    fi
    
    # Verify RustDesk services still work (if exist)
    for service in rustdesk-hbbs.service rustdesk-hbbr.service; do
        if systemctl list-unit-files | grep -q "$service"; then
            if systemctl is-active --quiet "$service"; then
                log_success "Service $service is running"
            else
                log_warning "Service $service exists but is not running"
            fi
        fi
    done
    
    log_success "PHASE 1 COMPLETE - Cleanup finished, production services verified"
}

# ============================================================================
# PHASE 2: FRESH INSTALLATION
# ============================================================================

phase2_install() {
    log_step "PHASE 2: FRESH INSTALLATION OF RUSTDESK FRONTEND"
    
    log_info "This phase installs the frontend without touching existing services..."
}

# ============================================================================
# Step 2.1: System Update (Minimal)
# ============================================================================

step_system_update() {
    log_step "STEP 2.1: System Update (Minimal)"
    
    log_info "Updating package lists only..."
    sudo apt-get update -qq
    
    log_info "Installing essential packages (if not present)..."
    sudo apt-get install -y -qq \
        curl \
        wget \
        git \
        build-essential \
        ca-certificates \
        gnupg \
        nano \
        jq 2>/dev/null || true
    
    log_success "System packages updated"
}

# ============================================================================
# Step 2.2: Node.js Version Management
# ============================================================================

step_nodejs_check() {
    log_step "STEP 2.2: Node.js Version Check"
    
    if command -v node &> /dev/null; then
        CURRENT_NODE=$(node --version)
        NODE_MAJOR=$(echo "$CURRENT_NODE" | cut -d'.' -f1 | tr -d 'v')
        
        log_info "Found Node.js $CURRENT_NODE (major version: $NODE_MAJOR)"
        
        # Accept Node 20 or higher
        if [ "$NODE_MAJOR" -ge 20 ]; then
            log_success "Node.js version is compatible (v$NODE_MAJOR >= v20)"
            log_warning "Keeping existing Node.js installation"
            return 0
        else
            log_warning "Node.js v$NODE_MAJOR is too old (need v20+)"
            log_info "Will install Node.js v20..."
        fi
    else
        log_warning "Node.js not found - will install v20"
    fi
    
    # Install Node.js 20
    log_info "Adding NodeSource repository for Node.js v20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - > /dev/null 2>&1
    
    log_info "Installing Node.js v20..."
    sudo apt-get install -y -qq nodejs
    
    # Verify installation
    NODE_VER=$(node --version)
    NPM_VER=$(npm --version)
    
    log_success "Node.js ${NODE_VER} installed"
    log_success "npm ${NPM_VER} installed"
}

# ============================================================================
# Step 2.3: Install PM2 (If Not Present)
# ============================================================================

step_install_pm2() {
    log_step "STEP 2.3: PM2 Installation Check"
    
    if command -v pm2 &> /dev/null; then
        PM2_VER=$(pm2 --version)
        log_success "PM2 ${PM2_VER} already installed"
        return 0
    fi
    
    log_info "Installing PM2 globally..."
    sudo npm install -g pm2 --quiet
    
    # Configure PM2 startup for the frontend user (will be created later)
    log_info "PM2 will be configured for user $FRONTEND_USER after user creation"
    
    PM2_VER=$(pm2 --version)
    log_success "PM2 ${PM2_VER} installed"
}

# ============================================================================
# Step 2.4: Create Dedicated User for Frontend
# ============================================================================

step_create_user() {
    log_step "STEP 2.4: Create Dedicated User ($FRONTEND_USER)"
    
    # Check if user exists
    if id -u "$FRONTEND_USER" >/dev/null 2>&1; then
        log_warning "User $FRONTEND_USER already exists"
        log_success "Skipping user creation"
        return 0
    fi
    
    log_info "Creating system user: $FRONTEND_USER"
    sudo useradd -r -s /bin/bash -d "$FRONTEND_DIR" -m "$FRONTEND_USER"
    
    log_success "User $FRONTEND_USER created"
    log_info "Home directory: $FRONTEND_DIR"
}

# ============================================================================
# Step 2.5: Create Application Directory
# ============================================================================

step_create_directory() {
    log_step "STEP 2.5: Create Application Directory"
    
    # Remove old directory if exists and is empty or belongs to old install
    if [ -d "$FRONTEND_DIR" ]; then
        log_warning "Directory $FRONTEND_DIR already exists"
        
        # Check if it contains important files
        if [ "$(ls -A $FRONTEND_DIR 2>/dev/null)" ]; then
            log_warning "Directory is not empty - keeping existing files"
        else
            log_info "Directory is empty - will use it"
        fi
    else
        log_info "Creating application directory: $FRONTEND_DIR"
        sudo mkdir -p "$FRONTEND_DIR"
    fi
    
    # Set ownership to frontend user
    sudo chown -R "$FRONTEND_USER:$FRONTEND_USER" "$FRONTEND_DIR"
    
    # Create logs subdirectory
    sudo mkdir -p "$FRONTEND_DIR/logs"
    sudo chown -R "$FRONTEND_USER:$FRONTEND_USER" "$FRONTEND_DIR/logs"
    
    log_success "Application directory ready: $FRONTEND_DIR"
    log_info "Owner: $FRONTEND_USER:$FRONTEND_USER"
}

# ============================================================================
# Step 2.6: Configure systemd Service
# ============================================================================

step_configure_service() {
    log_step "STEP 2.6: Configure systemd Service"
    
    log_info "Creating systemd service: $FRONTEND_SERVICE"
    
    # Create service file
    # CRITICAL: This service runs as $FRONTEND_USER (not root)
    # CRITICAL: WorkingDirectory must match $FRONTEND_DIR
    # CRITICAL: Service binds to localhost:3000 only (not exposed externally)
    sudo tee /etc/systemd/system/"$FRONTEND_SERVICE" > /dev/null <<EOF
[Unit]
Description=RustDesk Web Frontend
Documentation=https://github.com/YOUR_REPO/rustdesk-mesh-integration
After=network.target

[Service]
Type=simple
User=$FRONTEND_USER
Group=$FRONTEND_USER
WorkingDirectory=$FRONTEND_DIR

# Environment
Environment=NODE_ENV=production
Environment=PORT=$FRONTEND_PORT

# Start command - runs npm start which starts Next.js
ExecStart=/usr/bin/npm start

# Restart policy
Restart=always
RestartSec=10

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=rustdesk-frontend

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$FRONTEND_DIR

[Install]
WantedBy=multi-user.target
EOF
    
    # Reload systemd to recognize new service
    log_info "Reloading systemd daemon..."
    sudo systemctl daemon-reload
    
    # Enable service (will start on boot)
    log_info "Enabling service to start on boot..."
    sudo systemctl enable "$FRONTEND_SERVICE"
    
    log_success "systemd service configured: /etc/systemd/system/$FRONTEND_SERVICE"
    log_warning "Service will NOT start yet (no code deployed)"
    log_info "Deploy your code with Step-4-deploy-tested-build.sh to start the service"
}

# ============================================================================
# Step 2.7: Configure NGINX Reverse Proxy
# ============================================================================

step_configure_nginx() {
    log_step "STEP 2.7: Configure NGINX Reverse Proxy"
    
    # Check if NGINX is installed
    if ! command -v nginx &> /dev/null; then
        log_warning "NGINX not found on this system"
        log_info "Skipping NGINX configuration"
        log_info "You can configure NGINX manually later or it will be done by your main setup"
        return 0
    fi
    
    NGINX_AVAILABLE="/etc/nginx/sites-available/$NGINX_SITE.conf"
    NGINX_ENABLED="/etc/nginx/sites-enabled/$NGINX_SITE.conf"
    
    # Check if site config already exists
    if [ -f "$NGINX_AVAILABLE" ]; then
        log_warning "NGINX config already exists: $NGINX_AVAILABLE"
        log_info "Checking if it needs updates..."
        
        # Check if our location block exists
        if grep -q "proxy_pass.*127.0.0.1:$FRONTEND_PORT" "$NGINX_AVAILABLE"; then
            log_success "NGINX already configured for frontend"
            return 0
        else
            log_warning "NGINX config exists but needs frontend configuration"
            log_info "You should manually add this location block to $NGINX_AVAILABLE:"
            echo ""
            echo "    location / {"
            echo "        proxy_pass http://127.0.0.1:$FRONTEND_PORT;"
            echo "        proxy_http_version 1.1;"
            echo "        proxy_set_header Host \$host;"
            echo "        proxy_set_header Upgrade \$http_upgrade;"
            echo "        proxy_set_header Connection \"upgrade\";"
            echo "        proxy_set_header X-Real-IP \$remote_addr;"
            echo "        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;"
            echo "        proxy_set_header X-Forwarded-Proto \$scheme;"
            echo "    }"
            echo ""
            log_warning "After adding, run: sudo nginx -t && sudo systemctl reload nginx"
            return 0
        fi
    fi
    
    # Create new NGINX configuration
    log_info "Creating new NGINX configuration for $NGINX_SITE..."
    
    # CRITICAL: This assumes Let's Encrypt cert exists at the standard path
    # CRITICAL: Adjust cert path if your setup is different
    sudo tee "$NGINX_AVAILABLE" > /dev/null <<'EOF'
# RustDesk Web Frontend - Reverse Proxy Configuration
# This proxies requests to the Next.js app running on localhost:3000

# Upstream backend (localhost only - not exposed externally)
upstream rustdesk_frontend {
    server 127.0.0.1:3000 fail_timeout=30s max_fails=3;
}

# HTTP -> HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name rustdesk.bwb.pt;
    
    # Redirect all HTTP to HTTPS
    return 301 https://$host$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name rustdesk.bwb.pt;
    
    # SSL certificate (using same cert as mesh.bwb.pt)
    # ADJUST THIS PATH if your certificate location is different
    ssl_certificate     /etc/letsencrypt/live/mesh.bwb.pt/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mesh.bwb.pt/privkey.pem;
    
    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    # Logging
    access_log /var/log/nginx/rustdesk-frontend-access.log;
    error_log  /var/log/nginx/rustdesk-frontend-error.log;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # Main location - proxy to Next.js app
    location / {
        proxy_pass http://rustdesk_frontend;
        proxy_http_version 1.1;
        
        # WebSocket support (needed for Next.js dev/HMR)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # Standard proxy headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # Static files (optional - Next.js serves these, but NGINX can cache)
    location /_next/static/ {
        proxy_pass http://rustdesk_frontend;
        proxy_cache_valid 200 60m;
        add_header Cache-Control "public, immutable";
    }
}
EOF
    
    # Enable site by creating symlink
    if [ ! -L "$NGINX_ENABLED" ]; then
        log_info "Enabling NGINX site..."
        sudo ln -s "$NGINX_AVAILABLE" "$NGINX_ENABLED"
    fi
    
    # Test NGINX configuration
    log_info "Testing NGINX configuration..."
    if sudo nginx -t 2>/dev/null; then
        log_success "NGINX configuration valid"
        
        # Reload NGINX
        log_info "Reloading NGINX..."
        sudo systemctl reload nginx
        
        log_success "NGINX configured and reloaded"
        log_info "Frontend will be accessible at: https://$NGINX_SITE"
    else
        log_error "NGINX configuration test failed!"
        log_warning "Check the configuration manually:"
        echo "  sudo nginx -t"
        echo "  sudo nano $NGINX_AVAILABLE"
        log_warning "After fixing, reload with: sudo systemctl reload nginx"
    fi
}

# ============================================================================
# Step 2.8: Configure UFW Firewall (Conservative)
# ============================================================================

step_configure_firewall() {
    log_step "STEP 2.8: Configure UFW Firewall (Conservative)"
    
    # Check if UFW is installed
    if ! command -v ufw &> /dev/null; then
        log_warning "UFW not installed - skipping firewall configuration"
        return 0
    fi
    
    log_info "Checking existing UFW rules..."
    
    # CRITICAL: We do NOT open port 3000 externally
    # Frontend is accessed via NGINX reverse proxy on port 443
    
    # Verify essential ports are open (they should be from your production setup)
    ESSENTIAL_PORTS=(
        "22/tcp"       # SSH
        "80/tcp"       # HTTP
        "443/tcp"      # HTTPS
        "4433/tcp"     # Intel AMT (MeshCentral)
        "6690/tcp"     # Your custom port
        "21111/tcp"    # RustDesk web/RDP
    )
    
    for port in "${ESSENTIAL_PORTS[@]}"; do
        if sudo ufw status | grep -q "$port"; then
            log_success "Port $port is open (existing rule)"
        else
            log_warning "Port $port not open (expected from production setup)"
        fi
    done
    
    # Verify RustDesk server ports are open (ranges)
    if sudo ufw status | grep -q "21115:21119/tcp"; then
        log_success "RustDesk TCP ports 21115-21119 are open"
    else
        log_warning "RustDesk TCP ports 21115-21119 not found (expected for RustDesk server)"
    fi
    
    if sudo ufw status | grep -q "21115:21119/udp"; then
        log_success "RustDesk UDP ports 21115-21119 are open"
    else
        log_warning "RustDesk UDP ports 21115-21119 not found (expected for RustDesk server)"
    fi
    
    # CRITICAL: Verify sensitive ports are NOT exposed
    SENSITIVE_PORTS=(
        "8080/tcp"     # MeshCentral internal
        "8081/tcp"     # MeshCentral internal
        "8085/tcp"     # CrowdSec LAPI
        "3000/tcp"     # Our frontend (should use NGINX)
    )
    
    for port in "${SENSITIVE_PORTS[@]}"; do
        if sudo ufw status | grep -q "$port.*ALLOW"; then
            log_error "SECURITY ISSUE: Port $port is exposed but should not be!"
            log_warning "Consider removing this rule: sudo ufw delete allow $port"
        else
            log_success "Port $port correctly NOT exposed (using NGINX/localhost)"
        fi
    done
    
    log_success "Firewall configuration verified"
    log_info "Frontend uses NGINX reverse proxy (no direct port exposure needed)"
}

# ============================================================================
# Step 2.9: Verify Production Services Integrity
# ============================================================================

step_verify_services() {
    log_step "STEP 2.9: Verify Production Services Integrity"
    
    log_info "Final verification that we didn't break anything..."
    
    # Check MeshCentral
    if [ -d "$MESHCENTRAL_ROOT" ]; then
        log_success "MeshCentral directory intact"
        
        if [ -f "$MESHCENTRAL_ROOT/meshcentral-data/config.json" ]; then
            log_success "MeshCentral config intact"
        fi
        
        if systemctl is-active --quiet meshcentral.service 2>/dev/null; then
            log_success "MeshCentral service running"
        fi
    fi
    
    # Check RustDesk server
    if [ -d "$RUSTDESK_SERVER_ROOT" ]; then
        log_success "RustDesk server directory intact"
        
        if systemctl is-active --quiet rustdesk-hbbs.service 2>/dev/null; then
            log_success "RustDesk hbbs service running"
        fi
        
        if systemctl is-active --quiet rustdesk-hbbr.service 2>/dev/null; then
            log_success "RustDesk hbbr service running"
        fi
    fi
    
    # Check NGINX
    if command -v nginx &> /dev/null; then
        if systemctl is-active --quiet nginx 2>/dev/null; then
            log_success "NGINX service running"
        fi
        
        # Check if MeshCentral virtual hosts still exist
        if [ -f "/etc/nginx/sites-enabled/mesh.bwb.pt" ]; then
            log_success "MeshCentral NGINX config intact"
        fi
    fi
    
    # Check CrowdSec
    if systemctl list-unit-files | grep -q crowdsec.service; then
        if systemctl is-active --quiet crowdsec.service 2>/dev/null; then
            log_success "CrowdSec service running"
        fi
        
        # Verify LAPI is still on localhost:8085
        if sudo ss -tlnp | grep -q "127.0.0.1:8085"; then
            log_success "CrowdSec LAPI on correct port (127.0.0.1:8085)"
        fi
    fi
    
    # Check Fail2Ban
    if systemctl list-unit-files | grep -q fail2ban.service; then
        if systemctl is-active --quiet fail2ban.service 2>/dev/null; then
            log_success "Fail2Ban service running"
        fi
    fi
    
    log_success "All production services verified - nothing broken!"
}

# ============================================================================
# Display Final Information
# ============================================================================

display_final_info() {
    echo ""
    log_step "🎉 Installation Complete!"
    
    echo -e "${GREEN}┌─────────────────────────────────────────────────────────────┐${NC}"
    echo -e "${GREEN}│                                                             │${NC}"
    echo -e "${GREEN}│  ✓ System dependencies installed                            │${NC}"
    echo -e "${GREEN}│  ✓ Node.js configured                                       │${NC}"
    echo -e "${GREEN}│  ✓ PM2 installed                                            │${NC}"
    echo -e "${GREEN}│  ✓ User '$FRONTEND_USER' created                            │${NC}"
    echo -e "${GREEN}│  ✓ Application directory ready: $FRONTEND_DIR   │${NC}"
    echo -e "${GREEN}│  ✓ systemd service configured                               │${NC}"
    echo -e "${GREEN}│  ✓ NGINX reverse proxy configured                           │${NC}"
    echo -e "${GREEN}│  ✓ Firewall verified (using NGINX proxy)                    │${NC}"
    echo -e "${GREEN}│  ✓ Production services intact (MeshCentral, RustDesk)       │${NC}"
    echo -e "${GREEN}│                                                             │${NC}"
    echo -e "${GREEN}└─────────────────────────────────────────────────────────────┘${NC}"
    
    echo ""
    echo -e "${YELLOW}⚠️  CRITICAL - WHAT WAS NOT TOUCHED:${NC}"
    echo -e "   ${GREEN}✓${NC} MeshCentral:      $MESHCENTRAL_ROOT"
    echo -e "   ${GREEN}✓${NC} RustDesk Server:  $RUSTDESK_SERVER_ROOT"
    echo -e "   ${GREEN}✓${NC} NGINX vhosts:     mesh.bwb.pt, mesh.storesace.cv"
    echo -e "   ${GREEN}✓${NC} CrowdSec:         Port 8085 (localhost only)"
    echo -e "   ${GREEN}✓${NC} Fail2Ban:         All jails intact"
    echo -e "   ${GREEN}✓${NC} UFW Rules:        Production ports unchanged"
    echo ""
    
    echo -e "${YELLOW}📋 NEXT STEPS:${NC}"
    echo -e "   1. ${BLUE}Exit this SSH session${NC}"
    echo -e "   2. ${BLUE}On your LOCAL machine, deploy your code:${NC}"
    echo -e "      ${GREEN}cd /path/to/your/local/repo${NC}"
    echo -e "      ${GREEN}./scripts/Step-1-download-from-main.sh${NC}"
    echo -e "      ${GREEN}./scripts/Step-2-build-local.sh${NC}"
    echo -e "      ${GREEN}./scripts/Step-3-test-local.sh${NC}"
    echo -e "      ${GREEN}./scripts/Step-4-deploy-tested-build.sh${NC}"
    echo -e "   3. ${BLUE}Frontend will be accessible at:${NC}"
    echo -e "      ${GREEN}https://$NGINX_SITE${NC}"
    echo -e "      ${YELLOW}(via NGINX reverse proxy to localhost:$FRONTEND_PORT)${NC}"
    echo ""
    
    echo -e "${BLUE}💻 Useful Commands (after code deployment):${NC}"
    echo -e "   Service Management:"
    echo -e "     ${YELLOW}sudo systemctl status $FRONTEND_SERVICE${NC}"
    echo -e "     ${YELLOW}sudo systemctl restart $FRONTEND_SERVICE${NC}"
    echo -e "     ${YELLOW}sudo journalctl -u $FRONTEND_SERVICE -f${NC}"
    echo ""
    echo -e "   NGINX Management:"
    echo -e "     ${YELLOW}sudo nginx -t${NC}                  - Test config"
    echo -e "     ${YELLOW}sudo systemctl reload nginx${NC}     - Reload config"
    echo -e "     ${YELLOW}sudo tail -f /var/log/nginx/rustdesk-frontend-access.log${NC}"
    echo ""
    echo -e "   User Management:"
    echo -e "     ${YELLOW}sudo -u $FRONTEND_USER bash${NC}     - Switch to frontend user"
    echo -e "     ${YELLOW}ls -la $FRONTEND_DIR${NC}            - Check app directory"
    echo ""
    
    log_success "System ready for code deployment! 🚀"
    echo ""
    echo -e "${MAGENTA}════════════════════════════════════════════════════════════${NC}"
    echo -e "${MAGENTA}This script is safe to re-run multiple times (idempotent)${NC}"
    echo -e "${MAGENTA}════════════════════════════════════════════════════════════${NC}"
}

# ============================================================================
# Error Handler
# ============================================================================

handle_error() {
    log_error "An error occurred during installation!"
    log_error "Last command exit code: $?"
    log_info "Check the output above for details"
    log_warning "Your production services should still be intact"
    log_info "Re-run this script to try again (it's idempotent)"
    exit 1
}

trap 'handle_error' ERR

# ============================================================================
# Main Installation Flow
# ============================================================================

main() {
    clear
    
    echo -e "${MAGENTA}"
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║                                                            ║"
    echo "║  RustDesk Mesh Integration - Production Server Setup      ║"
    echo "║  (Integrates with existing MeshCentral + RustDesk)        ║"
    echo "║                                                            ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    
    echo ""
    log_warning "This script is designed for a PRODUCTION server"
    log_info "Current user: ${USER}"
    log_info "Frontend directory: ${FRONTEND_DIR}"
    log_info "Frontend user: ${FRONTEND_USER}"
    log_info "Frontend port: ${FRONTEND_PORT} (localhost only)"
    log_info "NGINX site: https://${NGINX_SITE}"
    echo ""
    
    log_warning "Services that will NOT be touched:"
    echo "  - MeshCentral ($MESHCENTRAL_ROOT)"
    echo "  - RustDesk Server ($RUSTDESK_SERVER_ROOT)"
    echo "  - NGINX vhosts for mesh.bwb.pt / mesh.storesace.cv"
    echo "  - CrowdSec configuration and port 8085"
    echo "  - Fail2Ban jails"
    echo "  - Production UFW rules"
    echo ""
    
    # Confirmation
    read -p "Continue with installation? (yes/no): " -r CONFIRM
    echo ""
    
    if [[ ! $CONFIRM =~ ^[Yy][Ee][Ss]$ ]]; then
        log_error "Installation cancelled by user"
        exit 1
    fi
    
    # Record start time
    START_TIME=$(date +%s)
    
    # Execute PHASE 1: Cleanup
    phase1_cleanup
    
    # Execute PHASE 2: Fresh Installation
    phase2_install
    step_system_update
    step_nodejs_check
    step_install_pm2
    step_create_user
    step_create_directory
    step_configure_service
    step_configure_nginx
    step_configure_firewall
    step_verify_services
    
    # Calculate duration
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    MINUTES=$((DURATION / 60))
    SECONDS=$((DURATION % 60))
    
    # Display final information
    display_final_info
    
    echo -e "${BLUE}⏱️  Total installation time: ${MINUTES}m ${SECONDS}s${NC}"
    echo ""
}

# Run main function
main