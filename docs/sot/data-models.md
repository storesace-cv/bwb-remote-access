# Modelos de Dados

**Última Atualização:** 22 Dezembro 2025

## 📊 Esquema da Base de Dados

### Diagrama ER

```
┌──────────────────┐
│   auth.users     │ (Supabase built-in)
│ ────────────────│
│ id (UUID)        │◄─────────┐
│ email            │          │
│ created_at       │          │
└──────────────────┘          │
                              │
                              │ auth_user_id (FK)
                              │
┌──────────────────┐          │
│   mesh_users     │          │
│ ────────────────│          │
│ id (UUID)        │◄─┐       │
│ auth_user_id     ├──┘       │
│ mesh_username    │          │
│ display_name     │          │
│ user_type        │◄─┐       │
│ parent_agent_id  ├──┘       │
│ agent_id         │          │
└──────────────────┘          │
        ▲         ▲           │
        │         │           │
        │         └───────────┼─────────┐
        │ owner (FK)          │         │ agent_id (FK)
        │                     │         │
┌────────┴──────────┐         │    ┌────┴─────────────┐
│ android_devices   │         │    │  mesh_groups     │
│ ──────────────────│         │    │ ─────────────────│
│ id (UUID)         │         │    │ id (UUID)        │
│ device_id (TEXT)  │         │    │ agent_id (UUID)  │
│ owner (UUID)      │         │    │ owner_user_id    │
│ mesh_username     │         │    │ parent_group_id  │
│ friendly_name     │         │    │ name             │
│ notes             │         │    │ path             │
│ group_id (UUID)   ├─────────┼────┤ level            │
│ agent_id (UUID)   │         │    └──────────────────┘
│ last_seen_at      │         │              ▲
│ deleted_at        │         │              │ group_id (FK)
└───────────────────┘         │              │
                              │    ┌─────────┴────────────────┐
┌─────────────────────────┐   │    │ mesh_group_permissions   │
│ device_registration_    │   │    │ ─────────────────────────│
│ sessions                │   │    │ id (UUID)                │
│ ────────────────────────│   │    │ agent_id (UUID)          │
│ id (UUID)               │   │    │ collaborator_id (UUID)   │
│ user_id (UUID)          ├───┘    │ group_id (UUID)          │
│ clicked_at              │        │ permission (TEXT)        │
│ expires_at              │        │ granted_at               │
│ status                  │        │ revoked_at               │
│ matched_device_id       │        └──────────────────────────┘
│ matched_at              │
│ ip_address              │        ┌──────────────────────────┐
│ user_agent              │        │ mesh_permission_audit    │
│ geolocation (JSONB)     │        │ ─────────────────────────│
└─────────────────────────┘        │ id (UUID)                │
                                   │ agent_id (UUID)          │
                                   │ collaborator_id (UUID)   │
                                   │ group_id (UUID)          │
                                   │ action (TEXT)            │
                                   │ performed_by (UUID)      │
                                   │ performed_at             │
                                   └──────────────────────────┘
```

## 📋 Tabelas Detalhadas

### 1. auth.users (Built-in Supabase)

**Propósito:** Gestão de utilizadores e autenticação.

**Schema:**
```sql
CREATE TABLE auth.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  encrypted_password TEXT NOT NULL,
  email_confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_sign_in_at TIMESTAMPTZ,
  -- ... outros campos do Supabase Auth
);
```

**Notas:**
- Gerida automaticamente pelo Supabase Auth
- Não modificar diretamente
- Usar Supabase Dashboard para gestão de users

**Utilizadores Registados:**
1. suporte@bwb.pt
2. jorge.peixinho@bwb.pt
3. datalink@datalink.pt
4. assistencia@zsa-softwares.com

---

### 2. mesh_users (AGENT-COLLABORATOR MODEL)

**Propósito:** Mapping entre auth.users e usernames do MeshCentral, agora multi‑domínio com hierarquia Agent-Collaborator.

