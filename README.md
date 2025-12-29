# RustDesk Mesh Integration

**Multi-tenant device management system for RustDesk with hierarchical access control**

## 🌟 Overview

Enterprise-grade solution for managing Android devices remotely via RustDesk, featuring:

- **Agent-Collaborator Model**: Multi-tenant architecture with hierarchical user management
- **Group-Based Permissions**: Granular access control for device organization
- **MeshCentral Integration**: Seamless synchronization with MeshCentral device registry
- **QR Code Provisioning**: Fast device onboarding with automated configuration
- **Audit Trail**: Complete permission history for compliance and security
- **Next.js + Supabase**: Modern serverless architecture with PostgreSQL + Edge Functions

## 🚀 Key Features

### 🔐 Multi-Tenant Architecture

**Agents** (top-level users):
- Create and manage collaborators
- Full visibility into their tenant's devices and groups
- Grant and revoke permissions to groups
- View comprehensive audit trail

**Collaborators** (restricted users):
- Access only permitted groups and devices
- Create own subgroups within granted permissions
- Cannot create other users
- Isolated from other collaborators

### 📊 Hierarchical Group Management

Organize devices into nested group structures:

```
Pizza Hut
  ├─ Loja Centro
  │   ├─ Cozinha
  │   └─ Salão
  └─ Loja Norte
      ├─ Escritório
      └─ Armazém
```

### 🎯 Permission System

- **Group-based permissions** (not per-device)
- **Two permission levels**: `view` (read-only) and `manage` (full control)
- **Reversible grants**: Revoke permissions without data loss
- **Automatic audit logging**: Every permission change tracked

## 📦 Tech Stack

- **Frontend**: Next.js 16 (App Router), React 18, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Edge Functions)
- **Authentication**: Auth0 (Single Sign-On)
- **Device Management**: RustDesk + MeshCentral integration
- **Android Provisioning**: Custom Android app with QR scanning

## ⚠️ Architecture Rules (Source of Truth)

**Before making any changes to authentication or middleware, read:**

- 📋 [Global SoT Index](docs/SoT/INDEX.md) — Registry of all canonical rules
- 🔐 [Auth & Middleware Architecture](docs/SoT/AUTH_AND_MIDDLEWARE_ARCHITECTURE.md) — Non-negotiable auth rules

> **SoT documents define hard architectural constraints.** Violations are treated as defects regardless of test results.

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│   Next.js Frontend (User Dashboard)    │
│   - Agent/Collaborator role awareness  │
│   - Permission-filtered device lists    │
└─────────────────┬───────────────────────┘
                  │ JWT Bearer Token
                  ▼
┌─────────────────────────────────────────┐
│   Supabase (PostgreSQL + Edge Funcs)   │
│   - Multi-tenant RLS policies          │
│   - Agent-collaborator hierarchy        │
│   - Group-based permissions             │
│   - Audit trail                         │
└─────────────────┬───────────────────────┘
                  │ Device Sync
                  ▼
┌─────────────────────────────────────────┐
│   MeshCentral (Device Registry)         │
│   - Android device inventory            │
│   - User synchronization                │
└─────────────────────────────────────────┘
```

## 🎯 Quick Start

### Prerequisites

- Node.js 18+
- Supabase account and CLI
- MeshCentral server (optional for full integration)

### 1. Clone Repository

```bash
git clone https://github.com/your-org/rustdesk-mesh-integration.git
cd rustdesk-mesh-integration
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 4. Deploy Database Schema

```bash
# Using Supabase CLI
supabase db push

# Or manually
psql $DATABASE_URL -f supabase/migrations/20251221005500_agent_collaborator_model.sql
```

### 5. Deploy Edge Functions

```bash
# Deploy all functions
npm run deploy:functions

# Or individually
supabase functions deploy admin-create-collaborator
supabase functions deploy admin-grant-permission
# ... etc
```

### 6. Run Development Server

```bash
npm run dev
```

Visit `http://localhost:3000`

## 📖 Documentation

### Core Documentation

- **[Source of Truth: Agent-Collaborator Model](docs/sot/rustdesk-agent-collaborator-model.md)** - Authoritative specification
- **[Architecture](docs/sot/architecture.md)** - System design and components
- **[Data Models](docs/sot/data-models.md)** - Database schema and relationships
- **[Deployment Guide](docs/sot/AGENT_COLLABORATOR_DEPLOYMENT.md)** - Production deployment steps

### Integration Guides

- **[MeshCentral Integration](docs/sot/meshcentral-integration.md)** - Device synchronization
- **[Supabase Integration](docs/sot/supabase-integration.md)** - Database and auth setup
- **[Android Provisioner](docs/sot/android-provisioner-contract.md)** - QR code provisioning

### Operations

- **[Operational Playbook](docs/sot/operational-playbook.md)** - Day-to-day operations
- **[Security & Permissions](docs/sot/security-and-permissions.md)** - Access control details
- **[Troubleshooting](docs/TROUBLESHOOTING.md)** - Common issues and solutions

## 🔑 Usage Examples

