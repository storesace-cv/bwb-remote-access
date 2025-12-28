# Manual do Utilizador - RustDesk Mesh Integration

**Versão:** 1.0.0  
**Última Atualização:** 13 Dezembro 2025

Guia completo para utilização do sistema de gestão de dispositivos Android.

## 📱 Visão Geral

O RustDesk Mesh Integration permite gerir dispositivos Android remotamente através do RustDesk, organizando-os em grupos e subgrupos para facilitar a gestão.

## 🚀 Acesso ao Sistema

### URL de Acesso

**Produção:** https://rustdesk.bwb.pt

### Credenciais

Entre em contacto com o administrador do sistema para obter as suas credenciais de acesso.

Utilizadores autorizados:
- Suporte BWB
- Jorge Peixinho (BWB)
- Datalink
- Assistência ZSA Softwares

## 🔐 Login

1. Aceda a https://rustdesk.bwb.pt
2. Introduza o seu **email**
3. Introduza a sua **password**
4. Clique em **"Entrar"**

### Esqueceu a Password?

1. Clique em **"Esqueceste a password?"**
2. Introduza o seu email
3. Receberá um email com instruções para redefinir
4. Clique no link do email
5. Defina uma nova password

---

## 📊 Dashboard Principal

Após login, será redirecionado para o dashboard principal.

### Secções do Dashboard

#### 1. Header
- **Título:** RustDesk Android Support
- **Botão "Perfil":** Aceder às configurações da conta
- **Botão "Sair":** Terminar sessão

#### 2. Card de Registo
- Instruções para adicionar novos dispositivos
- Configuração do servidor RustDesk
- Botão **"+ Adicionar Dispositivo"**

#### 3. Filtros e Pesquisa
- **Barra de pesquisa:** Procurar por ID, nome ou notas
- **Ordenação:** Por data, nome ou ID
- **Filtros:** Todos / Adoptados / Por Adotar

#### 4. Dispositivos por Adotar (secção amarela)
- Lista de dispositivos conectados mas sem informações
- Requerem adopção para organização

#### 5. Dispositivos Adoptados (secção principal)
- Organizados em grupos e subgrupos
- Com todas as informações preenchidas

---

## ➕ Adicionar Dispositivo Android

### Passo 1: Iniciar Registo

1. No dashboard, clique em **"+ Adicionar Dispositivo"**
2. Será apresentado um modal com:
   - QR code
   - Temporizador (5 minutos)
   - Barra de progresso

### Passo 2: Escanear QR Code

**No dispositivo Android:**

1. Abra a app **RustDesk**
2. Toque no ícone de **menu** (3 linhas horizontais)
3. Seleccione **"Scan QR"** ou **"Escanear QR"**
4. Aponte a câmara para o QR code no ecrã
5. Aguarde alguns segundos para a conexão

**Nota:** O QR code é válido por 5 minutos. Após esse tempo, terá de gerar um novo.

### Passo 3: Verificar Dispositivo

1. Após escanear o QR, clique em **"🔍 Verificar Dispositivo"** no modal
2. O sistema irá procurar o dispositivo que acabou de conectar
3. Se encontrado, aparecerá a mensagem:
   ```
   ✅ Dispositivo Detectado!
   ID: 1403938023
   ```
4. Clique em **"Fechar"**

**O dispositivo aparecerá agora em "Dispositivos por Adotar"**

### Passo 4: Adotar o Dispositivo

Dispositivos recém-conectados precisam ser "adoptados" para serem organizados.

1. Na secção **"⚠️ Dispositivos por Adotar"**, encontre o seu dispositivo
2. Clique no botão **"✓ Adotar"**
3. No formulário que aparece, preencha:

   **Nome do Dispositivo** (opcional)
   - Ex: "Tablet Sala", "Samsung A54", "Telefone João"
   - Ajuda a identificar o dispositivo rapidamente

   **Grupo** (obrigatório)
   - Ex: "Escritório", "Casa", "Cliente ABC", "Pizza Hut"
   - Agrupa dispositivos por localização ou cliente

   **Subgrupo** (opcional)
   - Ex: "Sala 1", "Piso 2", "Loja Centro", "Departamento TI"
   - Organização mais detalhada dentro do grupo