**Schema (conceitual):**
```sql
CREATE TABLE mesh_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Ligação ao Supabase Auth (um‑para‑um)
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Identidade MeshCentral (multi‑domínio)
  mesh_username    TEXT NOT NULL,   -- username dentro do domínio
  domain_key       TEXT NOT NULL,   -- chave interna do domínio
  domain_dns       TEXT,            -- DNS do domínio
  domain           TEXT NOT NULL,   -- valor exacto do campo "domain" em MeshCentral
  external_user_id TEXT NOT NULL,   -- identificador canónico

  -- Metadados do utilizador
  email        TEXT,
  name         TEXT,
  display_name TEXT,
  disabled     BOOLEAN NOT NULL DEFAULT false,

  -- Privilégios MeshCentral
  siteadmin    BIGINT  NOT NULL DEFAULT 0,
  domainadmin  BIGINT  NOT NULL DEFAULT 0,
  role         TEXT    NOT NULL DEFAULT 'USER',

  source       TEXT    NOT NULL DEFAULT 'meshcentral',

  -- **AGENT-COLLABORATOR MODEL**
  user_type        TEXT NOT NULL DEFAULT 'agent' 
    CHECK (user_type IN ('siteadmin', 'minisiteadmin', 'agent', 'colaborador', 'inactivo', 'candidato')),
  parent_agent_id  UUID REFERENCES mesh_users(id) ON DELETE CASCADE,
  agent_id         UUID NOT NULL, -- Denormalized for performance

  created_at   TIMESTAMPTZ DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ,

  CONSTRAINT mesh_users_external_user_id_key UNIQUE (external_user_id),
  CONSTRAINT mesh_users_domain_key_mesh_username_key UNIQUE (domain_key, mesh_username),
  CONSTRAINT unique_auth_user UNIQUE(auth_user_id),
  CONSTRAINT check_collaborator_has_parent CHECK (
    (user_type = 'agent' AND parent_agent_id IS NULL) OR
    (user_type != 'agent' AND (parent_agent_id IS NOT NULL OR user_type IN ('candidato', 'siteadmin', 'minisiteadmin')))
  )
);
```

**🔑 IMPORTANTE: Conceito de Domínios no MeshCentral**

O MeshCentral suporta múltiplos domínios virtuais. No nosso sistema:

| Valor no MeshCentral | Valor Normalizado | Significado                           |
|----------------------|-------------------|---------------------------------------|
| '' (string vazia)    | 'mesh'            | Domínio DEFAULT/principal             |
| 'domain1'            | 'domain1'         | Domínio personalizado                 |
| 'zonetech'           | 'zonetech'        | Domínio personalizado                 |
| 'zsangola'           | 'zsangola'        | Domínio personalizado                 |

**Regras de Normalização:**
- ✅ Sync scripts convertem automaticamente `domain = ''` → `domain = 'mesh'`
- ✅ Frontend trata `'mesh'` como domínio válido e isolado
- ✅ Todos os users sem domínio explícito pertencem ao domínio `'mesh'`

**Exemplo:**
```sql
-- Utilizador no domínio default do MeshCentral:
domain = 'mesh'
domain_key = 'mesh'
mesh_username = 'jorge.peixinho'
external_user_id = 'user//jorge.peixinho'

-- Utilizador em domínio personalizado:
domain = 'zonetech'
domain_key = 'zonetech'  
mesh_username = 'datalink'
external_user_id = 'user/zonetech/datalink'
```

**Campos Adicionais (Agent-Collaborator Model):**

| Campo            | Tipo    | Nullable | Descrição                                                                                     |
|------------------|---------|----------|-----------------------------------------------------------------------------------------------|
| user_type        | TEXT    | NOT NULL | Tipo de utilizador na hierarquia (ver abaixo)                                                |
| parent_agent_id  | UUID    | YES      | Para colaboradores: referência ao agente pai. NULL para agentes/siteadmins/minisiteadmins.   |
| agent_id         | UUID    | NOT NULL | Desnormalizado para performance. Self-reference para agents, parent_agent_id para collaborators |

**user_type - Hierarquia Normalizada (Status na App):**

**NOVA HIERARQUIA (Atualizada em 22 Dezembro 2025):**

```
siteadmin (topo absoluto - super-admin global)
    ↓
minisiteadmin (super-admin de domínio)
    ↓
agent (gestor de tenant)
    ↓
colaborador (ativo)
    ↓
inactivo (desativado)
    ↓
candidato (sem conta - base)
```

**Descrição de Cada Tipo:**

