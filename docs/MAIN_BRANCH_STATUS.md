# Main branch status

**Data:** 2025-12-07

## Visão geral
- As branches `main` e `my-rustdesk-mesh-integration` são as únicas linhas de desenvolvimento activas e apontam para o commit mais recente desta linha de desenvolvimento (ver `git rev-parse --short HEAD`).
- Não existem outras branches locais ou remotas com divergências conhecidas neste repositório.
- O repositório continua alinhado com o SoT humano em `docs/sot/` e com as notas de versão em `.github/release-notes/`.

## Fontes de verdade e documentação
- **SoT:** `docs/sot/README.md` descreve a estrutura e o índice completo das especificações funcionais, contratos, integrações e playbook operacional.
- **Notas de versão:** `.github/release-notes/v0.1.0.md` documenta o estado actual (Edge Functions, migração Supabase, scripts de deploy).
- **Guias operacionais:** consulte `docs/DEPLOY_DROPLET.md`, `docs/SETUP_LOCAL.md` e `docs/ROADMAP.md` para fluxos de deploy, desenvolvimento local e tarefas em aberto.

## Política de branches
- `main` é a base canónica para código, documentação, migrações e scripts. Qualquer alteração deve alinhar com o SoT e ser reflectida na documentação relevante.
- `my-rustdesk-mesh-integration` é a única branch paralela permitida neste momento; mantenha-a fast-forward com `main` sempre que necessário para evitar divergências.
- Não devem existir outras branches activas; elimine branches antigas ou experimentais para reduzir a complexidade.

## Resumo desta sincronização
- `main` e `my-rustdesk-mesh-integration` permanecem sincronizadas e são as únicas branches mantidas.
- README e documentação continuam a apontar para o SoT real (`docs/sot/`) e para as notas de versão em `.github/release-notes/`.
- Este ficheiro confirma que `main` permanece a fonte canónica e actualizada de acordo com o SoT, com `my-rustdesk-mesh-integration` como branch auxiliar dedicada.
