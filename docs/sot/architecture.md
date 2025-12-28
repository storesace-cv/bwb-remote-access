# Arquitetura do Sistema

**Última Atualização:** 21 Dezembro 2025

## 📐 Visão Geral

Sistema de gestão de dispositivos Android para RustDesk, com arquitetura serverless usando Next.js App Router e Supabase. **Agora com suporte para Agent-Collaborator Model para multi-tenancy e controlo de permissões granular.**

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│  Next.js 16 App Router + React 18 + TypeScript              │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Login      │  │  Dashboard   │  │  Profile     │     │
│  │   page.tsx   │  │  page.tsx    │  │  page.tsx    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           API Routes (/api/login)                     │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────┬───────────────────────────────────────────┘
                   │
                   │ JWT Bearer Token
                   │
┌──────────────────▼───────────────────────────────────────────┐
│                      SUPABASE                                 │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                  Auth API                            │    │
│  │  - JWT generation                                    │    │
│  │  - Session management                                │    │
│  │  - Password reset                                    │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │            PostgreSQL Database                       │    │
│  │  - auth.users (built-in)                            │    │
│  │  - mesh_users (agent-collaborator hierarchy)        │    │
│  │  - mesh_groups (hierarchical groups)                │    │
│  │  - mesh_group_permissions (granular access)         │    │
│  │  - android_devices (group-based organization)       │    │
│  │  - device_registration_sessions                      │    │
│  │  - mesh_permission_audit (audit trail)              │    │
│  │                                                      │    │
│  │  RLS (Row Level Security) enabled                   │    │
│  │  Multi-tenant isolation enforced                    │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │            Edge Functions (Deno)                     │    │
│  │  Device Management:                                  │    │
│  │  - get-devices                                       │    │
│  │  - register-device                                   │    │
│  │  - check-registration-status                         │    │
│  │  - start-registration-session                        │    │
│  │  - generate-qr-image                                 │    │
│  │                                                      │    │
│  │  **NEW: Agent-Collaborator Management:**            │    │
│  │  - admin-create-collaborator                         │    │
│  │  - admin-list-collaborators                          │    │
│  │  - admin-grant-permission                            │    │
│  │  - admin-revoke-permission                           │    │
│  │  - admin-list-groups                                 │    │
│  │  - admin-create-group                                │    │
│  └─────────────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────────┘
                   │
                   │ RustDesk Protocol
                   │
┌──────────────────▼───────────────────────────────────────────┐
│                   RustDesk Server                             │
│              rustdesk.bwb.pt (HBBS/HBBR)                     │
│                                                               │
│  Gestão de conexões remotas Android                          │
└───────────────────────────────────────────────────────────────┘
```

## 🏗️ Componentes Principais

### 1. Frontend (Next.js)

**Tech Stack:**
- Next.js 16.0.6 (App Router)
- React 18.3.1
- TypeScript 5.6.3
- Tailwind CSS 3.4.15

**Estrutura de Pastas:**
```
src/app/
├── page.tsx                    # Login page
├── dashboard/
│   ├── page.tsx               # Main dashboard (agent/collaborator aware)
│   ├── profile/
│   │   └── page.tsx           # User profile
│   └── collaborators/         # **NEW: Collaborator management**
│       ├── page.tsx           # List collaborators
│       └── [id]/
│           └── page.tsx       # Manage single collaborator
├── auth/
│   ├── reset-password/
│   └── confirm-reset/
└── api/
    └── login/
        └── route.ts           # Auth API route

src/lib/
├── grouping.ts                # Device grouping logic (updated)
└── debugLogger.ts             # Structured logging

src/services/
└── authService.ts             # Supabase Auth client

src/integrations/
└── supabase/
    ├── client.ts              # Supabase client singleton
    ├── types.ts               # Database types
    └── database.types.ts      # Auto-generated types
