# Supabase CLI – Deep Technical Guide for AI-Driven Development

**Audience:**  
This document is written for an **AI agent** (or any automation backend) that needs to:

- Use the **Supabase CLI** correctly.
- Keep local and remote **database schema, configuration, seeds, functions and types in sync**.
- Understand how CLI state (`config.toml`, migrations, etc.) relates to what the AI is generating in code and SQL.

It assumes:

- The project is hosted on **Supabase Cloud**.
- The AI has access to a **developer environment** with:
  - Supabase CLI installed.
  - Docker (for local stack).
  - A Supabase **Personal Access Token (PAT)**.

---

## 1. What the Supabase CLI Is (and Is Not)

The Supabase CLI is:

- A **single binary** that manages:
  - Local Supabase stack (Postgres, Auth, Storage, Realtime).
  - **Database migrations** and seeds.
  - **Project linking** and deployment to remote Supabase projects.
  - Types generation (TypeScript, etc.).
  - Edge Functions development and serving.  [oai_citation:0‡Supabase](https://supabase.com/docs/guides/local-development/cli/getting-started?utm_source=chatgpt.com)  

The CLI is **not**:

- A replacement for the Dashboard; instead, it complements it.
- A direct runtime library; it orchestrates Docker, Postgres, and internal APIs.

For an AI, the CLI is the **primary interface** to treat Supabase as **config-as-code**:
- `supabase/config.toml` defines local stack behaviour.  [oai_citation:1‡Supabase](https://supabase.com/docs/guides/cli/config?utm_source=chatgpt.com)  
- `supabase/migrations` defines declarative schema history.  [oai_citation:2‡Supabase](https://supabase.com/docs/guides/local-development/overview?utm_source=chatgpt.com)  

---

## 2. Installing and Updating the Supabase CLI

The CLI can be installed via multiple methods (npm, Homebrew, direct binary, etc.). The exact command depends on OS, but conceptually:

```bash
# Example (Node-based tooling):
npm install supabase --save-dev

# Or use npx directly (no global install):
npx supabase --help

Supabase docs recommend a minimum version for some features (e.g., types generation from CLI v1.8.1+).  

AI considerations:
	•	Always check CLI version before relying on newer commands/features:

supabase --version


	•	If automating, the AI should:
	•	Detect outdated versions.
	•	Emit instructions to upgrade (not silently assume).

⸻

3. Authentication: Logging in with a Personal Access Token (PAT)

Most CLI commands that touch the remote project require the user to be authenticated.

3.1 Login Flow

The AI should treat CLI login as:
	1.	Human (or secure environment) generates a Personal Access Token in the Supabase Dashboard.
	2.	That token is used for CLI login:

supabase login
# CLI will ask for: "Access token:"
# Paste: sbp_...

After login, the CLI stores credentials locally so future commands can operate without re-prompting.  

3.2 AI Best Practices
	•	Do not hard-code PATs in scripts; rely on interactive login or environment-injected token.
	•	For non-interactive CI environments:
	•	Use SUPABASE_ACCESS_TOKEN environment variable or similar mechanism.
	•	Ensure tokens are stored in secret managers, not Git.
	•	If CLI returns “forbidden resource” or auth errors when running supabase db push or supabase link, AI should suggest:
	•	Verifying the project ref.
	•	Generating a new PAT and re-run supabase login.  

⸻

4. Initializing a Local Project

The minimum setup for local development is:

supabase init

This command:
	•	Creates a supabase/ directory.
	•	Generates supabase/config.toml with local stack configuration.  

Typical structure after supabase init:

./supabase/
  config.toml
  migrations/
  seed.sql (optional)
  functions/          # Edge Functions
  types/              # Generated types (optional)

AI responsibilities:
	•	Assume this layout exists (or create it using supabase init).
	•	Treat config.toml as the source of truth for local stack configuration.
	•	Avoid editing generated internal files outside documented structures.

⸻

5. Running the Local Supabase Stack

To run a full local Supabase stack (Postgres + Auth + Storage + Realtime):

# Start local stack (Docker-based)
supabase start

# See stack status
supabase status

# Stop local stack
supabase stop

	•	supabase start launches the containers defined in config.toml.  
	•	supabase status shows health and connection info; supabase status -o env can output env vars, including ANON_KEY, SERVICE_ROLE_KEY, JWT_SECRET for local development.  
	•	supabase stop halts the local services.  

5.1 AI Pattern for “Spin Up Local + Apply Code”
	1.	Ensure supabase/ directory exists (supabase init if needed).
	2.	Run supabase start.
	3.	Apply migrations (if any) locally (see section 7).
	4.	Run tests or seed scripts.
	5.	Stop stack when done.

⸻

6. Config as Code: supabase/config.toml

After supabase init, the CLI generates supabase/config.toml.  

This file controls:
	•	Local Postgres port, db name, credentials.
	•	JWT secret for local Auth.
	•	Edge Functions configuration.
	•	Optional overrides for local stack.

Key points for AI:
	•	Any manual change to config.toml requires:

supabase stop
supabase start

to apply changes.  

	•	AI should:
	•	Manipulate config.toml deterministically (e.g., using structured editing, not ad-hoc string replace).
	•	Keep config.toml under version control so env differences are tracked.
	•	Supabase CLI v2 emphasizes config-as-code and allows syncing local config.toml with remote project settings via supabase link diffing.  

⸻

7. Database Migrations: Creating, Applying, Pushing

Migrations are how the AI keeps schema aligned between:
	•	Local database.
	•	Remote Supabase project(s).

7.1 Creating a New Migration

There are multiple patterns (manual SQL, diffing remote, etc.). Common ones:

7.1.1 Create an empty migration and write SQL manually

supabase migration new add_customers_table
# => creates supabase/migrations/<timestamp>_add_customers_table.sql

AI then populates the migration file with SQL.

7.1.2 Generate migration by diffing against remote
You can ask the CLI to diff your local database against the remote project and generate a migration:

supabase db diff -f add_customers_table
# requires project to be linked (see section 8)

This is useful when:
	•	AI updates the local schema.
	•	You want to generate a migration that brings remote schema in sync.  

7.2 Applying Migrations Locally

To reset local DB and apply all migrations:

supabase db reset

	•	Recreates local database from scratch.
	•	Applies all migration scripts under supabase/migrations.  

AI best practice:
	•	Use supabase db reset as a safety check:
“If migrations cannot recreate a fresh DB, they are broken.”

7.3 Pushing Migrations to Remote

To apply local migrations to a linked remote project:

# Simple push
supabase db push

# Push and also run seed data
supabase db push --include-seed

Requirements:
	•	CLI must be logged in.
	•	Project must be linked (supabase link).  

AI pattern:
	1.	Generate or edit migration files.
	2.	Validate locally with supabase db reset.
	3.	Use supabase db push --dry-run (if available) to preview changes.
	4.	Then supabase db push to apply to remote.

⸻

8. Linking a Local Project to a Remote Supabase Project

supabase link connects the local supabase/ directory with a remote project.

supabase link
# CLI prompts to choose a project or to specify project ref

This stores metadata (project ref and connection) so subsequent commands (db push, db dump, etc.) know which remote project to operate on.  

AI responsibilities:
	•	Treat supabase link state as critical: if wrong project is linked, migrations may hit the wrong database.
	•	In multi-environment setups (dev/staging/prod):
	•	AI should explicitly document which local directory is linked to which project ref.
	•	Avoid reusing the same supabase/ directory for multiple refs unless carefully managed.

⸻

9. Working with Seeds

Seed data can be used to populate DB with baseline data:
	•	A typical pattern is a supabase/seed.sql or similar.
	•	CLI supports seeding as part of db push:

supabase db push --include-seed

Supabase docs use this as a stage in deployments:
	1.	supabase login
	2.	supabase link
	3.	supabase db push
	4.	supabase db push --include-seed (optional).  

AI considerations:
	•	Maintain seeds as idempotent as possible.
	•	Keep seeds in sync with schema (and with any app-level test/demo data expectations).
	•	For complex projects, prefer separate seed scripts for dev/demo/test datasets, controlled by environment.

⸻

10. Generating Types (TypeScript) with CLI

Supabase CLI can introspect the database and generate TypeScript types:

supabase gen types typescript \
  --project-id <project-ref> \
  > supabase/types/database.types.ts

This is equivalent to types generated via Dashboard. Types reflect current database schema and can be used with @supabase/supabase-js for fully typed queries.  

AI workflow:
	1.	Ensure project is linked (or pass --project-id).
	2.	Run supabase gen types ... after applying migrations.
	3.	Use generated types in frontend/backend code:
	•	Helps the AI avoid referencing non-existing tables/columns.
	•	Encourages type-safe usage of Supabase APIs.

⸻

11. Edge Functions and Local Development via CLI

Supabase Edge Functions (Deno-based) are managed via CLI.  

11.1 Function Scaffolding and Local Serve

Typical workflow:

# Initialize project if not done
supabase init

# Start local stack
supabase start

# Create a new Edge Function
supabase functions new hello-world

# Serve functions locally
supabase functions serve
# or
supabase functions serve hello-world

	•	supabase functions serve starts a local HTTP server for functions.
	•	VSCode / Cursor Deno integration can be auto-configured by supabase init (deno.enablePaths, import map, etc.).  

AI considerations:
	•	Keep functions in supabase/functions/<name>/index.ts or equivalent structure.
	•	Ensure local stack is running (supabase start) before serving functions.
	•	When generating code, maintain Deno-compatible imports and types.

⸻

12. Managing Environments with the CLI

Supabase encourages a Dev → Staging → Prod environment strategy, and the CLI is central to keeping DB schema consistent across environments.  

Key practices:
	•	Each environment has its own Supabase project (different project ref).
	•	Each environment should have:
	•	Its own supabase/ folder or
	•	A parameterized configuration that clearly indicates which project ref is used where.

Commands:
	•	supabase db reset – resets local DB to current migrations, used as a validation step.  
	•	supabase db push – deploy migrations to the linked environment.
	•	supabase db dump – dump remote DB content (e.g., for backup or local cloning).  

AI should:
	•	Never assume “one project = all environments”.
	•	Be explicit about which commands target which environment.

⸻

13. Declarative Database Schemas and Migration Repair

Supabase supports declarative schema management, and the CLI includes tools like:
	•	supabase db reset --version <timestamp> to reset DB up to a specific migration version.  
	•	supabase migration repair to edit migration history table without actually running migrations (for advanced use).  

AI must be extremely cautious:
	•	Do not reset to a version that is already deployed to production.
	•	Use migration repair only when clearly necessary and with appropriate human approval.

⸻

14. Troubleshooting and Common CLI Errors

14.1 Forbidden / Unauthorized CLI Calls

Typical CLI errors during supabase db push, supabase link, etc.:
	•	“Forbidden resource”
	•	“failed SASL auth” / “invalid SCRAM server-final-message”  

AI should suggest:
	•	Verifying that $PROJECT_REF is correct.
	•	Checking that the logged-in user (PAT) has access to that project.
	•	Regenerating PAT and re-running supabase login.
	•	Ensuring network access to Supabase endpoints.

14.2 Local Stack Failing to Start

If supabase start fails:
	•	Check Docker is running.
	•	Ensure no conflicting ports (Postgres, etc.).
	•	Validate supabase/config.toml for syntax errors.  

14.3 Migration Issues

If supabase db reset or db push fails:
	•	Inspect the failing migration file (SQL syntax, references to missing objects).
	•	Run individual SQL blocks manually against local DB for more detailed error messages.
	•	Use supabase db reset --version to roll back to a working migration range and regenerate the broken migration.  

⸻

15. Putting It All Together – AI Workflow Template

A robust AI-driven Supabase development loop using the CLI:
	1.	Initialize (once per project)
	•	supabase init
	•	Commit supabase/config.toml and empty supabase/migrations/ folder.
	2.	Start Local Environment
	•	supabase start
	•	Wait until status is healthy: supabase status.
	3.	Schema Changes
	•	AI generates SQL for new feature.
	•	supabase migration new <feature_name>
	•	AI writes SQL into migration file.
	•	supabase db reset to verify migrations rebuild a fresh DB.
	4.	Types and Code Sync
	•	supabase gen types typescript --project-id <ref> > supabase/types/database.types.ts
	•	AI updates API code to use new generated types.  
	5.	Link and Deploy
	•	supabase login (once per machine)
	•	supabase link (once per local folder / project)
	•	supabase db push (maybe with --include-seed) to deploy to remote.  
	6.	Functions & Auth
	•	supabase functions new / functions serve for Edge Functions.  
	•	Ensure JWT and keys from supabase status -o env are used only for local dev.
	7.	Environment Strategy
	•	Repeat link+push cycle per environment (dev/staging/prod).
	•	Use separate Supabase projects and PATs.
	8.	Continuous Hygiene
	•	Use supabase db reset regularly in development to verify migrations never rot.  
	•	Rotate PATs and secret keys if any suspicion of compromise.

⸻

16. Summary

For an AI, the Supabase CLI is the control plane for:
	•	Standing up and tearing down local Supabase stacks.
	•	Expressing database schema as versioned migrations.
	•	Keeping local/remote schemas and seeds in sync.
	•	Generating strongly typed bindings for APIs.
	•	Managing Edge Functions development.
	•	Implementing a disciplined multi-environment deployment strategy.

By treating supabase/config.toml, supabase/migrations/, and CLI commands as the canonical interface to Supabase, an AI can:
	•	Evolve the database without drift.
	•	Keep code and schema in lockstep.
	•	Safely deploy to remote environments with predictable, repeatable steps.