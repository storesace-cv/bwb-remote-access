# Frontend Behaviour — Next.js App

## 1. Rotas

- `/` — Página de login.
- `/dashboard` — Página principal com QR + lista de devices.

## 2. Login Page (`/`)

### 2.1 UI Rules

- Campos:
  - Email
  - Password
- Botão:
  - “Entrar”

### 2.2 Comportamento

1. Ao submeter o formulário:
   - Validar que email e password não estão vazios.
   - Chamar Edge Function `/login`.
2. Se `/login` devolver erro:
   - Mostrar mensagem legível na página:
     - Ex.: “Credenciais inválidas ou utilizador não existe”.
3. Se `/login` devolver `token`:
   - Guardar token num cookie *httpOnly* (idealmente) ou localStorage
     (até ser migrado para cookies).
   - Redireccionar para `/dashboard`.

### 2.3 Estados visuais

- Enquanto a chamada está em curso:
  - Desactivar botão “Entrar”.
  - Mostrar um spinner simples ou texto “A autenticar…”.

## 3. Dashboard (`/dashboard`)

### 3.1 Ao carregar a página

- Verificar se existe token válido (cookie ou localStorage).  
- Se não houver token → redireccionar para `/`.

### 3.2 Carregar QR e dispositivos

1. Em paralelo:
   - `GET /get-qr` com header `Authorization: Bearer <token>`
   - `GET /get-devices` com o mesmo header
2. `get-qr`:
   - Devolve `config`.
   - O frontend gera um QR code **sempre** com `host = rustdesk.bwb.pt`
     (e nunca IP).
3. `get-devices`:
   - Se devolver `[]`, mostrar:
     - Mensagem “Sem dispositivos adoptados ou por adoptar ainda.”
   - Se devolver dados, aplicar agrupamento descrito abaixo.

### 3.3 Agrupamento — Grupo / Subgrupo / Dispositivos

Cada device tem:

- `group_name`
- `subgroup_name`
- `is_adopted`

Regras de visualização:

#### 3.3.1 Grupo “Dispositivos por adoptar”

- O frontend deve criar um **grupo lógico especial** chamado:
  - “Dispositivos por adoptar”
- Inclui todos os devices onde `is_adopted = false`.

Mesmo que não haja nenhum, é aceitável:
- ou não mostrar o grupo,
- ou mostrar o grupo com mensagem “Sem dispositivos por adoptar”.
A escolha final é de UX; o SoT apenas exige que, se existirem, apareçam
claramente identificados.

#### 3.3.2 Grupo e Subgrupo normais

- Devices com `is_adopted = true` são agrupados assim:
  - Primeiro por `group_name` (obrigatório).
  - Dentro de cada grupo, por `subgroup_name` (pode ser null).

Visualmente:

- Grupo (colapsável):
  - “▼ Pizza Hut”
- Subgrupo (colapsável, se existir):
  - “▼ Loja 1”
- Lista de cards:

  - Cada card contém:
    - `friendly_name` (ou fallback).
    - `device_id` (versão curta, ex.: últimos 4 dígitos).
    - `last_seen_at` em formato humano (“Hoje às 14:23”, etc.).
    - Botão/ícone “Editar notas” (para futuro).
    - Placeholder/botão “Abrir no RustDesk” (para futuro).

### 3.4 Edição de Notes (Adopção / Reorganização)

Fluxo conceptual:

- Quando um device está “por adoptar”:
  - Clique abre um modal ou painel para preencher `notes`.
  - Ao gravar, o frontend chama uma Edge Function (futura) ou o supabase-js
    para actualizar linha em `android_devices`:
    - `owner = auth.uid()`
    - `notes = <texto introduzido>`
    - recalcular `group_name` / `subgroup_name` no backend (Edge Function).

- Quando um device já está adoptado:
  - O mesmo modal permite editar o `notes`.
  - Isto pode alterar `group_name` / `subgroup_name`.

O SoT exige que:

- A regra de parsing de `notes` (grupo/subgrupo) seja centralizada no backend.
- O frontend não tente replicar esta lógica — apenas envia o texto completo.

### 3.5 Responsividade e UX

- O layout deve ser optimizado para smartphone.
  - QR centrado no topo, com margem de ~25px antes da lista de devices.
  - Cards em coluna única em ecrãs estreitos.
- Em desktop:
  - Pode usar layout a duas colunas (QR à esquerda, devices à direita),
    mas não é obrigatório.

### 3.6 Logout

- Botão “Sair” visível no topo direito do dashboard.
- Ao clicar:
  - Apagar token (cookie/localStorage).
  - Opcionalmente chamar `supabase.auth.signOut()` se o SDK for usado.
  - Redireccionar para `/`.

## 4. Gestão de Erros no UI

Regra de ouro: **nenhum erro técnico cru** deve aparecer ao utilizador final.

- Erros de rede (`fetch` falhou):
  - Mostrar “Não foi possível comunicar com o servidor. Tenta novamente.”
- 401 no `/get-devices` ou `/get-qr`:
  - Redireccionar para `/` com mensagem “Sessão expirada. Faz login novamente.”
- Outras falhas da API:
  - Mostrar mensagem genérica + log no console.

O console do browser pode conter mais detalhes (stack traces, mensagens da
Edge Function), mas a UI deve ser amigável.