4. Clique em **"✓ Adotar Dispositivo"**

**O dispositivo será movido para a secção de "Dispositivos Adoptados" no grupo correcto!**

---

## 📁 Organização de Dispositivos

### Hierarquia de Grupos

```
Grupo Principal
└── Subgrupo
    └── Dispositivos
```

**Exemplo 1: Organização por Cliente e Loja**
```
Pizza Hut
├── Loja Centro
│   ├── Tablet Caixa 1
│   └── Tablet Caixa 2
└── Loja Norte
    ├── Tablet Balcão
    └── Smartphone Gerente
```

**Exemplo 2: Organização por Departamento**
```
Escritório BWB
├── TI
│   ├── Tablet Desenvolvimento
│   └── Tablet Testes
└── Comercial
    ├── Tablet Vendas
    └── Tablet Atendimento
```

### Boas Práticas

✅ **Use nomes descritivos:**
- ❌ "Tablet 1"
- ✅ "Tablet Sala Principal - Samsung A54"

✅ **Agrupe logicamente:**
- Por localização física
- Por cliente
- Por departamento
- Por tipo de uso

✅ **Seja consistente:**
- Use sempre a mesma convenção de nomes
- Mantenha estrutura hierárquica clara

---

## 🔍 Pesquisa e Filtros

### Barra de Pesquisa

Procure dispositivos por:
- **ID RustDesk:** Ex: "1403938023"
- **Nome do dispositivo:** Ex: "Tablet"
- **Grupo ou subgrupo:** Ex: "Escritório"
- **Notas:** Qualquer texto nas notas

**Exemplo:**
- Digite "Samsung" → Mostra todos os devices com "Samsung" no nome
- Digite "Sala" → Mostra devices em grupos/subgrupos com "Sala"

### Ordenação

Ordene a lista por:
- **📅 Mais recentes:** Última conexão (mais recente primeiro)
- **📅 Mais antigos:** Última conexão (mais antigo primeiro)
- **🔤 Nome A-Z:** Ordem alfabética crescente
- **🔤 Nome Z-A:** Ordem alfabética decrescente
- **🔢 ID crescente:** ID RustDesk do menor para maior
- **🔢 ID decrescente:** ID RustDesk do maior para menor

### Filtros

**Clique em "🔧 Filtros" para mostrar opções:**

- **Todos:** Mostra todos os dispositivos
- **Adoptados:** Apenas devices com grupo definido
- **Por Adotar:** Apenas devices sem grupo (novos)

**Exemplo de uso:**
1. Seleccionar "Por Adotar"
2. Ver quantos devices novos existem
3. Processar adopção de cada um

---

## ⚙️ Perfil do Utilizador

Clique em **"Perfil"** no header para aceder às configurações.

### Informações da Conta

- **Email:** O seu email de login
- **Display Name:** Nome de exibição
- **Mesh Username:** Username no MeshCentral

### Alterar Password

1. Aceda ao perfil
2. Clique em **"Alterar Password"**
3. Introduza:
   - Password actual
   - Nova password
   - Confirmar nova password
4. Clique em **"Guardar"**

**Requisitos de password:**
- Mínimo 8 caracteres
- Pelo menos 1 maiúscula
- Pelo menos 1 número

### Preferência de Sistema Operativo e comandos RustDesk

No ecrã de perfil também podes indicar se trabalhas principalmente em **Windows** ou **macOS**. Esta preferência é usada apenas para te mostrar comandos e dicas para o RustDesk; não altera nenhum dado no servidor.

Se escolheres **Windows**, aparecem dois botões que copiam para a clipboard os comandos `winget`:

1. **Instalar RustDesk:**
   ```bash
   winget install --id RustDesk.RustDesk -e
   ```
2. **Atualizar RustDesk:**
   ```bash
   winget upgrade --id RustDesk.RustDesk -e
   ```

No **macOS**, o sistema assume que o RustDesk já está instalado; podes abrir uma ligação directamente pelo botão RustDesk no cartão do dispositivo ou, em linha de comandos, usar por exemplo:

```bash
open "rustdesk://connection/new/<ID>?password=<password>"
```

---

## 🔄 Gestão de Dispositivos

### Ver Detalhes

Cada dispositivo mostra:
- **Device ID:** Identificador único do RustDesk (ex: 1403938023)
- **Nome amigável:** Nome que você definiu
- **Grupo/Subgrupo:** Onde está organizado
- **Última conexão:** Quando foi visto pela última vez
- **Owner:** Utilizador proprietário (seu ID ou nome Mesh)
- **Password RustDesk (opcional):** Password guardada para facilitar a ligação via deep-link

Quando a password está preenchida, o botão **“Abrir no RustDesk”** usa um deep‑link do tipo:

```text
rustdesk://connection/new/<ID>?password=<password>
```

Se o campo estiver vazio/NULL, o deep‑link contém apenas o ID:

```text
rustdesk://connection/new/<ID>
```

e a password é introduzida manualmente no cliente RustDesk. Em todos os casos, assume‑se que o RustDesk está instalado e registou o esquema `rustdesk://` no sistema operativo.

O botão de abrir o RustDesk é um botão **quadrado**, com o logótipo do RustDesk, localizado à direita dos botões de **Editar** e **Apagar** no cartão do dispositivo.

### Expandir/Recolher Grupos

- Clique no **nome do grupo** para expandir/recolher
- Clique no **nome do subgrupo** para expandir/recolher
- Facilita navegação quando há muitos dispositivos

### Estados do Dispositivo

**Por Adotar (Amarelo):**
- Conectou recentemente
- Ainda sem grupo definido
- Requer acção do utilizador

**Adoptado (Verde):**
- Grupo e informações definidos
- Totalmente configurado

---

## 🔒 Segurança

### Sessões

- **Duração:** 1 hora de inatividade
- **Renovação:** Automática enquanto utilizar o sistema
- **Expiração:** Fará logout automático se inactivo

### Boas Práticas

✅ Faça logout ao terminar
✅ Não partilhe as suas credenciais
✅ Use password forte e única
✅ Mude a password regularmente

### Dispositivos Próprios vs. Partilhados

- Cada utilizador vê apenas os **seus** dispositivos
- Não é possível ver ou gerir devices de outros users
- Sistema isolado por segurança

---

## 📞 Troubleshooting

### Problema: QR Code não funciona

**Soluções:**
1. Verifique se a app RustDesk está actualizada
2. Certifique-se que tem boa iluminação
3. Tente gerar novo QR code
4. Verifique conexão internet do Android

### Problema: Dispositivo não aparece após escanear

**Soluções:**
1. Aguarde 10-15 segundos
2. Clique em **"🔍 Verificar Dispositivo"**
3. Se não aparecer, verifique:
   - Android tem internet?
   - App RustDesk está aberta?
   - QR code ainda válido? (5 min)

### Problema: Sessão de registo expirou

**Solução:**
1. Clique em **"Tentar Novamente"**
2. Escaneie o novo QR code mais rapidamente
3. Não feche a app RustDesk antes de verificar

### Problema: Não consigo fazer login

**Soluções:**
1. Verifique email e password
2. Tente reset de password
3. Aguarde 1 minuto e tente novamente
4. Contacte administrador se persistir

### Problema: Dashboard está vazio

**Causas possíveis:**
- Ainda não adicionou dispositivos
- Filtro activo (verifique filtros)
- Problema de conexão

