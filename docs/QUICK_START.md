# Quick Start Guide

**Tempo estimado:** 10 minutos ⏱️

---

## 🎯 Objetivo

Ter o sistema RustDesk Mesh Integration a correr localmente em menos de 10 minutos.

---

## 📋 Pré-requisitos

- ✅ Node.js 18+ instalado
- ✅ npm ou yarn instalado
- ✅ Conta Supabase (criar em [supabase.com](https://supabase.com))
- ✅ Git instalado

---

## 🚀 Passos Rápidos

### 1. Clone o Repositório (1 min)

```bash
git clone https://github.com/your-org/rustdesk-mesh-integration.git
cd rustdesk-mesh-integration
```

### 2. Install Dependencies (2 min)

```bash
npm install
```

### 3. Configure Supabase (3 min)

**A. Criar Projeto no Supabase:**
1. Aceder a [supabase.com](https://supabase.com)
2. Criar novo projeto
3. Anotar:
   - Project URL
   - Anon Key
   - Service Role Key

**B. Criar Environment File:**
```bash
cp .env.local.example .env.local
```

**C. Editar `.env.local`:**
```bash
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=seu-anon-key
SUPABASE_SERVICE_ROLE_KEY=seu-service-role-key
```

### 4. Setup Database (2 min)

**A. Executar migrations:**
```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link project
supabase link --project-ref seu-project-ref

# Run migrations
supabase db push
```

**B. Ou manualmente no Dashboard:**
1. Ir para Supabase Dashboard → SQL Editor
2. Copiar e executar SQL de `supabase/migrations/*.sql`

### 5. Deploy Edge Functions (2 min)

```bash
supabase functions deploy get-devices
supabase functions deploy register-device
supabase functions deploy check-registration-status
supabase functions deploy start-registration-session
supabase functions deploy generate-qr-image
```

### 6. Run Development Server (1 min)

```bash
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000)

---

## ✅ Verificação

### Teste 1: Login Funciona?
1. Ir para [http://localhost:3000](http://localhost:3000)
2. Criar utilizador teste no Supabase Dashboard
3. Fazer login

**Esperado:** Redirect para dashboard

### Teste 2: Dashboard Carrega?
1. Ver lista de devices (vazia)
2. Botões "Adicionar Dispositivo" e "Refresh" visíveis

**Esperado:** Interface carrega sem erros

### Teste 3: QR Code Gera?
1. Clicar "Adicionar Dispositivo"
2. Modal abre com QR code

**Esperado:** QR code aparece em <1 segundo

---

## 🐛 Problemas Comuns

### Erro: "Cannot connect to Supabase"

**Solução:**
```bash
# Verificar .env.local
cat .env.local

# Testar URL
curl https://seu-projeto.supabase.co
```

### Erro: "Edge Function not found"

**Solução:**
```bash
# Redeployar functions
supabase functions deploy --all
```

### Erro: "Invalid JWT"

**Solução:**
```bash
# Limpar localStorage
# Chrome DevTools → Application → Local Storage → Clear
```

---

## 📚 Próximos Passos

Agora que está a correr:

1. **Ler [USER_GUIDE.md](USER_GUIDE.md)** - Como usar o sistema
2. **Ler [ARCHITECTURE.md](ARCHITECTURE.md)** - Entender a arquitetura
3. **Explorar [API_REFERENCE.md](API_REFERENCE.md)** - APIs disponíveis
4. **Ver [DEPLOYMENT.md](DEPLOYMENT.md)** - Deploy para produção

---

## 🆘 Precisa de Ajuda?

- 📖 [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- 💬 Abrir issue no GitHub
- 📧 suporte@bwb.pt

---

**Tempo total:** ~10 minutos  
**Última atualização:** 13 Dezembro 2025