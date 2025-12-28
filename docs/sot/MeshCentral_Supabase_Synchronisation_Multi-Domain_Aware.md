Technical Design Document

MeshCentral → Supabase Synchronisation (Multi-Domain Aware)

⸻

1. Context and Goal

The RustDesk application integrates with a MeshCentral server to retrieve user metadata and persist it in Supabase (mesh_users table).

MeshCentral is configured in multi-domain mode, meaning that:
	•	Users are scoped to domains
	•	The same username may exist in multiple domains
	•	Domains are first-class entities, not labels
	•	User visibility and management are domain-dependent
	•	MeshCentral is append-only internally (updates create new record versions)

The objective of this document is to define a correct, domain-aware synchronisation model that:
	•	Accurately mirrors MeshCentral’s internal logic
	•	Avoids phantom users, invisible users, and duplicate confusion
	•	Remains safe, idempotent, and resilient to change
	•	Supports future domain growth without schema changes

MeshCentral is the authoritative source of truth.

⸻

2. MeshCentral User Model (Observed Reality)

2.1 User Identity (Critical Distinction)

In MeshCentral, a user is identified by three independent concepts:

Concept	Purpose
_id	Internal immutable identifier
domain	Functional domain membership
realms / adminrealms	Authorisation scoping

Internal User ID

user/<domain_key>/<username>

Examples:

user//admin                         → default domain
user/zonetech/datalink@gmail.com
user/zsangola/amadeu.cristelo@gmail.com

Key facts:
	•	The default domain is represented as:
	•	domain_key = "" (empty string)
	•	_id does NOT determine visibility
	•	_id alone is insufficient to infer domain membership

⸻

2.2 The domain Field (Root Cause of Visibility Issues)

This field is mandatory for correct behaviour.

Observed behaviour:
	•	If domain is:
	•	undefined
	•	"" (empty)
	•	Then the user is treated as belonging to the default domain

MeshCentral’s Users UI filters users by:

user.domain === currentDomain

Not by:
	•	_id
	•	realms
	•	siteadmin

Consequence
A user can:
	•	Authenticate correctly
	•	Exist in the DB
	•	Have correct realms

…and still be invisible in the Users list
if domain is missing or incorrect

⸻

2.3 User State

A user may be in one of three logical states:

State	Representation
Active	disabled absent or false
Disabled	disabled = 1
Deleted	Record no longer exists

Important observations:
	•	Disabled users still exist and must be synced
	•	Deleted users are destructive
	•	Updates create new record versions, not in-place edits

⸻

2.4 Privilege Model

MeshCentral permissions are bitmask-based, not boolean.

Field	Meaning
siteadmin = 4294967295	Global admin (all domains)
siteadmin > 0	Elevated / power user
siteadmin = 0 or undefined	Regular user

Additional scoping:
	•	domainadmin (bitmask, domain-scoped)
	•	adminrealms (object keyed by domain)

Visibility ≠ Permission

Permissions allow actions
Visibility depends on domain

⸻

3. Supabase Data Model – Required Evolution

3.1 Existing Table (Simplified)

mesh_users (
  id,
  username,
  email,
  name,
  is_admin,
  created_at,
  updated_at
)


⸻

3.2 Required Schema (Corrected)

✅ **IMPLEMENTADO E VALIDADO** (2025-12-19)

```sql
mesh_users (
  id UUID PRIMARY KEY,
  external_user_id TEXT NOT NULL,        -- MeshCentral _id
  mesh_username TEXT NOT NULL,           -- Parsed username
  email TEXT,
  name TEXT,
  display_name TEXT,

  domain_key TEXT NOT NULL,              -- "" | "zonetech" | "zsangola"
  domain TEXT NOT NULL,                  -- MUST mirror MeshCentral "domain"
  domain_dns TEXT,                       -- mesh.bwb.pt | zonetech.bwb.pt
  
  disabled BOOLEAN NOT NULL DEFAULT false,

  siteadmin BIGINT,
  domainadmin BIGINT,

  role TEXT NOT NULL,                    -- SUPERADMIN | DOMAIN_ADMIN | LIMITED_ADMIN | USER

  source TEXT NOT NULL DEFAULT 'meshcentral',

  auth_user_id UUID,                     -- Link to auth.users (optional)

  created_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ                 -- Soft delete support
)
```

