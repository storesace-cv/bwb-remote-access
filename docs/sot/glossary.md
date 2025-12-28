# Glossary - Technical Terms

**Última Atualização:** 13 Dezembro 2025

## 📖 Termos Técnicos

---

## A

**Adopt / Adoptar**
Processo de adicionar informações (nome, grupo, subgrupo) a um device que já está associado a um utilizador mas ainda não tem organização completa.

**Anon Key**
Chave pública do Supabase que pode ser exposta ao frontend. Limitada por RLS.

**Auth**
Sistema de autenticação (Supabase Auth).

---

## C

**CORS (Cross-Origin Resource Sharing)**
Mecanismo que permite requests de diferentes origens. Necessário para frontend chamar Edge Functions.

**CSP (Content Security Policy)**
Header HTTP que previne XSS attacks.

---

## D

**Device ID**
Identificador único do dispositivo RustDesk (ex: "1403938023").

**Device State**
Estado de um dispositivo: Órfão, Por Adotar, ou Adoptado.

---

## E

**Edge Function**
Função serverless deployada no Supabase (runtime Deno).

---

## F

**Friendly Name**
Nome amigável do dispositivo (ex: "Tablet Sala Principal").

---

## G

**Group / Grupo**
Primeira nível de organização de devices (ex: "Escritório", "Pizza Hut").

**Grouping**
Sistema hierárquico de organização: Grupo → Subgrupo → Devices.

---

## J

**JWT (JSON Web Token)**
Token de autenticação usado para validar utilizadores.

---

## M

**Matching Temporal**
Algoritmo que associa devices órfãos a utilizadores baseado em janelas de tempo.

**Mesh User**
Registo que mapeia auth.users → MeshCentral username.

**MeshCentral**
Sistema de gestão remota (não usado activamente neste projeto mas referenciado).

---

## N

**Notes**
Campo de texto livre usado para armazenar "Grupo | Subgrupo".

---

## O

**On-Demand**
Operação que só ocorre quando user explicitamente pede (vs. automático).

**Orphan Device / Device Órfão**
Device que conectou ao RustDesk server mas ainda não foi associado a nenhum utilizador (`owner=null`).

**Owner**
UUID do mesh_user que "possui" o device.

---

## Q

**QR Code**
Código de barras 2D usado para configurar RustDesk no Android.

---

## R

**Registration Session**
Sessão temporal de 5 minutos que permite matching temporal.

**Registration Token**
Token temporário usado para associar device a user durante setup inicial.

**RLS (Row Level Security)**
Feature do PostgreSQL que filtra automaticamente dados baseado no utilizador.

**RustDesk**
Software de remote desktop de código aberto.

---

## S

**Service Role Key**
Chave privada do Supabase com acesso total. **NUNCA** expor ao frontend.

**Session**
- Auth session: Sessão de login (1 hora)
- Registration session: Sessão de registro (5 minutos)

**Subgroup / Subgrupo**
Segundo nível de organização (ex: "Sala 1", "Loja Centro").

**Sync Engine**
Sistema que sincroniza devices entre RustDesk server e Supabase.

---

## T

**Temporal Window / Janela Temporal**
Período de tempo usado para matching (10 minutos antes do clique).

---

## U

**Unadopted / Por Adotar**
Device associado a user mas sem informações completas (notes vazio).

**User JWT**
JWT de utilizador normal (role: authenticated).

---

**Próxima Revisão:** Quando novos termos forem introduzidos