**Solução:**
1. Verifique se tem internet
2. Desactive filtros (seleccionar "Todos")
3. Recarregue a página (F5)

---

## 💡 Dicas e Truques

### Adicionar Múltiplos Dispositivos

1. Prepare todos os Androids
2. Adicione um de cada vez
3. Use **"Adicionar Outro"** após cada sucesso
4. Não feche o modal entre dispositivos

### Organização Eficiente

1. **Planeie a estrutura primeiro:**
   - Quantos grupos?
   - Que subgrupos?
   - Convenção de nomes?

2. **Seja consistente:**
   - Todos em maiúsculas ou minúsculas
   - Mesma estrutura sempre
   - Ex: "Local | Área | Tipo"

3. **Use subgrupos sabiamente:**
   - Só quando realmente necessário
   - Evite mais de 2 níveis
   - Mantenha simples

### Pesquisa Rápida

**Atalhos úteis:**
- Digite parte do nome
- Use caracteres únicos
- Combine com filtros

**Exemplo:**
- Procurar "A54" → Todos Samsung A54
- Filtrar "Por Adotar" → Só novos

---

## 📚 Glossário

**Device ID:** Identificador único do RustDesk (ex: 1403938023)

**Friendly Name:** Nome amigável definido por você

**Grupo:** Categoria principal de organização

**Subgrupo:** Subcategoria dentro de um grupo

**Adoptar:** Processo de adicionar informações a um device novo

**Sessão de Registo:** Período de 5 minutos para escanear QR

**Matching Temporal:** Sistema que associa device ao user correcto

**Owner:** Utilizador proprietário do dispositivo

**Mesh Username:** Username no sistema MeshCentral

**JWT:** Token de autenticação (gerido automaticamente)

---

## 📊 Estatísticas e Limites

### Limites do Sistema

- **Dispositivos por utilizador:** Ilimitado (testado até 1000)
- **Sessões simultâneas:** Até 10 QR codes activos
- **Duração de sessão:** 5 minutos por QR code
- **Caracteres em nomes:** Até 255 caracteres
- **Caracteres em notas:** Até 1000 caracteres

### Performance

- **Carregamento inicial:** <2 segundos
- **Pesquisa:** Tempo real
- **Adicionar device:** 10-30 segundos total
- **Actualização:** Instantânea após adopção

---

## 🆘 Suporte

### Canais de Suporte

**Email:** suporte@bwb.pt

**Disponibilidade:**
- Segunda a Sexta: 09:00 - 18:00
- Resposta média: 2-4 horas

### Informação Útil para Suporte

Ao contactar suporte, forneça:
1. Email de login
2. Descrição do problema
3. Quando ocorreu
4. Steps para reproduzir
5. Screenshots (se possível)

---

## 👑 Funcionalidades Especiais para Administradores

Algumas funcionalidades só estão disponíveis para o **admin canónico** (conta técnica principal do sistema).

### Dispositivos sem Utilizador Atribuido

Quando o sistema não consegue associar um dispositivo a um utilizador específico (matching temporal falhou ou foi ambíguo), esse dispositivo é automaticamente:
- Atribuído internamente ao **admin**, e
- Mostrado numa secção especial do dashboard:

> 🧩 **Dispositivos sem Utilizador Atribuido**

Nessa secção, o admin pode:
- **Reatribuir** o dispositivo a outro utilizador (via `mesh_username`)
- **Apagar** (soft delete) o dispositivo

### Reatribuir Dispositivo (Admin)

1. Aceda ao dashboard com a conta de admin
2. Localize a secção **“Dispositivos sem Utilizador Atribuido”**
3. Clique em **“Reatribuir”** no dispositivo pretendido
4. Introduza o `mesh_username` do utilizador destino
5. Clique em **“Reatribuir”**

O dispositivo:
- Passa a pertencer ao utilizador indicado
- Volta a aparecer na área **“Por Adotar”** desse utilizador
- Pode então ser adoptado normalmente (grupo/subgrupo/nome)