**Migration File:** `supabase/migrations/20251219040000_migration_mesh_users_multidomain.sql`

**Validation:** Automated script available at `scripts/validate-mesh-users-schema.fixed.sh`

```bash
# Validate before running sync
bash scripts/validate-mesh-users-schema.fixed.sh

# Expected output:
# ✓ SCHEMA VÁLIDO - SYNC PODE SER EXECUTADO
```

**Key Changes from Original Design:**
- ✅ Added `display_name` for UI purposes
- ✅ Added `deleted_at` for soft delete support
- ✅ Added `auth_user_id` for RustDesk app integration
- ✅ Made `domain_dns` nullable (can be computed from domain_key)

⸻

3.3 Uniqueness Constraints

UNIQUE (external_user_id)

Optional safety:

UNIQUE (domain_key, username)


⸻

4. Domain Resolution Strategy

The synchroniser must maintain a domain registry.

Default Domain (Explicit)

Field	Value
domain_key	""
domain	""
domain_dns	mesh.bwb.pt

This must never be implicit.

⸻

For Each User

Supabase Field	Source
external_user_id	MeshCentral _id
username	Parsed from _id
domain_key	Parsed from _id
domain	MeshCentral domain field
domain_dns	Domain registry

⚠️ The domain field must be stored exactly as in MeshCentral

⸻

5. Synchronisation Behaviour

5.1 Frequency
	•	Every 15 minutes
	•	Triggered via cron / worker / scheduled job

⸻

5.2 Source of Truth

MeshCentral is authoritative.

Supabase must be treated as a materialised view.

⸻

5.3 Sync Algorithm
	1.	Fetch all users from all domains
	2.	Build an in-memory map using external_user_id
	3.	Collapse duplicate historical records (keep last version)
	4.	Upsert into mesh_users
	5.	Mark missing users as deleted/disabled (project choice)

⸻

5.4 Delta Rules

MeshCentral Change	Supabase Action
New user	INSERT
User updated	UPDATE
User disabled	UPDATE disabled=true
User re-enabled	UPDATE disabled=false
User deleted	Soft or hard delete

Important:
	•	Domain migration = delete + create
	•	Username reuse across domains is valid

⸻

6. Role Derivation (Corrected)

Roles must be derived, not trusted blindly.

if siteadmin == 4294967295 → SUPERADMIN
else if domainadmin > 0 → DOMAIN_ADMIN
else if siteadmin > 0 → LIMITED_ADMIN
else → USER

Visibility is not inferred from role.

⸻

7. Idempotency & Safety

The synchroniser must be:
	•	Idempotent
	•	Order-independent
	•	Crash-safe

Recommended patterns:
	•	Collapse MeshCentral append-only history
	•	Upsert by external_user_id
	•	One transaction per sync cycle
	•	Optional audit log table

⸻

8. Edge Cases (Observed & Accounted For)
	•	Users existing but invisible due to missing domain
	•	Admins authenticating but seeing empty user lists
	•	Password change creating duplicate historical records
	•	Domain admins leaking into default domain UI
	•	Domain admins unable to see users due to domain mismatch

All resolved by correct handling of the domain field.

⸻

9. Security Considerations
	•	No passwords are read or stored
	•	Metadata only
	•	MeshCentral access should be read-only
	•	Supabase RLS must isolate domains strictly

⸻

10. Schema Validation (Production Safety)

Before running any MeshCentral sync, the schema MUST be validated.

**Automated Validation:**

```bash
# Basic validation
bash scripts/validate-mesh-users-schema.fixed.sh

# Debug mode (detailed output)
DEBUG=1 bash scripts/validate-mesh-users-schema.fixed.sh
```

**The script validates:**
1. Supabase connectivity
2. Table `mesh_users` exists
3. All 17 required columns present
4. Multi-domain columns (`domain_key`, `domain`, `domain_dns`)

**Exit Codes:**
- `0` - Schema valid, sync safe to run
- `1` - Schema incomplete, migration required

**Integration:**
- Run before manual sync
- Include in CI/CD pipeline
- Run after Supabase migrations
- Run after adding new MeshCentral domains

11. Final Non-Negotiable Rule

If domain is wrong or missing, MeshCentral behaviour will be wrong — regardless of permissions.

This is the root cause behind:
	•	invisible users
	•	broken domain admins
	•	phantom default-domain users
