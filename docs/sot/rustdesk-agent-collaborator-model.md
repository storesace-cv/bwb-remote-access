RustDesk Agent–Collaborator Model (Technical Source of Truth)

Document ID: docs/sot/rustdesk-agent-collaborator-model.md

Canonical Name: RustDesk Agent–Collaborator Model SoT

1. Purpose

This document defines a multi‑tenant Agent → Collaborator model for the RustDesk Mesh integration.
It is intended as a Source of Truth (SoT) for implementation by an automated engineering agent (Softgen.ai).

The goal is to extend the current RustDesk user model so that:

Existing users become Agents.

Agents can create and manage Collaborators.

Collaborators are technically identical users (MeshCentral + Supabase), but with restricted scope and permissions.

No implementation decisions are enforced here; this document describes constraints, invariants, and expected behaviour.

2. Definitions

Agent

A top‑level user.

Can create collaborators.

Can create and manage groups and sub‑groups.

Can manage all devices created by themselves or by their collaborators.

Can grant and revoke collaborator visibility to groups/sub‑groups.

Collaborator

A user created by an Agent.

Cannot create other users.

Can create groups/sub‑groups and devices only within the scope of the Agent.

Can only see devices and groups explicitly permitted by the Agent.

Visibility can be revoked at any time by the Agent, including for groups originally created by the collaborator.

Group / Sub‑Group

Logical containers used to assign permissions.

Permissions are granted per group, not per device.

Devices always belong to exactly one group or sub‑group.

3. Core Principles

Single user type, multiple rolesAgents and collaborators are stored in the same tables and systems (MeshCentral + Supabase).

Strict tenant isolation

Agents never see users or devices from other agents.

Collaborators never see users or devices from other collaborators unless explicitly permitted.

Agent supremacy

Agents can always see and manage everything created by their collaborators.

Agents can revoke access at any time.

Group‑based permissions

Permissions are assigned at group or sub‑group level.

No direct per‑device permission assignments.

Reversible permissions

Permission revocation must not delete data.

Historical auditability is preserved.

4. Data Model (Conceptual)

Users (mesh_users)

All users exist in a single table.

Suggested logical attributes:

id

auth_user_id (Supabase Auth)

mesh_username

user_type → agent | colaborador | inactivo | candidato (normalized lowercase)

parent_agent_id (nullable; set only for colaboradores)

Standard metadata (email, display_name, role, etc.)

User Type Hierarchy (Normalized):

siteadmin → Super-admin global (topo absoluto)
  - Acesso total a todos os domínios
  - Pode criar/editar/eliminar qualquer utilizador

minisiteadmin → Super-admin de domínio (NOVO em 22 Dez 2025)
  - Vê e gere TODO O SEU DOMÍNIO
  - Equivalente a siteadmin mas restrito ao domínio
  - Pode criar/editar/eliminar qualquer utilizador do seu domínio
  - Isolado ao seu domínio via RLS/Edge Functions

agent → Top tier, can create collaborators
  - Pode criar colaboradores no seu tenant
  - Vê e gere tudo no seu domínio/tenant

colaborador → Active collaborator with Supabase account
  - Criado por um agent ou minisiteadmin
  - Tem conta Supabase ativa
  - Vê apenas grupos/devices com permissão explícita

inactivo → Deactivated collaborator (preserved for audit trail)
  - Tinha conta Supabase mas foi desativado
  - Não tem acesso ao sistema

candidato → Candidate without Supabase account (default, exists only in MeshCentral)
  - Existe no MeshCentral
  - Não tem conta Supabase (auth_user_id = NULL)
  - Pode ser promovido a "colaborador" por um agent/minisiteadmin

Separation of Concerns:

mesh_users.role → MeshCentral permissions (SUPERADMIN, LIMITED_ADMIN, USER)
mesh_users.user_type → App status/permissions (agent, colaborador, inactivo, candidato)

Groups (mesh_groups)

id

agent_id (owning agent)

owner_user_id (creator; may be collaborator)

parent_group_id (nullable)

Devices (mesh_devices)

id

agent_id

owner_user_id

group_id

Group Permissions (mesh_group_permissions)

Join table defining collaborator visibility:

agent_id

collaborator_id

group_id

permission (e.g. view, manage)

granted_at

revoked_at (nullable)

5. Behavioural Rules

User Creation

Only Agents can create Collaborators.

When a collaborator is created:

A MeshCentral user is created (if needed).

A Supabase user row is created with user_type=colaborador and parent_agent_id set.

Candidates (candidato) are promoted to colaborador when activated by an Agent.

Group Visibility

Collaborators see:

Groups explicitly granted by the Agent.

Groups they created themselves, until revoked.

Device Visibility

Collaborators see devices only through visible groups.

Agents see all devices linked to their agent_id.

Revocation

Revoking a permission:

Immediately removes collaborator visibility.

Does not delete groups or devices.

Changes user_type to inactivo (preserves audit trail).

6. Security & RLS Expectations

The implementation is expected to rely on Row Level Security (RLS) to enforce:

Agents:

Full access to rows where agent_id = auth.agent_id.

Collaborators (colaborador):

Access limited to:

Rows they own.

Rows linked to groups for which an active permission exists.

Inactive (inactivo) and Candidates (candidato):

No access to app resources.

No client‑side filtering must be relied upon for isolation.

7. MeshCentral Integration Expectations

MeshCentral remains the authoritative system for:

User existence

Device registration

Supabase remains the authoritative system for:

Hierarchy (Agent ↔ Collaborator)

Permissions

Visibility rules

user_type status (agent, colaborador, inactivo, candidato)

Synchronization scripts must respect this separation.

8. Non‑Goals

No cross‑agent collaboration.

No collaborator‑to‑collaborator permissions.

No per‑device permission model.

9. Open Design Space

The following are intentionally left to the implementing agent:

Exact table naming.

Indexing strategy.

Whether permissions inherit automatically to sub‑groups.

UI/UX representation in the RustDesk frontend.

End of Source of Truth.