```

**Responsabilidades:**
- **UI/UX**: Interface de utilizador responsiva com role-aware display
- **State Management**: React hooks (useState, useEffect, useCallback)
- **Client-Side Routing**: Next.js App Router
- **API Communication**: Fetch API para Edge Functions
- **JWT Storage**: localStorage (chave: `rustdesk_jwt`)
- **Permission-Aware UI**: Different views for agents vs collaborators

### 2. Agent-Collaborator Model (CORE ARCHITECTURE)

**Source of Truth:** `docs/sot/rustdesk-agent-collaborator-model.md`

**Princípios Fundamentais:**

1. **Single User Type, Multiple Roles**
   - Agents e collaborators são tecnicamente idênticos (mesma tabela)
   - Diferenciação é lógica, não estrutural
   - Campo `user_type` determina comportamento

2. **Strict Tenant Isolation**
   - Agents nunca vêem users/devices de outros agents
   - Collaborators nunca vêem outros collaborators (exceto via permissions)
   - Enforced via RLS, não via UI

3. **Agent Supremacy**
   - Agents vêem/gerem tudo no seu tenant
   - Agents podem revogar qualquer permissão
   - Agents podem ver grupos criados por collaborators

4. **Group-Based Permissions**
   - Permissões atribuídas a grupos, não a devices individuais
   - Devices herdam visibilidade do grupo
   - Permissões são revocáveis sem perda de dados

5. **Reversible Permissions**
   - Revogação não deleta dados
   - Audit trail completo preservado
   - Historical auditability

**Hierarquia Típica:**
```
Agent: suporte@bwb.pt
  ├─ Collaborator: tecnico1@example.com
  │   └─ Permissions: [Group A (view), Group B (manage)]
  ├─ Collaborator: tecnico2@example.com
  │   └─ Permissions: [Group B (view)]
  └─ Collaborator: gestor@example.com
      └─ Permissions: [All groups (view)]
```

### 3. Database Schema (Agent-Collaborator Extensions)

**New Tables:**

1. **mesh_groups**
   - Hierarchical group structure
   - Support for nested subgroups
   - Computed `path` field for display
   - Soft delete enabled

2. **mesh_group_permissions**
   - Join table: collaborator ↔ group
   - Permission types: view, manage
   - Soft revoke (preserves audit trail)
   - Automatic audit logging

3. **mesh_permission_audit**
   - Immutable log of all permission changes
   - Triggered automatically
   - Used for compliance and security analysis

**Extended Tables:**

1. **mesh_users**
   - Added: `user_type` (agent/collaborator)
   - Added: `parent_agent_id` (hierarchy)
   - Added: `agent_id` (denormalized for performance)

2. **android_devices**
   - Added: `agent_id` (tenant isolation)
   - Added: `group_id` (group assignment)

### 4. Row Level Security (RLS) - Multi-Tenant

**Agents:**
```sql
-- Agents see everything in their tenant
CREATE POLICY "agents_view_tenant_devices"
ON android_devices FOR SELECT
USING (
  agent_id = (SELECT agent_id FROM mesh_users WHERE auth_user_id = auth.uid() AND user_type = 'agent')
);
```

**Collaborators:**
```sql
-- Collaborators see only permitted devices
CREATE POLICY "collaborators_view_permitted_devices"
ON android_devices FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM mesh_users u
    WHERE u.auth_user_id = auth.uid()
      AND u.user_type = 'collaborator'
      AND (
        android_devices.owner = u.id
        OR android_devices.group_id IN (
          SELECT group_id FROM get_visible_groups(u.id)
        )
      )
  )
);
```

**Key RLS Functions:**
- `can_view_group(user_id, group_id)` → boolean
- `get_visible_groups(user_id)` → table of group_ids

### 5. Edge Functions (Extended)

**Device Management (Existing):**
- `get-devices`: Lista dispositivos (now permission-aware)
- `register-device`: Regista device (now group-aware)
- `check-registration-status`: Status checking
- `start-registration-session`: Session creation
- `generate-qr-image`: QR generation

**NEW: Agent-Collaborator Management:**
- `admin-create-collaborator`: Create new collaborator under agent
- `admin-list-collaborators`: List all collaborators for agent
- `admin-grant-permission`: Grant group permission to collaborator
- `admin-revoke-permission`: Revoke group permission
- `admin-list-groups`: List all groups (filtered by role)
- `admin-create-group`: Create new group

**Permission Model:**
- Only agents can call `admin-*` functions
- Service role key used for privileged operations
- JWT validation enforces role-based access

### 6. Synchronization Logic (MeshCentral ↔ Supabase)

**Hierarchy-Aware Sync:**

```bash
# scripts/sync-meshcentral-to-supabase.sh (updated)
# Now respects agent-collaborator hierarchy
# - Agents are synced with user_type='agent'
# - Collaborators must be manually created (not synced from MeshCentral)
# - Devices inherit agent_id from owner
```

**Key Changes:**
- MeshCentral users become agents by default
- Collaborators are Supabase-only concept
- Device sync populates `agent_id` automatically
- Group assignments preserved during sync

## 🔄 Fluxos Principais (Updated for Agent-Collaborator)

### Fluxo 1: Agent Creates Collaborator

```
1. Agent logs in (user_type=agent)
   ↓