### Apagar Dispositivo (Admin)

1. Na secção **“Dispositivos sem Utilizador Atribuido”**
2. Clique em **“Apagar”** no dispositivo pretendido
3. Confirme a ação

O dispositivo será marcado como **soft delete** e deixará de aparecer no dashboard.

> ⚠️ Esta ação não remove dados históricos da base de dados, apenas o torna invisível para uso normal.

### Gestão de Utilizadores (Authentication → Users)

Além da gestão de dispositivos, o admin canónico também tem acesso a uma secção dedicada para gerir os utilizadores de autenticação (Supabase Auth).

#### Como aceder

1. Inicie sessão com a conta de admin (`suporte@bwb.pt`)
2. No header do dashboard, clique em **“Gestão de Utilizadores”**

Isto abre uma página específica de administração onde pode ver e gerir os registos de `auth.users` e a respetiva associação em `mesh_users`.

#### O que é possível fazer

Na secção **Gestão de Utilizadores**, o admin pode:

- **Listar utilizadores**:
  - Ver email
  - Nome de exibição (user_metadata.display_name / mesh_users.display_name)
  - `mesh_username` associado
  - Data de criação
  - Último login
  - Estado:
    - Ativo
    - Pendente (email não confirmado)
    - Bloqueado

- **Criar novo utilizador**:
  - `email` (obrigatório)
  - `password` inicial (obrigatório)
  - `display_name` (opcional)
  - `mesh_username` (obrigatório; o utilizador já deve existir no MeshCentral, aqui é apenas criada a associação em `mesh_users`)
  - Flag “email confirmado” (opcional)

- **Editar utilizador existente**:
  - Alterar `email`
  - Definir uma nova `password` (reset pela equipa de suporte)
  - Atualizar `display_name`
  - Atualizar `mesh_username` (apenas a associação; não cria ninhem no Mesh)
  - Marcar/desmarcar “email confirmado”
  - Bloquear / desbloquear utilizador (ban)

- **Apagar utilizador**:
  - Remove o registo em `auth.users`
  - Apaga automaticamente o mapeamento em `mesh_users` (ON DELETE CASCADE)
  - Todos os dispositivos desse utilizador ficam órfãos (`owner = NULL`) e passam a aparecer na secção “Dispositivos sem Utilizador Atribuido” para triagem manual

> ⚠️ Atenção:
> - Esta gestão actua directamente sobre o painel **Authentication → Users** do Supabase.
> - O sistema **não cria** utilizadores no MeshCentral; assume que o `mesh_username` já existe e limita‑se a sincronizar a associação em `mesh_users`.
> - Como medida de segurança, apenas o admin canónico tem acesso a esta área e às Edge Functions `admin-*` de utilizadores.

### O que o admin **não** pode fazer

A conta de administração é uma conta **técnica**, focada em triagem e gestão, não em uso diário:

- Não pode iniciar o fluxo de **“+ Adicionar Dispositivo”** via QR code.
- Não pode usar o ecrã de **Provisionamento sem QR** (`/provisioning`) para gerar códigos de instalação.
- Não pode **adoptar** novos dispositivos nem **editar** metadata (grupo, subgrupo, observações, password RustDesk) de dispositivos adoptados.
- Pode:
  - Ver todos os dispositivos relevantes.
  - Reatribuir dispositivos na secção “Dispositivos sem Utilizador Atribuido”.
  - Apagar (soft delete) dispositivos quando necessário.
  - Gerir utilizadores em `auth.users` e respetivos mappings em `mesh_users`.

Para registar/adoptar dispositivos e gerir grupos/observações no dia‑a‑dia, usa sempre uma conta de técnico/loja (não a conta de administração).

---

**Última Actualização:** 13 Dezembro 2025  
**Versão do Sistema:** 0.1.0  
**Equipa de Suporte:** BWB · Datalink · ZSA Softwares