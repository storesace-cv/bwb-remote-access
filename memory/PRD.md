# PRD - BWB Remote Access / RustDesk Integration

## Objetivo do Projeto
Substituir autenticação Auth0 por um sistema personalizado usando MeshCentral, com mirroring de utilizadores para Supabase e geração de JWT compatível.

## Arquitetura de Autenticação

### Fluxo Actual (Implementado e Funcionando ✅)
1. **Login Form** (`/src/components/login-form.tsx`) - Envia email/password/domain para `/api/login`
2. **API Login** (`/src/app/api/login/route.ts`):
   - Usa Supabase Admin API para criar/atualizar utilizador (com password fixa `Admin1234!`)
   - **Sincroniza `auth_user_id`** na tabela `mesh_users` com o ID do Supabase Auth
   - Define cookie de sessão `mesh_session`
   - Retorna JWT para localStorage
3. **Middleware** (`/middleware.ts`) - Verifica cookie `mesh_session` para proteger rotas
4. **Dashboard** - Usa JWT para chamar APIs e Edge Functions do Supabase

### Sincronização de IDs (CRÍTICO - RESOLVIDO ✅)
- O `auth_user_id` na tabela `mesh_users` DEVE corresponder ao `id` do utilizador no Supabase Auth
- Esta sincronização é feita automaticamente em cada login via endpoint `/api/login`
- Sem esta sincronização, as Edge Functions retornam 403 ou "mesh_users mapping not found"

## RBAC - Controlo de Acesso Baseado em Roles (IMPLEMENTADO ✅)

### Hierarquia de User Types
```
siteadmin (3) > minisiteadmin (2) > agent (1) > user (0)
```

### Permissões
- **Painel de Gestão**: Visível para `siteadmin`, `minisiteadmin`, `agent`
- **Gestão de Utilizadores**: Acessível para `siteadmin`, `minisiteadmin`, `agent`
- **Filtro de Visibilidade**: Cada role só vê utilizadores com nível INFERIOR ao seu
  - `siteadmin` vê: `minisiteadmin`, `agent`, `user`
  - `minisiteadmin` vê: `agent`, `user`
  - `agent` vê: `user`

## Status das Funcionalidades

### ✅ Funcionando (Testado)
- [x] Login com email/password
- [x] Geração de JWT do Supabase Auth
- [x] Sincronização de `auth_user_id` em cada login
- [x] Cookie de sessão para middleware
- [x] Redirecionamento para dashboard
- [x] Dashboard carrega corretamente (SEM LOOP)
- [x] "Painel de Gestão" aparece para roles corretos
- [x] Edge Function `get-devices` - Retorna dispositivos
- [x] Edge Function `admin-list-groups` - Retorna grupos
- [x] **QR Code generation** - Modal funciona, QR é gerado
- [x] **Gestão de Utilizadores** - Lista utilizadores com filtro de hierarquia
- [x] **RBAC implementado** - Filtragem por user_type

### ⚠️ Funcionalidades a Verificar
- [ ] Provisionamento de dispositivos via QR
- [ ] Gestão de colaboradores
- [ ] Edição/Criação de utilizadores

## Edge Functions do Supabase (NÃO MODIFICAR)
As Edge Functions estão hospedadas no Supabase e funcionam correctamente.

## Ficheiros Principais Modificados

### Backend/API
- `/src/app/api/login/route.ts` - Endpoint de login com sincronização de auth_user_id

### Frontend
- `/src/app/dashboard/page.tsx` - Dashboard principal (corrigido loop)
- `/src/app/dashboard/users/page.tsx` - Gestão de Utilizadores (com filtro RBAC)

### Configuração
- `/.env.local` - Chaves do Supabase

## Credenciais de Teste
- **siteadmin**: `suporte@bwb.pt` / `Admin123!`
- **minisiteadmin**: `jorge.peixinho@bwb.pt` / `Admin123!`

## Data da Última Atualização
6 de Janeiro de 2026 - Login, Dashboard, RBAC e Gestão de Utilizadores funcionando