2. Agent navigates to "Manage Collaborators"
   ↓
3. Agent clicks "Create Collaborator"
   ↓
4. Frontend → POST /functions/v1/admin-create-collaborator
   {
     email: "tecnico@example.com",
     mesh_username: "tecnico",
     display_name: "Técnico João"
   }
   ↓
5. Edge Function:
   - Validates caller is agent (JWT + user_type check)
   - Creates Supabase Auth user
   - Creates mesh_users entry with user_type='collaborator'
   - Sets parent_agent_id = caller.id
   ↓
6. Returns collaborator details
   ↓
7. Agent can now grant permissions
```

### Fluxo 2: Agent Grants Group Permission

```
1. Agent views collaborator details
   ↓
2. Agent selects group(s) to grant access
   ↓
3. Frontend → POST /functions/v1/admin-grant-permission
   {
     collaborator_id: "uuid",
     group_id: "uuid",
     permission: "view"
   }
   ↓
4. Edge Function:
   - Validates caller is agent
   - Validates collaborator belongs to agent
   - Validates group belongs to agent
   - Creates mesh_group_permissions entry
   ↓
5. Trigger logs to mesh_permission_audit
   ↓
6. Collaborator immediately sees devices in that group
```

### Fluxo 3: Collaborator Views Devices

```
1. Collaborator logs in (user_type=collaborator)
   ↓
2. Dashboard loads
   ↓
3. GET /functions/v1/get-devices
   ↓
4. Edge Function extracts user_id from JWT
   ↓
5. RLS policy filters devices:
   - Devices owned by collaborator
   - Devices in permitted groups (via get_visible_groups)
   ↓
6. Returns filtered device list
   ↓
7. Dashboard renders only permitted devices
```

### Fluxo 4: Agent Revokes Permission

```
1. Agent views collaborator permissions
   ↓
2. Agent clicks "Revoke" on specific group
   ↓
3. Frontend → POST /functions/v1/admin-revoke-permission
   {
     collaborator_id: "uuid",
     group_id: "uuid"
   }
   ↓
4. Edge Function:
   - Validates caller is agent
   - Updates mesh_group_permissions SET revoked_at=NOW()
   ↓
5. Trigger logs to mesh_permission_audit
   ↓
6. Collaborator immediately loses access to group devices
   (RLS enforced on next query)
