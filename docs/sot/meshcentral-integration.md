# MeshCentral Integration

**Última Atualização:** 13 Dezembro 2025  
**Status:** REFERÊNCIA HISTÓRICA (não usado activamente)

## ⚠️ Aviso Importante

**Este documento serve apenas como referência histórica.**

O sistema **NÃO** integra activamente com MeshCentral. A tabela `mesh_users` e campo `mesh_username` existem por razões históricas mas **não são utilizados** no fluxo principal da aplicação.

---

## Contexto Histórico

### Plano Original

Inicialmente, o projeto foi concebido para integrar com MeshCentral para gestão de dispositivos Android remotos. A ideia era:

1. Utilizadores teriam contas no MeshCentral
2. Devices Android seriam geridos via MeshCentral
3. Dashboard serviria como camada de gestão adicional

### Por que Não Foi Implementado

**Razões:**
- ❌ Complexidade adicional desnecessária
- ❌ RustDesk serve sozinho para remote desktop
- ❌ MeshCentral adiciona overhead sem benefício claro
- ✅ Sistema actual é mais simples e directo

---

## Vestígios no Código

### 1. Tabela `mesh_users`

**Schema:**
```sql
CREATE TABLE mesh_users (
  id UUID PRIMARY KEY,
  auth_user_id UUID REFERENCES auth.users(id),
  mesh_username TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

**Uso Actual:**
- `auth_user_id`: ✅ Usado (FK para auth.users)
- `mesh_username`: ❌ Não usado (pode ser NULL)
- `display_name`: ⚠️ Raramente usado

**Propósito Actual:**
Serve apenas como tabela intermediária entre `auth.users` e `android_devices`.

### 2. Campo `mesh_username` em `android_devices`

**Schema:**
```sql
CREATE TABLE android_devices (
  ...
  mesh_username TEXT,
  ...
);
```

**Uso Actual:**
- ❌ Pode ser NULL
- ❌ Não é validado
- ❌ Não é usado em nenhuma lógica

---

## Limpeza Futura (Recomendações)

### Fase 1: Renomear Tabela

```sql
-- Renomear mesh_users para app_users
ALTER TABLE mesh_users RENAME TO app_users;

-- Atualizar referências
ALTER TABLE android_devices 
RENAME CONSTRAINT mesh_users_fkey TO app_users_fkey;
```

### Fase 2: Remover Campo `mesh_username`

```sql
-- Remover coluna não usada de android_devices
ALTER TABLE android_devices DROP COLUMN mesh_username;

-- Remover coluna não usada de app_users
ALTER TABLE app_users DROP COLUMN mesh_username;
```

### Fase 3: Atualizar Código

**Ficheiros a actualizar:**
- `src/integrations/supabase/types.ts`
- Edge Functions (remover refs a mesh_username)
- Frontend (remover refs a mesh_username)

---

## Se Decidir Integrar MeshCentral (Futuro)

### Arquitectura Proposta

```
┌─────────────────┐
│   Dashboard     │
│   (Next.js)     │
└────────┬────────┘
         │
         ├──► Supabase (Auth, DB)
         │
         └──► MeshCentral API
              ├── Device Management
              ├── Remote Control
              └── User Management
```

### APIs Necessárias

**MeshCentral REST API:**
```
GET /api/nodes           # List devices
GET /api/node/:id        # Get device info
POST /api/node/:id/cmd   # Send command
```

### Fluxo de Integração

1. **Autenticação:**
   - User loga no Dashboard (Supabase)
   - Dashboard obtém token MeshCentral (via API)
   - Token armazenado em session

2. **Device Sync:**
   - Periodic sync entre Supabase e MeshCentral
   - Matching via device_id
   - Update `mesh_username` com user do MeshCentral

3. **Remote Control:**
   - Dashboard embeds MeshCentral iframe
   - Ou redirect para MeshCentral web interface

### Benefícios Potenciais

- ✅ Gestão centralizada de múltiplos tipos de devices
- ✅ Features avançadas de remote control
- ✅ Histórico de comandos e logs

### Desvantagens

- ❌ Complexidade adicional
- ❌ Dependência de sistema externo
- ❌ Custos de manutenção
- ❌ Curva de aprendizagem para users

---

## Conclusão

**Status Actual:** MeshCentral **NÃO** é usado.

**Recomendação:** 
- Manter código como está (funcional)
- Planear limpeza futura (Fase 1-3 acima)
- Só reintegrar se houver necessidade clara

**Decisão:** Sistema actual com RustDesk é suficiente para as necessidades actuais.

---

**Próxima Revisão:** Apenas se houver decisão de integrar MeshCentral