1. **siteadmin** - Super-admin global (topo absoluto)
   - Vê e gere **TODOS OS DOMÍNIOS** do sistema
   - Pode criar/editar/eliminar qualquer utilizador
   - Acesso irrestrito a todos os recursos
   - Não tem parent_agent_id
   - agent_id = id (self-referencing)

2. **minisiteadmin** - Super-admin de domínio (NOVO em 22 Dez 2025)
   - Vê e gere **TODO O SEU DOMÍNIO** (equivalente a siteadmin mas restrito ao domínio)
   - Pode criar/editar/eliminar qualquer utilizador do seu domínio
   - Acesso irrestrito aos recursos do seu domínio
   - Não tem parent_agent_id
   - agent_id = id (self-referencing)
   - **Diferença vs siteadmin**: Isolado ao seu domínio via RLS/Edge Functions

3. **agent** - Gestor de tenant
   - Pode criar colaboradores no seu tenant
   - Vê e gere tudo no seu domínio/tenant
   - parent_agent_id = NULL
   - agent_id = id (self-referencing)

4. **colaborador** - Colaborador ativo
   - Criado por um agent ou minisiteadmin
   - Tem conta Supabase ativa
   - Vê apenas grupos/devices com permissão explícita
   - parent_agent_id = id do agent/minisiteadmin pai
   - agent_id = parent_agent_id

5. **inactivo** - Colaborador desativado
   - Tinha conta Supabase mas foi desativado
   - Não tem acesso ao sistema
   - Preserva histórico e audit trail

6. **candidato** - Candidato sem conta (default)
   - Existe no MeshCentral
   - Não tem conta Supabase (auth_user_id = NULL)
   - Pode ser promovido a "colaborador" por um agent/minisiteadmin

**role - Permissões MeshCentral (separado de user_type):**
- **SUPERADMIN** - Controlo total do MeshCentral
- **LIMITED_ADMIN** - Admin com restrições
- **USER** - Utilizador regular do MeshCentral

**Separação de Conceitos:**
- `role` → Permissões no MeshCentral (gestão de devices remotos)
- `user_type` → Status/permissões na nossa app (hierarquia com siteadmin→minisiteadmin→agent→collaborator)

**Hierarquia Exemplo:**
```
Siteadmin (admin@bwb.pt) [user_type=siteadmin] → Vê TODOS OS DOMÍNIOS
  │
  ├─ Domain "mesh":
  │   ├─ Minisiteadmin 1 (mesh_admin@example.com) [user_type=minisiteadmin, domain=mesh]
  │   │   └─ Collaborator 1 (collab1@example.com) [user_type=colaborador]
  │   └─ Agent 1 (agent1@example.com) [user_type=agent, domain=mesh]
  │       └─ Collaborator 2 (collab2@example.com) [user_type=colaborador]
  │
  └─ Domain "zonetech":
      ├─ Minisiteadmin 2 (zonetech_admin@example.com) [user_type=minisiteadmin, domain=zonetech]
      │   └─ Collaborator 3 (collab3@example.com) [user_type=colaborador]
      └─ Agent 2 (agent2@example.com) [user_type=agent, domain=zonetech]
          └─ Collaborator 4 (collab4@example.com) [user_type=colaborador]

Candidatos (sem agent/minisiteadmin):
  ├─ User MeshCentral 1 [user_type=candidato, auth_user_id=NULL]
  └─ User MeshCentral 2 [user_type=candidato, auth_user_id=NULL]
```

---

### 3. mesh_groups (NEW - AGENT-COLLABORATOR MODEL)

**Propósito:** Grupos hierárquicos para organização de dispositivos com controlo de permissões granular.

**Schema:**
```sql
CREATE TABLE mesh_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Ownership and hierarchy
  agent_id UUID NOT NULL REFERENCES mesh_users(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES mesh_users(id) ON DELETE CASCADE,
  parent_group_id UUID REFERENCES mesh_groups(id) ON DELETE CASCADE,
  
  -- Group metadata
  name TEXT NOT NULL,
  description TEXT,
  path TEXT NOT NULL, -- Computed: "Company / Department / Team"
  level INTEGER NOT NULL DEFAULT 0, -- 0=root, 1=sub, 2=sub-sub, etc.
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  
  -- Constraints
  CONSTRAINT unique_group_name_per_agent_parent 
    UNIQUE (agent_id, parent_group_id, name, deleted_at),
  CONSTRAINT check_owner_belongs_to_agent 
    CHECK (agent_id IS NOT NULL)
);
```

