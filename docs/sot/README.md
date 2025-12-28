# Source of Truth (SoT) - RustDesk Mesh Integration

Esta pasta contém a documentação técnica definitiva do projeto. Use-a como referência autoritativa para entender a arquitetura, contratos de API, modelos de dados e comportamentos do sistema.

## 📚 Documentos Disponíveis

### 1. [Architecture](architecture.md)
Visão técnica completa da arquitetura do sistema:
- Componentes e suas responsabilidades
- Fluxos de dados detalhados
- Decisões de design e justificativas
- Diagramas de arquitetura

### 2. [Data Models](data-models.md)
Estrutura completa da base de dados:
- Esquema de todas as tabelas
- Relacionamentos entre entidades
- Índices e constraints
- Row Level Security (RLS) policies

### 3. [API Contracts](api-contracts.md)
Contratos formais de todas as APIs:
- API Routes (Next.js)
- Edge Functions (Supabase)
- Request/Response schemas
- Códigos de erro

### 4. [Frontend Behaviour](frontend-behaviour.md)
Lógica e comportamentos do frontend:
- Componentes principais
- State management
- Fluxos de UI/UX
- Validações e error handling

### 5. [Sync Engine](sync-engine.md)
Sistema de sincronização de dispositivos:
- Matching temporal on-demand
- Sessões de registro
- Lógica de associação de devices
- Timeouts e expiração

### 6. [Supabase Integration](supabase-integration.md)
Integração completa com Supabase:
- Auth configuration
- Database setup
- Edge Functions deployment
- Environment variables

### 7. [Security & Permissions](security-and-permissions.md)
Modelo de segurança do sistema:
- Autenticação JWT
- Row Level Security
- Políticas de acesso
- Service role vs. Anon key

### 8. [Glossary](glossary.md)
Definições de termos técnicos do projeto

## 🔑 Nota Importante: Hierarquia de Utilizadores (5-Tier System)

**NOVA HIERARQUIA (Atualizada em 22 Dezembro 2025):**

```
siteadmin (topo absoluto - super-admin global)
    ↓
minisiteadmin (super-admin de domínio) [NOVO]
    ↓
agent (gestor de tenant)
    ↓
colaborador (ativo)
    ↓
inactivo (desativado)
    ↓
candidato (sem conta - base)
```

**Tipos de Utilizadores:**

1. **siteadmin** - Super-admin global
   - Vê e gere TODOS OS DOMÍNIOS do sistema
   - Pode criar/editar/eliminar qualquer utilizador
   - Acesso irrestrito a todos os recursos

2. **minisiteadmin** - Super-admin de domínio (NOVO em 22 Dez 2025)
   - Vê e gere TODO O SEU DOMÍNIO (equivalente a siteadmin mas restrito ao domínio)
   - Pode criar/editar/eliminar qualquer utilizador do seu domínio
   - Acesso irrestrito aos recursos do seu domínio
   - Isolado via RLS/Edge Functions

3. **agent** - Gestor de tenant
   - Pode criar colaboradores no seu tenant
   - Vê e gere tudo no seu domínio/tenant

4. **colaborador** - Colaborador ativo
   - Tem conta Supabase ativa
   - Vê apenas grupos/devices com permissão explícita

5. **inactivo** - Colaborador desativado
   - Não tem acesso ao sistema
   - Preserva histórico e audit trail

6. **candidato** - Candidato sem conta
   - Existe no MeshCentral
   - Não tem conta Supabase (auth_user_id = NULL)

## 🎯 Utilizadores (Auth) vs. mesh_users

Para evitar ambiguidades sobre "onde vive" cada utilizador:

- Os utilizadores **reais da aplicação** vivem em **Supabase Auth**:
  - Tabela: `auth.users`
  - Campo chave: `id` (UID que vês no painel *Authentication* do Supabase)

- A tabela **`mesh_users`** faz o mapeamento entre esse UID e o utilizador no MeshCentral:
  - `mesh_users.auth_user_id` → FK directa para `auth.users.id` (UID do Authentication)
  - `mesh_users.id` → UUID interno desta tabela, usado como `owner` em `android_devices`
  - `mesh_users.mesh_username` → username do MeshCentral (ex.: `jorge.peixinho@storesace.cv`)
  - `mesh_users.user_type` → tipo na hierarquia (siteadmin/minisiteadmin/agent/colaborador/inactivo/candidato)
  - `mesh_users.domain` → domínio do MeshCentral (mesh/zonetech/zsangola/etc.)

Fluxo canónico de ownership de devices:

1. Utilizador faz login → JWT contém `sub = auth.users.id`
2. `mesh_users` mapeia `auth_user_id = sub` para `mesh_users.id`
3. A coluna `android_devices.owner` referencia `mesh_users.id`

Os detalhes completos (schema, RLS, exemplos) estão em [Data Models](data-models.md), mas este resumo é a fonte de verdade sobre como os UIDs do painel *Authentication* se relacionam com os owners de dispositivos na base de dados.

## 🎯 Como Usar

**Para Desenvolvedores:**
- Comece por [Architecture](architecture.md) para visão geral
- Consulte [Data Models](data-models.md) ao trabalhar com database
- Use [API Contracts](api-contracts.md) ao integrar APIs
- Leia [Frontend Behaviour](frontend-behaviour.md) ao modificar UI

**Para DevOps:**
- [Supabase Integration](supabase-integration.md) para setup
- [Security & Permissions](security-and-permissions.md) para config de produção

**Para Product Managers:**
- [Sync Engine](sync-engine.md) para entender matching temporal
- [Glossary](glossary.md) para vocabulário técnico

## ⚠️ Importante

Esta documentação é a **fonte da verdade**. Se encontrar discrepâncias entre código e documentação:
1. Verifique qual está correto
2. Atualize a documentação ou código conforme necessário
3. Mantenha sempre sincronizados

---

**Última Atualização:** 22 Dezembro 2025