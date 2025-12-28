# RustDesk · Mesh Integration — Overview

Este projecto junta 4 peças:

1. **RustDesk** (HBBS / HBBR)  
   - Faz o broker das ligações remotas.
   - Usa `rustdesk.bwb.pt` como host e uma Public Key HBBS real.

2. **MeshCentral**  
   - Gere estações e Androids.
   - Para Android, usa o fluxo:
     - utilizador entra no Mesh,
     - abre pasta ANDROID,
     - lê QR gerado para RustDesk.

3. **Supabase**
   - Autenticação (auth.users) — utilizadores:
     - `suporte@bwb.pt`
     - `jorge.peixinho@bwb.pt`
     - `datalink@datalink.pt`
     - `assistencia@zsa-softwares.com`
   - Base de dados Postgres:
     - Tabela `mesh_users` — mapeia utilizadores auth → nomes usados no Mesh.
     - Tabela `android_devices` — lista de dispositivos Android por utilizador.
   - Edge Functions:
     - `login` — autenticação e devolução do access_token.
     - `get-devices` — devolve dispositivos Android do utilizador.
     - `register-device` — cria/actualiza devices.
     - `remove-device` — apaga um device.

4. **Frontend Next.js (este repositório)**
   - Roda em `rustdesk.bwb.pt:3000` (Next.js 16, App Router, Tailwind).
   - Páginas:
     - `/` → login Supabase.
     - `/dashboard` → placeholder (já a funcionar), futuro:
       - QR RustDesk,
       - grupos/subgrupos de dispositivos Android,
       - edição de `notes` (grupo/loja) e adopção de dispositivos.

---

## Fluxo actual de autenticação (v2)

1. Frontend (`/`) envia:
   - `POST {SUPABASE_URL}/functions/v1/login`
   - headers:
     - `Content-Type: application/json`
     - `Authorization: Bearer <ANON_PUBLIC_KEY>` (JWT anon do Supabase)
   - body: `{ email, password }`

2. Edge Function `login`:
   - ignora o JWT do header (é só para o gateway Supabase ficar feliz),
   - cria cliente `createClient(SUPABASE_URL, SERVICE_ROLE_KEY)`,
   - faz `auth.signInWithPassword({ email, password })`,
   - devolve `{ token: <access_token> }`.

3. Frontend:
   - guarda `token` em `localStorage` como `rustdesk_token`,
   - faz `router.push("/dashboard")`.

4. `/dashboard`:
   - lê `rustdesk_token` de `localStorage`,
   - se não existir → `router.replace("/")`,
   - mostra o token e botão “Terminar sessão”.

> O passo seguinte para o Codex é ligar `/dashboard` às funções `get-devices` e `register-device`, e voltar a incluir o QR RustDesk.

---

## Tabelas principais (visão lógica)

### `public.mesh_users`

Mapping de utilizadores auth → labels usados no Mesh.

Campos esperados:

- `id uuid PRIMARY KEY` — *pode* referenciar `auth.users.id` (confirma no esquema).
- `mesh_username text` — ex: `admin`, `jorge.peixinho@storesace.cv`, etc.
- `display_name text` — ex: `Admin`, `Jorge Peixinho`, `Rui Abreu`.
- `created_at timestamptz DEFAULT now()`.
- `auth_user_id uuid` — id do `auth.users` correspondente (também FK).

> Nota: neste momento a tabela já está populada com os 4 utilizadores principais.

### `public.android_devices`

Lista dos Android RustDesk associados a cada utilizador.

Campos esperados (ajustar ao esquema real):

- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `owner uuid NOT NULL` — pode referenciar:
  - `mesh_users.id` **ou**
  - directamente `auth.users.id`  
  (**Codex deve confirmar com `\d public.android_devices`**)
- `device_id text NOT NULL` — ID RustDesk (ex: `1403938023`).
- `notes text` — texto livre. Convenção:
  - vazio/NULL → **Dispositivo por Adoptar**
  - `"Grupo | ..." ` → Grupo
  - `"Grupo | Sub Grupo | ..."` → Grupo + Sub Grupo
- `created_at timestamptz DEFAULT now()`

---

## Grupos e Subgrupos

Campo `notes` segue a convenção:

- `"Pessoal | Smartphone Android do Jorge (teste)"`  
  - Grupo: `Pessoal`
  - Subgrupo: *(nenhum)*
  - Nome amigável: `Smartphone Android do Jorge (teste)`

- `"Pizza Hut | Loja 1 | Smartphone 01"`  
  - Grupo: `Pizza Hut`
  - Subgrupo: `Loja 1`
  - Nome: `Smartphone 01`

O frontend deverá:

1. Mostrar sempre o grupo **“Dispositivos por adoptar”** (não pode ser apagado).
   - Lista devices com `notes` vazio/NULL.
2. Agrupar os restantes por `Grupo` e, dentro de cada grupo, por `Subgrupo`.
3. Permitir editar `notes` para reorganizar os devices (mudar grupo/loja).

---

## O que falta fazer (alto nível)

- Ligar `/dashboard`:
  - Edge Function `get-devices` (listar devices do utilizador logado).
  - Edge Function `register-device` (adoptar/editar device — actualizar `notes`).
  - Edge Function `remove-device` (remover device).
- Trazer para este repositório:
  - scripts do droplet (`/opt/meshcentral/sync-devices.sh`) em versão “modelo”;
  - código das Edge Functions, para ser SoT (espelhado em `supabase/functions/*`).
- Substituir o placeholder do dashboard por:
  - QR RustDesk gerado com:
    - host: `rustdesk.bwb.pt`
    - public key HBBS: `Rs16v4T5zElCIsxbcAn39LwRYniVi5EQbXAgLVqWFYk=`
  - secção de dispositivos agrupados (com UI de adopção/edição).