**Campos:**

| Campo            | Tipo         | Nullable | Descrição                                                          |
|------------------|-------------|----------|--------------------------------------------------------------------|
| id               | UUID        | NOT NULL | Primary key                                                        |
| agent_id         | UUID        | NOT NULL | O agent/minisiteadmin que possui este tenant de grupos             |
| owner_user_id    | UUID        | NOT NULL | O utilizador (agent/minisiteadmin/collaborator) que criou este grupo |
| parent_group_id  | UUID        | YES      | Grupo pai (NULL = root group)                                      |
| name             | TEXT        | NOT NULL | Nome do grupo (ex: "Escritório Central")                           |
| description      | TEXT        | YES      | Descrição opcional                                                 |
| path             | TEXT        | NOT NULL | Caminho completo computado (ex: "Empresa / Departamento / Equipa") |
| level            | INTEGER     | NOT NULL | Nível na hierarquia (0=root, 1=subgrupo, 2=sub-subgrupo)          |

**Exemplo de Estrutura:**
```
Pizza Hut (level=0, path="Pizza Hut")
  ├─ Loja Centro (level=1, path="Pizza Hut / Loja Centro")
  │   ├─ Cozinha (level=2, path="Pizza Hut / Loja Centro / Cozinha")
  │   └─ Salão (level=2, path="Pizza Hut / Loja Centro / Salão")
  └─ Loja Norte (level=1, path="Pizza Hut / Loja Norte")
```

**Visibilidade:**
- **Siteadmins**: vêem todos os grupos de todos os domínios
- **Minisiteadmins**: vêem todos os grupos do seu domínio
- **Agents**: vêem todos os grupos do seu tenant
- **Collaborators**: vêem apenas grupos que criaram OU grupos com permissão explícita

---

### 4. mesh_group_permissions (NEW - AGENT-COLLABORATOR MODEL)

**Propósito:** Sistema de permissões grupo-based para collaborators. Suporta grant/revoke com audit trail completo.

**Schema:**
```sql
CREATE TABLE mesh_group_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Core relationships
  agent_id UUID NOT NULL REFERENCES mesh_users(id) ON DELETE CASCADE,
  collaborator_id UUID NOT NULL REFERENCES mesh_users(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES mesh_groups(id) ON DELETE CASCADE,
  
  -- Permission type
  permission TEXT NOT NULL DEFAULT 'view' 
    CHECK (permission IN ('view', 'manage')),
  
  -- Audit trail
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by UUID REFERENCES mesh_users(id),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES mesh_users(id),
  
  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT unique_active_permission 
    UNIQUE (collaborator_id, group_id, revoked_at)
);
```

**Campos:**

| Campo           | Tipo         | Nullable | Descrição                                              |
|-----------------|-------------|----------|--------------------------------------------------------|
| id              | UUID        | NOT NULL | Primary key                                            |
| agent_id        | UUID        | NOT NULL | Agent/Minisiteadmin que gere esta permissão            |
| collaborator_id | UUID        | NOT NULL | Collaborator que recebe a permissão                    |
| group_id        | UUID        | NOT NULL | Grupo ao qual a permissão se aplica                    |
| permission      | TEXT        | NOT NULL | Tipo: `view` (visualizar) ou `manage` (gerir)          |
| granted_at      | TIMESTAMPTZ | NOT NULL | Quando foi concedida                                   |
| granted_by      | UUID        | YES      | Quem concedeu                                          |
| revoked_at      | TIMESTAMPTZ | YES      | Quando foi revogada (NULL = ativa)                     |
| revoked_by      | UUID        | YES      | Quem revogou                                           |
| notes           | TEXT        | YES      | Notas explicativas                                     |

**Tipos de Permissão:**
- **view**: Collaborator pode ver devices no grupo
- **manage**: Collaborator pode editar devices no grupo (futuro)

**Ciclo de Vida:**
```
1. Grant permission → granted_at = NOW(), revoked_at = NULL
2. Revoke permission → revoked_at = NOW()
3. Audit trail preserved forever (soft revoke)
```

