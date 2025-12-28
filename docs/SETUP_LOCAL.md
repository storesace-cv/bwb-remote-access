# Setup Local — RustDesk Mesh Integration

## Pré-requisitos

- Node.js >= 20 (de preferência via `nvm`)
- npm (vem com o Node)
- Git

## 1. Clonar repositório

```bash
git clone https://github.com/storesace-cv/rustdesk-mesh-integration.git
cd rustdesk-mesh-integration
git checkout my-rustdesk-mesh-integration
2. Variáveis de ambiente (frontend)

Criar .env.local na raiz:
NEXT_PUBLIC_SUPABASE_URL=https://kqwaibgvmzcqeoctukoy.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtxd2FpYmd2bXpjcWVvY3R1a295Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1MjQxOTMsImV4cCI6MjA4MDEwMDE5M30.8C3b_iSn4EXKSkmef40XzF7Y4Uqy7i-OLfXNsRiGC3s

A chave ANON é a mesma que já está configurada no projecto Supabase.

3. Instalar dependências
npm install

4. Correr em modo desenvolvimento
npm run dev

Abrir: http://localhost:3000￼
	•	Login de teste:
	•	Email: suporte@bwb.pt
	•	Password: Admin123! (ou a actual configurada no Supabase)

Se o login for bem-sucedido, será redireccionado para /dashboard, que actualmente é um placeholder que mostra o token e um botão de logout.

5. Build de produção
npm run build
npm start  # equivale a `next start`
No droplet, o serviço systemd chama next start -p 3000 via npm exec, após npm run build.
