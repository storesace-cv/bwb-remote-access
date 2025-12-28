# Roadmap Técnico

**Última Atualização:** 13 Dezembro 2025  
**Versão:** 1.0.0

## 🗺️ Planeamento de Features e Melhorias

---

## Versão Actual: v0.1.0 ✅

### Funcionalidades Implementadas

- ✅ Autenticação via Supabase (email/password)
- ✅ Dashboard com lista de devices
- ✅ Sistema de registro via QR code
- ✅ Matching temporal on-demand
- ✅ Adopção manual de devices
- ✅ Sistema de grouping hierárquico (Grupo | Subgrupo)
- ✅ Filtros e ordenação de devices
- ✅ Password reset flow
- ✅ Logging estruturado
- ✅ RLS (Row Level Security)
- ✅ Sistema de permissões granulares (Agente → Colaborador → Grupos)
- ✅ Gestão de colaboradores (ativação, desativação)
- ✅ Suporte para minisiteadmin (gestão de colaboradores por domínio)
- ✅ Auditoria de permissões (histórico de concessões/revogações)

### Correções Recentes (23 Dezembro 2025)

#### 🐛 Bug Fix: Gestão de Permissões - Dropdown Vazio
**Problema identificado:**
- Quando um AGENT ativava um candidato para colaborador, os campos `parent_agent_id` e `agent_id` não eram definidos corretamente
- Colaboradores ficavam órfãos ou atribuídos ao MINISITEADMIN em vez do AGENT
- Dropdown de colaboradores aparecia vazio na página "Gestão de Permissões"

**Solução implementada:**
1. ✅ Edge Function `admin-update-auth-user` corrigida para definir `parent_agent_id` e `agent_id` quando promove candidato → colaborador
2. ✅ Dados históricos corrigidos (colaboradores existentes reatribuídos aos AGENTs corretos)
3. ✅ Validação adicional para prevenir problema no futuro

**Impacto:** AGENTs agora conseguem conceder permissões aos seus colaboradores sem problemas.

#### 🌳 Feature: Permissões Hierárquicas
**Problema identificado:**
- Sistema de permissões não considerava hierarquia de grupos
- Era necessário conceder permissão em cada subgrupo individualmente
- Não havia herança automática de permissões

**Solução implementada:**
1. ✅ Criada função SQL `get_descendant_groups()` - retorna todos os descendentes de um grupo
2. ✅ Criada função SQL `has_group_access()` - verifica acesso com herança hierárquica
3. ✅ Criada função SQL `get_visible_groups_with_inheritance()` - retorna grupos visíveis com herança
4. ✅ Criada função SQL `get_accessible_devices_for_collaborator()` - retorna devices acessíveis com herança
5. ✅ Atualizadas RLS policies para usar lógica hierárquica
6. ✅ UI atualizada para mostrar hierarquia visualmente (indentação + ícones)
7. ✅ Adicionada função `check_permission_conflicts()` para detectar permissões redundantes

**Comportamento:**
- **Permissão no grupo PAI** → Acesso automático a TODOS os subgrupos
  - Exemplo: Permissão "Zonetech" → acesso a Zonetech + Santiago + Praia + S. Vicente
- **Permissão em subgrupo ESPECÍFICO** → Acesso apenas a esse subgrupo
  - Exemplo: Permissão "Santiago" → acesso apenas a Santiago
  - Exemplo: Permissão "Santiago + Praia" → acesso apenas a esses 2 (S. Vicente fica de fora)

**Impacto:** Sistema de permissões agora reflete corretamente a estrutura hierárquica de grupos, facilitando gestão e evitando redundância.

---

## v0.2.0 - Melhorias UX/UI (Q1 2026)

### Features Planeadas

#### 1. Profile Management
- [ ] Editar informações de perfil
- [ ] Alterar password (sem email)
- [ ] Ver histórico de actividade

#### 2. Device Details Page
- [ ] Página dedicada por device
- [ ] Histórico de conexões
- [ ] Estatísticas de uso
- [ ] Editar inline (nome, grupo, notas)

#### 3. Bulk Operations
- [ ] Selecionar múltiplos devices
- [ ] Mover devices entre grupos (bulk)
- [ ] Eliminar múltiplos devices
- [ ] Exportar devices (CSV, JSON)

#### 4. Search Enhancements
- [ ] Filtros avançados (data, grupo, status)
- [ ] Saved searches
- [ ] Quick filters (últimos 7 dias, sem grupo, etc.)

#### 5. Real-time Updates
- [ ] Supabase Realtime para devices
- [ ] Notificação quando device conecta
- [ ] Live status indicators

---

## v0.3.0 - Performance & Scale (Q2 2026)

### Melhorias de Performance

#### 1. React Query Integration
- [ ] Cache de devices list
- [ ] Background refetch
- [ ] Optimistic updates
- [ ] Invalidation inteligente

#### 2. Pagination
- [ ] Server-side pagination
- [ ] Infinite scroll (opcional)
- [ ] Virtual scrolling para listas grandes

#### 3. Lazy Loading
- [ ] Code splitting por rota
- [ ] Lazy load modals
- [ ] Dynamic imports

#### 4. Database Optimization
- [ ] Review indexes
- [ ] Query optimization
- [ ] Connection pooling tuning
- [ ] Materialized views (se necessário)

---

## v0.4.0 - Advanced Features (Q3 2026)

### Features Avançadas

#### 1. Automatic Registration
- [ ] Polling automático (opcional, configurável)
- [ ] Webhook do RustDesk server
- [ ] Push notifications via PWA

#### 2. Analytics Dashboard
- [ ] Total devices por utilizador
- [ ] Devices activos vs inativos
- [ ] Conexões por dia/semana/mês
- [ ] Charts com Recharts