**Invariantes (SoT):**
- Siteadmins e Minisiteadmins podem sempre ver/gerir tudo no seu escopo (não precisam de permissões)
- Agents podem sempre ver/gerir tudo no seu tenant (não precisam de permissões)
- Collaborators precisam de permissão explícita para cada grupo
- Revogação não deleta dados (auditável)
- Agent/Minisiteadmin pode revogar permissões sobre grupos criados pelo collaborator

---

### 5. android_devices (EXTENDED FOR AGENT-COLLABORATOR MODEL)

**Propósito:** Armazenar dispositivos Android registados no sistema. Agora com suporte para grupos e agents.

**Schema (campos novos destacados):**
```sql
CREATE TABLE android_devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id TEXT UNIQUE NOT NULL,
  owner UUID REFERENCES mesh_users(id) ON DELETE SET NULL,
  mesh_username TEXT,
  friendly_name TEXT,
  notes TEXT, -- Legacy: "Grupo | Subgrupo" (migrado para group_id)
  rustdesk_password TEXT,
  rustdesk_ip TEXT,
  
  -- **NEW: Agent-Collaborator Model**
  agent_id UUID REFERENCES mesh_users(id) ON DELETE SET NULL,
  group_id UUID REFERENCES mesh_groups(id) ON DELETE SET NULL,
  
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
```

**Campos Novos:**

| Campo    | Tipo | Nullable | Descrição                                                  |
|----------|------|----------|------------------------------------------------------------|
| agent_id | UUID | YES      | Agent/Minisiteadmin que possui este device (desnormalizado de owner) |
| group_id | UUID | YES      | Grupo ao qual o device pertence. NULL = sem grupo/órfão    |

**Visibilidade:**
- **Siteadmins**: vêem todos os devices de todos os domínios
- **Minisiteadmins**: vêem todos os devices do seu domínio
- **Agents**: vêem todos os devices do seu tenant (agent_id match)
- **Collaborators**: vêem apenas:
  - Devices que eles próprios possuem (owner match)
  - Devices em grupos com permissão ativa

**Migração do campo `notes`:**
- Devices existentes com `notes = "Grupo | Subgrupo"` são migrados para `mesh_groups`
- Função `migrate_notes_to_groups()` cria grupos automaticamente
- Campo `notes` mantido por compatibilidade, mas `group_id` é a fonte de verdade

---

### 6. mesh_permission_audit (NEW - AUDIT TRAIL)

**Propósito:** Log completo de todas as alterações de permissões para auditoria e compliance.

**Schema:**
```sql
CREATE TABLE mesh_permission_audit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES mesh_users(id),
  collaborator_id UUID NOT NULL REFERENCES mesh_users(id),
  group_id UUID NOT NULL REFERENCES mesh_groups(id),
  action TEXT NOT NULL CHECK (action IN ('grant', 'revoke')),
  permission TEXT NOT NULL,
  performed_by UUID REFERENCES mesh_users(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT,
  metadata JSONB
);
```

**Uso:**
- Trigger automático em `mesh_group_permissions` regista cada grant/revoke
- Immutable log (nunca deletado)
- Usado para compliance, debugging e análise de segurança

---

### 7. device_registration_sessions

**Propósito:** Sessões temporais de registro de dispositivos (duração: 5 minutos).

*Schema inalterado do sistema anterior - ver versão anterior da documentação.*

---

## 🔍 Queries Úteis (Agent-Collaborator Model)

### Ver Hierarquia Completa de um Agent/Minisiteadmin

```sql
SELECT 
  a.mesh_username AS agent,
  a.user_type AS agent_type,
  c.mesh_username AS collaborator,
  c.user_type,
  COUNT(DISTINCT g.id) AS groups_count,
  COUNT(DISTINCT d.id) AS devices_count
FROM mesh_users a
LEFT JOIN mesh_users c ON c.parent_agent_id = a.id
LEFT JOIN mesh_groups g ON g.agent_id = a.id
LEFT JOIN android_devices d ON d.agent_id = a.id
WHERE a.user_type IN ('agent', 'minisiteadmin', 'siteadmin')
  AND a.auth_user_id = 'agent_uuid_here'
GROUP BY a.mesh_username, a.user_type, c.mesh_username, c.user_type;
```

### Ver Permissões Ativas de um Collaborator

