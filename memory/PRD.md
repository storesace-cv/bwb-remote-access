# PRD - BWB Remote Access / RustDesk Integration

## Objetivo do Projeto
Substituir autenticação Auth0 por um sistema personalizado usando MeshCentral, com mirroring de utilizadores para Supabase e geração de JWT compatível.

## Arquitetura de Autenticação

### Fluxo Atual (Implementado)
1. **Login Form** (`/src/components/login-form.tsx`) - Envia email/password/domain para `/api/login`
2. **API Login** (`/src/app/api/login/route.ts`):
   - Usa Supabase Admin API para criar/atualizar utilizador
   - Faz signIn com password fixa (`Admin1234!`)
   - **Sincroniza auth_user_id** na tabela `mesh_users` com o ID do Supabase Auth
   - Define cookie de sessão `mesh_session`
   - Retorna JWT para localStorage
3. **Middleware** (`/middleware.ts`) - Verifica cookie `mesh_session` para proteger rotas
4. **Dashboard** - Usa JWT para chamar APIs e Edge Functions do Supabase

### Sincronização de IDs (CRÍTICO)
- O `auth_user_id` na tabela `mesh_users` DEVE corresponder ao `id` do utilizador no Supabase Auth
- Esta sincronização é feita automaticamente no login
- Sem esta sincronização, o RLS (Row Level Security) falha

## Status das Funcionalidades

### ✅ Funcionando
- [x] Login com email/password
- [x] Geração de JWT do Supabase Auth
- [x] Sincronização de auth_user_id
- [x] Cookie de sessão para middleware
- [x] Redirecionamento para dashboard
- [x] Dashboard carrega corretamente
- [x] "Painel de Gestão" aparece para roles corretos
- [x] RLS funciona após sincronização de auth_user_id

### ⚠️ Problemas Conhecidos (Edge Functions)
- [ ] QR Code generation - Erro 500 (falta dados em `rustdesk_settings`)
- [ ] Algumas Edge Functions podem retornar 403 se não estiverem deployadas

### 🔧 Configuração Necessária no Supabase
1. Tabela `rustdesk_settings` precisa ter dados de configuração
2. Edge Functions precisam estar deployadas
3. RLS policies devem usar `auth.uid() = auth_user_id`

## Ficheiros Principais

### Backend/API
- `/src/app/api/login/route.ts` - Endpoint de login principal
- `/src/lib/mesh-auth.ts` - Funções de autenticação e mirroring
- `/middleware.ts` - Proteção de rotas

### Frontend
- `/src/components/login-form.tsx` - Formulário de login
- `/src/app/dashboard/page.tsx` - Dashboard principal

### Configuração
- `/.env.local` - Chaves do Supabase (URL, ANON_KEY, SERVICE_ROLE_KEY)

## Credenciais de Teste
- Email: `jorge.peixinho@bwb.pt`
- Password: `Admin123!`
- Domain: `mesh`

## Notas Técnicas
- Password fixa no Supabase Auth: `Admin1234!`
- Session cookie: `mesh_session` (criptografado, HTTPOnly, 7 dias)
- JWT armazenado em localStorage como `rustdesk_jwt`

## Data da Última Atualização
6 de Janeiro de 2026
