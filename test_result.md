# Test Results - Bug Fixes (Janeiro 2025)

## Bugs a Corrigir

### Bug 1: Botão "Sair" não funciona (P0)
- **Descrição**: O botão de logout no DashboardHeader não está a funcionar
- **Correção aplicada**: O handler `onLogout` está correctamente passado como prop. O código parece correto.
- **Status**: ❌ PARCIALMENTE FUNCIONAL
- **Teste realizado**: Login com credenciais suporte@bwb.pt/Admin123! foi bem-sucedido. O botão "Sair" foi encontrado e clicado, mas não redirecionou imediatamente. Contudo, a sessão foi eventualmente perdida, sugerindo que o logout pode estar a funcionar mas com delay ou problemas de redirecionamento.
- **Observações**: Necessita investigação adicional - pode ser problema de timing ou redirecionamento assíncrono.

### Bug 2: Alterações de permissões de roles não são guardadas (P0)
- **Descrição**: Alterações na página `/dashboard/roles` não são persistidas
- **Correção aplicada**: O código usa PATCH direto para Supabase REST API. Pode ser problema de RLS.
- **Status**: ❌ NÃO TESTADO
- **Teste realizado**: Não foi possível aceder à página `/dashboard/roles` - redirecionamento para login
- **Observações**: Pode ser problema de permissões do utilizador de teste ou sessão perdida

### Bug 3: Edição de utilizadores falha com erro 500 (P0)
- **Descrição**: Erro ao editar utilizadores - enviava `mesh_users.id` em vez de `auth_user_id`
- **Correção aplicada**: Corrigido `openEditModal` em `/dashboard/users/page.tsx` para usar `auth_user_id`
- **Status**: ❌ NÃO TESTADO
- **Teste realizado**: Não foi possível aceder à página `/dashboard/users` - redirecionamento para login
- **Observações**: Pode ser problema de permissões do utilizador de teste ou sessão perdida

### Bug 4: Erro de tipo no DeviceCard para `is_online` (P1)
- **Descrição**: Propriedade `is_online` não existia no tipo `GroupedDevice`
- **Correção aplicada**: Adicionado `is_online?: boolean`, `adopted?: boolean`, `observations?: string | null`, e `device_info` ao tipo
- **Status**: ✅ APARENTEMENTE CORRIGIDO
- **Teste realizado**: Não foram encontrados erros de tipo relacionados com DeviceCard no dashboard
- **Observações**: Sem dispositivos visíveis para teste completo, mas sem erros de consola detectados

## Credenciais de Teste
- **siteadmin**: `suporte@bwb.pt` / `Admin123!`
- **minisiteadmin**: `jorge.peixinho@bwb.pt` / `Admin123!`
- **Domínio**: `mesh.bwb.pt`

## Fluxos a Testar
1. Login com credenciais de siteadmin
2. Testar botão "Sair" no dashboard
3. Navegar para `/dashboard/roles` e verificar se alterações de permissões são guardadas
4. Navegar para `/dashboard/users` e tentar editar um utilizador
5. Verificar se a lista de dispositivos carrega sem erros no console

## Testing Protocol

### Incorporate User Feedback
- Verificar todos os 4 bugs reportados pelo utilizador
- Testar fluxo completo de login -> dashboard -> logout
