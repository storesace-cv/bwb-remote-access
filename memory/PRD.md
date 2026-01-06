# PRD - BWB Remote Access / RustDesk Integration

## Objetivo do Projeto
Substituir autenticação Auth0 por um sistema personalizado usando MeshCentral, com mirroring de utilizadores para Supabase e geração de JWT compatível.

## Arquitetura de Autenticação

### Fluxo Atual (Implementado e Funcionando ✅)
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

## Status das Funcionalidades

### ✅ Funcionando (Testado)
- [x] Login com email/password
- [x] Geração de JWT do Supabase Auth
- [x] Sincronização de `auth_user_id` em cada login
- [x] Cookie de sessão para middleware
- [x] Redirecionamento para dashboard
- [x] Dashboard carrega corretamente
- [x] "Painel de Gestão (Mini Site Admin)" aparece para roles corretos
- [x] Edge Function `get-devices` - Retorna dispositivos (ou array vazio se não houver)
- [x] Edge Function `admin-list-groups` - Retorna grupos com permissões
- [x] **QR Code generation** - Modal funciona, QR é gerado com countdown

### ⚠️ Funcionalidades a Verificar
- [ ] Provisionamento de dispositivos via QR
- [ ] Gestão de colaboradores

## Edge Functions do Supabase (NÃO MODIFICAR)
As Edge Functions estão hospedadas no Supabase e funcionam correctamente.
Elas verificam autenticação via:
1. JWT válido do Supabase Auth
2. `mesh_users.auth_user_id` = `auth.uid()` do JWT

## Ficheiros Principais

### Backend/API
- `/src/app/api/login/route.ts` - Endpoint de login com sincronização de auth_user_id
- `/src/lib/mesh-auth.ts` - Funções de autenticação e mirroring
- `/middleware.ts` - Proteção de rotas

### Frontend
- `/src/components/login-form.tsx` - Formulário de login
- `/src/app/dashboard/page.tsx` - Dashboard principal

### Configuração
- `/.env.local` - Chaves do Supabase:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (obrigatório para Admin API)

## Credenciais de Teste
- Email: `jorge.peixinho@bwb.pt`
- Password: `Admin123!`
- Domain: `mesh`
- Role: `minisiteadmin`

## Notas Técnicas
- Password fixa no Supabase Auth: `Admin1234!`
- Session cookie: `mesh_session` (HTTPOnly, 7 dias)
- JWT armazenado em localStorage como `rustdesk_jwt`

## Data da Última Atualização
6 de Janeiro de 2026 - Login e Dashboard funcionando 100%