```

## 🔐 Segurança (Multi-Tenant)

### Tenant Isolation

**Agents:**
- `agent_id` é self-referencing (agent.agent_id = agent.id)
- RLS filtra por `agent_id = auth.uid().agent_id`
- Agents NUNCA vêem dados de outros agents

**Collaborators:**
- `agent_id` é parent's id (collaborator.agent_id = parent_agent.id)
- RLS filtra por `agent_id` E permissions
- Collaborators NUNCA vêem dados de outros collaborators
- Collaborators só vêem parent agent info (not other agents)

### Permission Enforcement

**Server-Side Only:**
- All permission checks in RLS policies
- UI hiding is cosmetic only
- No client-side filtering for security

**Validation Chain:**
```
1. JWT contains auth.uid()
2. mesh_users maps auth.uid() → user_id, user_type, agent_id
3. RLS policy uses agent_id for tenant filter
4. RLS policy uses user_type for role-based rules
5. For collaborators: additional check via get_visible_groups()
```

### Audit Trail

**Immutable Log:**
- Every permission grant/revoke logged
- `mesh_permission_audit` never deleted
- Includes: who, what, when, why
- Used for compliance and forensics

## 📊 Decisões de Arquitetura (Agent-Collaborator)

### Por que Group-Based Permissions?

**Vantagens:**
- ✅ Escalável: N devices → M groups vs N*M direct permissions
- ✅ Intuitivo: "Give access to Pizza Hut / Loja Centro"
- ✅ Fácil gestão: Grant once, devices inherit
- ✅ Revocação simples: Revoke group = all devices

**Trade-offs:**
- ❌ Requer pre-organização em grupos
- ❌ Edge case: device sem grupo (handled by "owned" rule)

### Por que Single User Table?

**Vantagens:**
- ✅ Simples: Same auth flow for agents and collaborators
- ✅ Flexível: User pode "upgrade" to agent (future)
- ✅ DRY: No duplicate user management code

**Trade-offs:**
- ❌ Mais condições em RLS policies
- ❌ Mais validação em triggers

### Por que Soft Revoke?

**Vantagens:**
- ✅ Audit trail completo
- ✅ Pode re-grant sem perder histórico
- ✅ Análise de patterns (quem revogou mais, quando, etc.)

**Trade-offs:**
- ❌ Tabela cresce indefinidamente (mitigado por indexes)
- ❌ Queries precisam filtrar `revoked_at IS NULL`

### Por que Denormalized agent_id?

**Vantagens:**
- ✅ Performance: RLS não precisa de joins recursivos
- ✅ Simplicidade: Direct filter `WHERE agent_id = X`

**Trade-offs:**
- ❌ Redundância: Same value em multiple tables
- ❌ Consistency: Triggers mantêm sincronizado

## 🎯 Limitações Conhecidas (Agent-Collaborator)

### Performance
- Group permission lookups podem ser lentos com >1000 groups
- Solução: Materializar `get_visible_groups` em cache table

### Escalabilidade
- Audit log cresce indefinidamente
- Solução: Archive old entries after 2 years

### Herança de Permissões
- Subgroups NÃO herdam permissions automaticamente
- Colaborador precisa de permissão explícita para cada nível
- Solução: UI pode fazer "grant com recursão" (grant parent + all children)

## 🔮 Roadmap Técnico (Agent-Collaborator)

**Fase 2 (Em desenvolvimento):**
- [x] Database schema for agent-collaborator model
- [x] RLS policies for multi-tenant isolation
- [ ] Edge Functions for collaborator management
- [ ] Frontend UI for agent dashboard
- [ ] Permission management UI

**Fase 3 (Próxima):**
- [ ] Permission inheritance (optional recursive grant)
- [ ] Collaborator self-service (create own subgroups)
- [ ] Audit log viewer UI
- [ ] Role-based permissions (beyond view/manage)

**Fase 4 (Futuro):**
- [ ] Cross-tenant collaboration (carefully scoped)
- [ ] API rate limiting per tenant
- [ ] Advanced analytics per agent
- [ ] White-label support

---

**Próxima Revisão:** Quando houver mudanças arquiteturais significativas