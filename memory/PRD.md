# PRD - BWB Remote Access / RustDesk Integration

## Objetivo do Projeto
Substituir autenticação Auth0 por um sistema personalizado usando MeshCentral, com mirroring de utilizadores para Supabase e geração de JWT compatível.

## Arquitetura de Autenticação

### Fluxo Actual (Implementado e Funcionando ✅)
1. **Login Form** - Envia email/password/domain para `/api/login`
2. **API Login** - Usa Supabase Admin API, sincroniza `auth_user_id`, define cookie de sessão
3. **Middleware** - Verifica cookie `mesh_session` para proteger rotas
4. **Dashboard** - Usa JWT e permissões da tabela `roles`

## Sistema de Permissões (RBAC) - 100% Baseado na Tabela `roles`

### ✅ Refatoração Completa Concluída
- Removidas **todas** as permissões hardcoded
- Todas as verificações usam agora a tabela `roles` do Supabase
- Criado serviço centralizado `/lib/permissions-service.ts`

### Tabela `roles` - Campos de Permissão
| Campo | Descrição |
|-------|-----------|
| `can_access_management_panel` | Aceder ao Painel de Gestão |
| `can_view_users` | Ver lista de utilizadores |
| `can_create_users` | Criar utilizadores |
| `can_edit_users` | Editar utilizadores |
| `can_delete_users` | Eliminar utilizadores |
| `can_view_groups` | Ver grupos |
| `can_manage_roles` | Gerir roles (página de administração) |
| `can_access_all_domains` | Aceder a todos os domínios |
| `can_access_own_domain_only` | Restrito ao próprio domínio |
| `hierarchy_level` | Nível hierárquico (0=maior, maior=menor) |
| ... | (e muitas outras permissões) |

### Hierarquia por `hierarchy_level`
- `0` = Site Admin (maior privilégio)
- `1` = Mini Site Admin
- `2` = Agent
- `3+` = Colaborador/User

### Página de Gestão de Roles (/dashboard/roles)
- ✅ Criada página completa para `siteadmin`
- ✅ Permite activar/desactivar permissões de cada role
- ✅ Organizada por categorias (Painel, Dispositivos, Utilizadores, Grupos, Domínio)
- ✅ Actualizações em tempo real na base de dados

## Status das Funcionalidades

### ✅ Funcionando
- [x] Login com email/password
- [x] Sincronização de `auth_user_id`
- [x] Dashboard com permissões dinâmicas da tabela `roles`
- [x] Painel de Gestão baseado em `can_access_management_panel`
- [x] **Gestão de Utilizadores UNIFICADA** - Candidatos, Colaboradores e Admins numa única página
- [x] Gestão de Roles baseada em `can_manage_roles`
- [x] Filtragem por hierarquia (`hierarchy_level`)
- [x] QR Code generation
- [x] Edge Functions funcionais

## Ficheiros Principais

### Serviço de Permissões (NOVO)
- `/src/lib/permissions-service.ts` - Serviço centralizado de permissões

### Páginas
- `/src/app/dashboard/page.tsx` - Dashboard principal (usa `userPermissions`)
- `/src/app/dashboard/users/page.tsx` - **CONSOLIDADA** Gestão completa de utilizadores (candidatos, colaboradores, admins)
- `/src/app/dashboard/collaborators/page.tsx` - **DEPRECATED** Redireciona para /dashboard/users
- `/src/app/dashboard/roles/page.tsx` - Gestão de roles

### Consolidação de Páginas (Dez 2025)
A página "Gestão de Colaboradores" foi consolidada com "Gestão de Utilizadores" numa única interface que permite:
- Ver todos os utilizadores (candidatos, activos, inactivos, admins)
- Filtrar por status e domínio
- Activar candidatos do MeshCentral
- Criar/Editar/Apagar utilizadores
- Desactivar/Reactivar utilizadores
- Estatísticas visuais por categoria

## Credenciais de Teste
- **siteadmin**: `suporte@bwb.pt` / `Admin123!`
- **minisiteadmin**: `jorge.peixinho@bwb.pt` / `Admin123!`

## Data da Última Atualização
Dezembro de 2025 - Consolidação da gestão de utilizadores e refatoração do Dashboard

## Refatoração do Dashboard (Dezembro 2025)
O componente monolítico `/dashboard/page.tsx` foi refatorado de 2513 para 2066 linhas, com extração de 7 componentes reutilizáveis:

| Componente | Linhas | Descrição |
|------------|--------|-----------|
| `DashboardHeader` | 73 | Header com info do utilizador e navegação |
| `ManagementPanel` | 93 | Cards de acesso rápido (Utilizadores, Grupos, Roles) |
| `AddDeviceSection` | 175 | Secção de adicionar dispositivo (QR codes) |
| `DeviceFilters` | 169 | Filtros e pesquisa de dispositivos |
| `UnadoptedDevicesList` | 110 | Lista de dispositivos por adoptar |
| `AdminUnassignedDevicesList` | 98 | Lista de dispositivos sem utilizador (admin) |
| `DeviceCard` | 129 | Card individual de dispositivo |

Localização: `/src/app/dashboard/components/`