### Create a Collaborator (Agent Only)

```typescript
const response = await fetch('/functions/v1/admin-create-collaborator', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${agentJWT}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'tecnico@example.com',
    mesh_username: 'tecnico1',
    display_name: 'Técnico João'
  })
});

const { collaborator, temporary_password } = await response.json();
```

### Grant Group Permission

```typescript
await fetch('/functions/v1/admin-grant-permission', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${agentJWT}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    collaborator_id: 'collab-uuid',
    group_id: 'group-uuid',
    permission: 'view'
  })
});
```

### List Visible Devices (Works for Both Agents and Collaborators)

```typescript
const response = await fetch('/functions/v1/get-devices', {
  headers: {
    'Authorization': `Bearer ${jwt}`
  }
});

const { devices } = await response.json();
// Automatically filtered by RLS based on role and permissions
```

## 🧪 Testing

### Run Unit Tests

```bash
npm test
```

### Test RLS Policies

```bash
npm run test:rls
```

### Integration Tests

```bash
npm run test:integration
```

## 📝 Technical Notes

### Android Provisioner - Recent Improvements (2025-12-24)

**Type-Safety & Null-Handling:**
- `ConfigManager.parseConfigBundle()` uses `json.opt("field") as? String` for safe nullable parsing
- Eliminates compile-time type mismatch warnings
- Handles missing/null JSON fields gracefully

**Download Verification:**
- `getFilePathFromDownloadId(downloadId)` uses specific query filtering
- Previously: queried ALL downloads (potential ambiguity)
- Now: `DownloadManager.Query().setFilterById(downloadId)` - returns correct download path
- Bug fix: eliminates latent issue with multiple concurrent downloads

See [android-kotlin-generation-notes.md](docs/sot/android-kotlin-generation-notes.md) for details.

## 🚢 Deployment

### Production Deployment to Vercel

```bash
vercel --prod
```

### Android APK Build and Deploy

**Build and deploy Android provisioning app to production:**

```bash
# Build release APK and deploy to droplet
./scripts/build-and-deploy-android.sh

# Build debug APK
./scripts/build-and-deploy-android.sh debug
```

**macOS Apple Silicon (M1/M2/M3) Compatibility:**

The script automatically handles macOS M1 compatibility issues:

1. **Forces Java 17** - Prevents KSP/Kotlin crash with newer Java versions (25.x)
2. **Uses `bash ./gradlew`** - Doesn't depend on gradlew being executable
3. **Non-executable gradlew** - Removes execution permissions after build

**APK Output:**
- Local: `provisionerApp/build/outputs/apk/release/provisionerApp-release.apk`
- Remote: `https://rustdesk.bwb.pt/apk/bwb-android-provisioner/latest.apk`
- SHA256: Calculated automatically and verified on server

**Requirements:**
- Java 17 installed (via Homebrew: `brew install openjdk@17`)
- Android SDK configured
- SSH access to droplet (key: `~/.ssh/rustdeskweb-digitalocean`)

### Database Migrations

```bash
# Preview migration
supabase db diff

# Apply to production
supabase db push --db-url $PROD_DATABASE_URL
```

### Edge Functions to Production

```bash
supabase functions deploy --project-ref <prod-project-ref>
```

See [Deployment Guide](docs/sot/AGENT_COLLABORATOR_DEPLOYMENT.md) for detailed instructions.

## 🔐 Security

- **Row Level Security (RLS)**: All database access enforced at PostgreSQL level
- **JWT Authentication**: Supabase Auth with secure token management
- **Tenant Isolation**: Agent-based multi-tenancy prevents cross-tenant access
- **Audit Trail**: All permission changes logged immutably
- **No Client-Side Filtering**: Security enforced server-side only

## 📊 Project Status

**Current Version:** 1.0.0 (Agent-Collaborator Model)

**Features Complete:**
- ✅ Agent-Collaborator hierarchy
- ✅ Group-based permissions
- ✅ Multi-tenant RLS policies
- ✅ Audit trail
- ✅ Edge Functions for admin operations
- ✅ Database schema and migrations

**In Progress:**
- 🚧 Frontend UI for collaborator management
- 🚧 Permission inheritance for subgroups
- 🚧 Advanced analytics dashboard

**Planned:**
- 📋 White-label support
- 📋 API rate limiting per tenant
- 📋 Cross-tenant collaboration (scoped)

## 🤝 Contributing

1. Read the [Source of Truth documents](docs/sot/) first
2. Follow the [Architecture guidelines](docs/sot/architecture.md)
3. Ensure all tests pass
4. Update documentation as needed

## 📄 License

[Add your license here]

## 🆘 Support

- **Documentation**: [docs/](docs/)
- **Issues**: [GitHub Issues](https://github.com/your-org/rustdesk-mesh-integration/issues)
- **Email**: support@example.com

## 🙏 Acknowledgments

- RustDesk team for the remote desktop protocol
- MeshCentral for device management infrastructure
- Supabase for the backend platform

---

**Built with ❤️ for enterprise device management**