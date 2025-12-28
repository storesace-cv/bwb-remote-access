# 📚 Documentação - RustDesk Mesh Integration

**Versão:** 1.0.0  
**Última Atualização:** 13 Dezembro 2025

## 🎯 Navegação Rápida

### Para Utilizadores
- **[Manual do Utilizador](USER_GUIDE.md)** - Como usar a aplicação
- **[Troubleshooting](TROUBLESHOOTING.md)** - Resolução de problemas comuns

### Para Desenvolvedores
- **[Arquitetura](ARCHITECTURE.md)** - Visão geral da arquitetura
- **[API Reference](API_REFERENCE.md)** - Documentação completa das APIs
- **[Deployment](DEPLOYMENT.md)** - Guia de deployment

### Source of Truth (SoT)
Documentação técnica detalhada em **[docs/sot/](sot/README.md)**

---

## 📖 Documentação por Área

### 🏗️ Arquitetura e Design

| Documento | Descrição | Para quem? |
|-----------|-----------|------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Visão geral da arquitetura do sistema | Developers, DevOps |
| [sot/architecture.md](sot/architecture.md) | Arquitetura técnica detalhada | Senior Developers |
| [sot/data-models.md](sot/data-models.md) | Modelos de dados e esquema BD | Backend Developers |

### 🔌 APIs e Integrações

| Documento | Descrição | Para quem? |
|-----------|-----------|------------|
| [API_REFERENCE.md](API_REFERENCE.md) | Referência completa das APIs | Developers |
| [sot/api-contracts.md](sot/api-contracts.md) | Contratos formais de API | API Developers |
| [sot/supabase-integration.md](sot/supabase-integration.md) | Integração com Supabase | Backend Developers |

### 🖥️ Frontend

| Documento | Descrição | Para quem? |
|-----------|-----------|------------|
| [USER_GUIDE.md](USER_GUIDE.md) | Manual de utilizador | End Users |
| [sot/frontend-behaviour.md](sot/frontend-behaviour.md) | Lógica e comportamentos do frontend | Frontend Developers |

### 🔐 Segurança

| Documento | Descrição | Para quem? |
|-----------|-----------|------------|
| [sot/security-and-permissions.md](sot/security-and-permissions.md) | Modelo de segurança e permissões | Security Engineers, DevOps |

### 🔄 Sync Engine

| Documento | Descrição | Para quem? |
|-----------|-----------|------------|
| [sot/sync-engine.md](sot/sync-engine.md) | Sistema de matching temporal | Backend Developers |

### 🚀 Deployment e Operações

| Documento | Descrição | Para quem? |
|-----------|-----------|------------|
| [DEPLOYMENT.md](DEPLOYMENT.md) | Guia de deployment | DevOps |
| [sot/operational-playbook.md](sot/operational-playbook.md) | Manual operacional diário | DevOps, Support |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Resolução de problemas | Support, Users |

### 📝 Outros

| Documento | Descrição | Para quem? |
|-----------|-----------|------------|
| [sot/glossary.md](sot/glossary.md) | Glossário de termos técnicos | Everyone |
| [sot/roadmap.md](sot/roadmap.md) | Roadmap de features futuras | Product Managers, Developers |
| [sot/meshcentral-integration.md](sot/meshcentral-integration.md) | Referência histórica (não usado) | Context |

---

## 🎓 Guias de Início Rápido

### Para Novos Desenvolvedores

1. Ler [README.md](../README.md) - Overview do projeto
2. Ler [ARCHITECTURE.md](ARCHITECTURE.md) - Entender a arquitetura
3. Ler [sot/data-models.md](sot/data-models.md) - Entender a base de dados
4. Ler [API_REFERENCE.md](API_REFERENCE.md) - Conhecer as APIs
5. Seguir [DEPLOYMENT.md](DEPLOYMENT.md) - Setup local

### Para Novos Utilizadores

1. Ler [README.md](../README.md) - O que é o projeto
2. Ler [USER_GUIDE.md](USER_GUIDE.md) - Como usar
3. Consultar [TROUBLESHOOTING.md](TROUBLESHOOTING.md) se houver problemas