```sql
SELECT 
  g.path AS group_path,
  p.permission,
  p.granted_at,
  granted_user.mesh_username AS granted_by
FROM mesh_group_permissions p
JOIN mesh_groups g ON p.group_id = g.id
LEFT JOIN mesh_users granted_user ON p.granted_by = granted_user.id
WHERE p.collaborator_id = 'collaborator_uuid_here'
  AND p.revoked_at IS NULL
ORDER BY g.path;
```

### Ver Devices Visíveis para um Collaborator

```sql
SELECT 
  d.device_id,
  d.friendly_name,
  g.path AS group_path,
  CASE 
    WHEN d.owner = 'collaborator_uuid_here' THEN 'owned'
    ELSE 'permitted'
  END AS access_type
FROM android_devices d
LEFT JOIN mesh_groups g ON d.group_id = g.id
WHERE d.deleted_at IS NULL
  AND (
    d.owner = 'collaborator_uuid_here'
    OR d.group_id IN (
      SELECT group_id FROM mesh_group_permissions
      WHERE collaborator_id = 'collaborator_uuid_here'
        AND revoked_at IS NULL
    )
  )
ORDER BY g.path, d.friendly_name;
```

### Audit Trail de um Grupo

```sql
SELECT 
  a.performed_at,
  a.action,
  a.permission,
  collab.mesh_username AS collaborator,
  performer.mesh_username AS performed_by,
  a.reason
FROM mesh_permission_audit a
JOIN mesh_users collab ON a.collaborator_id = collab.id
LEFT JOIN mesh_users performer ON a.performed_by = performer.id
WHERE a.group_id = 'group_uuid_here'
ORDER BY a.performed_at DESC;
```

---

## 🔧 Manutenção (Agent-Collaborator Model)

### Criar um Collaborator

```sql
-- 1. Criar user no Supabase Auth primeiro (via Dashboard ou Admin API)
-- 2. Criar entrada em mesh_users
INSERT INTO mesh_users (
  auth_user_id,
  mesh_username,
  user_type,
  parent_agent_id,
  email,
  display_name
) VALUES (
  'new_auth_user_uuid',
  'tecnico@example.com',
  'colaborador',
  'parent_agent_uuid',
  'tecnico@example.com',
  'Técnico João'
);
```

### Criar um Minisiteadmin

```sql
-- 1. Criar user no Supabase Auth primeiro (via Dashboard ou Admin API)
-- 2. Criar entrada em mesh_users
INSERT INTO mesh_users (
  auth_user_id,
  mesh_username,
  user_type,
  domain,
  domain_key,
  external_user_id,
  email,
  display_name,
  agent_id  -- self-reference
) VALUES (
  'new_auth_user_uuid',
  'minisiteadmin@zonetech.com',
  'minisiteadmin',
  'zonetech',
  'zonetech',
  'user/zonetech/minisiteadmin',
  'minisiteadmin@zonetech.com',
  'Zonetech Admin',
  'uuid_aqui'  -- must be same as id (self-reference)
);
```

### Grant Permission to Group

```sql
INSERT INTO mesh_group_permissions (
  agent_id,
  collaborator_id,
  group_id,
  permission,
  granted_by
) VALUES (
  'agent_uuid',
  'collaborator_uuid',
  'group_uuid',
  'view',
  'agent_uuid'
);
```

### Revoke Permission

```sql
UPDATE mesh_group_permissions
SET 
  revoked_at = NOW(),
  revoked_by = 'agent_uuid'
WHERE collaborator_id = 'collaborator_uuid'
  AND group_id = 'group_uuid'
  AND revoked_at IS NULL;
```

### Migrar Devices Existentes para Grupos

```sql
-- Run migration function (creates groups from notes field)
SELECT * FROM migrate_notes_to_groups();

-- Result example: (42, 15) = 42 devices migrated, 15 groups created
```

---

## 📊 Views Úteis

### collaborator_effective_permissions

```sql
SELECT * FROM collaborator_effective_permissions
WHERE collaborator_id = 'uuid_here';
```

Retorna todas as permissões (ativas e revogadas) de um collaborator com metadata completa.

### agent_hierarchy_summary

```sql
SELECT * FROM agent_hierarchy_summary
WHERE agent_id = 'uuid_here';
```

Resumo executivo de um agent/minisiteadmin: quantos collaborators, grupos, devices e permissões ativas.

---

**Próxima Revisão:** Quando houver mudanças no esquema da BD