#### 3. Collaboration
- [ ] Partilhar devices entre users (read-only)
- [ ] Team management
- [ ] Role-based access (viewer, editor, admin)

#### 4. API Pública
- [ ] REST API documentada
- [ ] API keys management
- [ ] Rate limiting
- [ ] Webhooks para external systems

---

## v0.5.0 - Security & Compliance (Q4 2026)

### Melhorias de Segurança

#### 1. Enhanced Auth
- [ ] 2FA (Two-Factor Authentication)
- [ ] SSO (Single Sign-On) via SAML
- [ ] OAuth providers (Google, Microsoft)
- [ ] Session management (view/revoke sessions)

#### 2. Audit Logging
- [ ] Comprehensive audit trail
- [ ] Export audit logs
- [ ] User activity dashboard
- [ ] Compliance reports

#### 3. Data Privacy
- [ ] GDPR compliance tools
- [ ] Data export (user request)
- [ ] Data deletion (user request)
- [ ] Cookie consent management

#### 4. Security Headers
- [ ] CSP implementation
- [ ] HSTS enforcement
- [ ] Additional security headers
- [ ] Security.txt

---

## v1.0.0 - Production Grade (2027)

### Enterprise Features

#### 1. Multi-tenancy
- [ ] Organization management
- [ ] Multiple teams per org
- [ ] Billing per organization
- [ ] Custom branding

#### 2. Advanced Monitoring
- [ ] Uptime monitoring
- [ ] Performance metrics
- [ ] Error tracking (Sentry)
- [ ] Custom alerts

#### 3. Backup & Recovery
- [ ] Automated backups
- [ ] Point-in-time recovery
- [ ] Disaster recovery plan
- [ ] Data redundancy

#### 4. Internationalization
- [ ] Multi-language support
- [ ] Locale-based formatting
- [ ] Timezone handling
- [ ] Currency support

---

## Technical Debt & Refactoring

### High Priority

- [ ] Migrate localStorage JWT to HttpOnly cookies
- [ ] Implement comprehensive error boundaries
- [ ] Add unit tests (Jest + React Testing Library)
- [ ] Add E2E tests (Playwright)
- [ ] Implement rate limiting
- [ ] Add input sanitization library

### Medium Priority

- [ ] Refactor large components (>350 lines)
- [ ] Extract custom hooks
- [ ] Centralize API calls
- [ ] Improve TypeScript coverage (strict mode)
- [ ] Add Storybook for components

### Low Priority

- [ ] Dark mode theme
- [ ] Improve mobile responsiveness
- [ ] Add animations (Framer Motion)
- [ ] Keyboard shortcuts
- [ ] Accessibility audit

---

## Infrastructure Improvements

### DevOps

- [ ] CI/CD pipeline improvements
- [ ] Automated testing in CI
- [ ] Preview deployments for PRs
- [ ] Automated dependency updates

### Monitoring

- [ ] Application Performance Monitoring (APM)
- [ ] Log aggregation (Datadog, LogRocket)
- [ ] Error tracking (Sentry)
- [ ] Custom metrics dashboard

### Documentation

- [ ] API documentation (OpenAPI/Swagger)
- [ ] Component documentation (Storybook)
- [ ] Video tutorials
- [ ] Developer onboarding guide

---

## Ideas Backlog (Not Prioritized)

### User Requests

- [ ] Mobile app (React Native)
- [ ] Desktop app (Electron)
- [ ] Browser extension
- [ ] CLI tool for device management

### Experimental

- [ ] AI-powered device naming suggestions
- [ ] Anomaly detection (unusual connection patterns)
- [ ] Predictive maintenance alerts
- [ ] Automated device grouping (ML)

---

## Deprecated / Removed Features

### To be Removed

- ⚠️ MeshCentral integration (já não usado)
  - Remove `mesh_username` references (futuro)
  - Simplify `mesh_users` table

### Breaking Changes (Future)

- **v2.0.0**: Migrate to HttpOnly cookies (breaking: localStorage removed)
- **v2.0.0**: API versioning (v2 endpoints)
- **v2.0.0**: New authentication flow (OAuth 2.0)

---

## Release Schedule

| Version | Target Date | Status | Focus |
|---------|-------------|--------|-------|
| v0.1.0 | 2025-12 | ✅ Released | Core functionality |
| v0.2.0 | 2026-Q1 | 📋 Planned | UX/UI improvements |
| v0.3.0 | 2026-Q2 | 📋 Planned | Performance & scale |
| v0.4.0 | 2026-Q3 | 📋 Planned | Advanced features |
| v0.5.0 | 2026-Q4 | 📋 Planned | Security & compliance |
| v1.0.0 | 2027 | 💭 Concept | Enterprise ready |

---

## Contributing

### How to Propose Features

1. Open GitHub issue with `[Feature Request]` label
2. Describe use case and benefits
3. Discuss implementation approach
4. Get approval from maintainers
5. Create PR with implementation

### Priority Criteria

**High Priority:**
- Security vulnerabilities
- Performance issues
- User-blocking bugs

**Medium Priority:**
- User-requested features
- UX improvements
- Documentation

**Low Priority:**
- Nice-to-have features
- Experimental ideas
- Code refactoring

---

## Success Metrics

### v0.2.0 Goals

- [ ] <1s load time for dashboard
- [ ] <100ms API response time (p95)
- [ ] >95% uptime
- [ ] <5 bugs per release

### v1.0.0 Goals

- [ ] Support 10,000+ devices per user
- [ ] Support 1,000+ concurrent users
- [ ] <500ms API response time (p99)
- [ ] 99.9% uptime SLA

---

**Próxima Revisão:** Trimestralmente ou após major releases