### Para DevOps

1. Ler [DEPLOYMENT.md](DEPLOYMENT.md) - Deploy completo
2. Ler [sot/operational-playbook.md](sot/operational-playbook.md) - Operações diárias
3. Ler [sot/supabase-integration.md](sot/supabase-integration.md) - Configuração Supabase

---

## 📊 Estrutura da Documentação

```
docs/
├── INDEX.md                        # Este ficheiro
├── README.md → ../README.md       # Overview do projeto
├── ARCHITECTURE.md                 # Arquitetura (resumo)
├── API_REFERENCE.md               # APIs (resumo)
├── USER_GUIDE.md                  # Manual utilizador
├── TROUBLESHOOTING.md             # Troubleshooting
├── DEPLOYMENT.md                  # Deployment guide
│
└── sot/                           # Source of Truth
    ├── README.md                  # Índice SoT
    ├── architecture.md            # Arquitetura detalhada
    ├── data-models.md             # Modelos de dados
    ├── api-contracts.md           # Contratos API
    ├── frontend-behaviour.md      # Frontend logic
    ├── sync-engine.md             # Matching temporal
    ├── supabase-integration.md    # Integração Supabase
    ├── security-and-permissions.md # Segurança
    ├── operational-playbook.md    # Operações
    ├── roadmap.md                 # Roadmap
    ├── glossary.md                # Glossário
    └── meshcentral-integration.md # Histórico
```

---

## 🔍 Como Encontrar Informação

### "Como funciona o login?"
→ [API_REFERENCE.md](API_REFERENCE.md#post-apilogin)  
→ [sot/api-contracts.md](sot/api-contracts.md#post-apilogin)

### "Como registar um dispositivo?"
→ [USER_GUIDE.md](USER_GUIDE.md#registar-novo-dispositivo)  
→ [sot/sync-engine.md](sot/sync-engine.md)

### "Qual é o esquema da base de dados?"
→ [sot/data-models.md](sot/data-models.md)

### "Como fazer deploy?"
→ [DEPLOYMENT.md](DEPLOYMENT.md)

### "Como resolver erro X?"
→ [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

### "O que é matching temporal?"
→ [sot/sync-engine.md](sot/sync-engine.md)  
→ [sot/glossary.md](sot/glossary.md#matching-temporal)

---

## 📝 Convenções de Documentação

### Formato
- Todos os documentos em Markdown
- Headers H2 (`##`) para secções principais
- Headers H3 (`###`) para subsecções
- Code blocks com syntax highlighting
- Tabelas para comparações e listas estruturadas

### Metadata
Todos os documentos técnicos incluem:
```markdown
**Versão:** X.Y.Z
**Última Atualização:** DD Mês AAAA
**Status:** [Status]
```

### Emojis para Navegação Rápida
- 📐 Arquitetura
- 🔌 APIs
- 🖥️ Frontend
- 🔐 Segurança
- 🚀 Deployment
- 📊 Dados
- 🔄 Sync
- 📝 Documentação

---

## 🔄 Manutenção da Documentação

### Quando Atualizar

**Obrigatório:**
- Mudanças de API (breaking changes)
- Novas features
- Mudanças de arquitetura
- Mudanças no fluxo de deployment

**Recomendado:**
- Bug fixes significativos
- Melhorias de performance
- Novos troubleshooting tips

### Processo de Atualização

1. Identificar documentos afetados
2. Atualizar conteúdo técnico
3. Atualizar data "Última Atualização"
4. Incrementar versão se breaking change
5. Commit com mensagem descritiva

### Responsáveis
- **Architecture docs:** Backend Lead
- **API docs:** API developers
- **User Guide:** Product Manager
- **Deployment:** DevOps
- **SoT:** Maintainers

---

## 📞 Suporte

**Para questões sobre a documentação:**
- Abrir issue no GitHub com label `documentation`
- Contactar maintainers do projeto

**Para questões sobre o produto:**
- Consultar [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- Consultar [USER_GUIDE.md](USER_GUIDE.md)

---

**Última Revisão:** 13 Dezembro 2025