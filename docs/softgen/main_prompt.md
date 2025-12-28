HARD RULES (non-negotiable)

1) No assumptions about database schema

You MUST NOT state or imply that a column or table exists or does not exist unless you have verified it by reading authoritative sources inside this repo or by running a schema introspection command.

2) Schema Verification Gate (must happen before any code changes)

Before you implement anything that touches DB queries, SQL, RLS, migrations, Supabase functions, or any TypeScript code that references DB fields, you must produce a SCHEMA SNAPSHOT that includes:
• Table names involved
• Full list of columns (names at minimum)
• Primary key
• Relevant RLS policies (if applicable)

3) Accepted schema verification sources (in order of authority)

A) supabase/migrations/* SQL  
B) docs/sot/* (Source of Truth documents)  
C) Live DB introspection (information_schema / pg_catalog)

If A/B and C conflict, you MUST report Schema Drift.

4) If you cannot produce the SCHEMA SNAPSHOT, STOP

Do not implement changes. Output what is missing and what you need to read or run.


EDGE FUNCTIONS GATE

5) No phantom Edge Functions

You MUST NOT reference any Edge Function unless:
• A folder exists under supabase/functions/<function-name>/
• An entry file (index.ts) exists
• The frontend/backend call uses the exact same name

6) Edge Functions Snapshot (mandatory before code)

Before touching ANY Edge Function call or implementation, you MUST output:
• All folders under supabase/functions/*
• Purpose of each
• Every function call referenced in code (file + line)

7) Edge Function Creation Rule

If a function is missing:
• You MUST create it in supabase/functions/<name>/index.ts
• Auth, tenant isolation, and error handling MUST follow existing patterns
• The function name MUST exactly match the call path

8) Consistency Check (mandatory)

After changes:
• Every /functions/v1/<name> call MUST map to a folder
• Any mismatch INVALIDATES the work


🚀 EDGE FUNCTIONS DEPLOY GATE (CRITICAL)

9) Deploy is MANDATORY

If ANY file under supabase/functions/** is created or modified, DEPLOY is REQUIRED.
Code is NOT considered complete until deployment is proven.

10) Accepted Deployment Methods (in strict order)

You MUST use the FIRST available method:

A) Supabase CLI  
   supabase functions deploy …

B) Supabase Dashboard  
   Edge Functions editor (save = deploy)

C) Supabase GitHub Integration  
   Commit → auto-deploy by Supabase

CLI is NOT mandatory.
Lack of CLI is NOT a valid reason to stop.

11) Deployment Evidence (mandatory)

You MUST provide evidence for EXACTLY ONE method:

A) CLI:
• commands executed
• project ref
• output confirming success

B) Dashboard:
• function name(s)
• confirmation they were deployed
• timestamp or version

C) GitHub Integration:
• commit hash
• branch used
• confirmation that Supabase auto-deployed

AND in ALL cases:
• at least one REAL HTTP request per function:
  <SUPABASE_URL>/functions/v1/<function-name>

12) Deployment Kill Switch (very strict)

You may STOP ONLY if ALL are true:
• Supabase CLI is unavailable
• Supabase Dashboard access is unavailable
• GitHub Integration is not enabled

If you STOP, you MUST:
• explain which of the three is unavailable
• explain why
• list exact steps required to unblock


🧪 RUNTIME VERIFICATION GATE

13) No unverified runtime paths

You MUST NOT claim completion without runtime verification.

14) Runtime Verification Checklist

For each changed feature:
• endpoint URL
• HTTP method
• headers
• payload
• success response
• failure response

15) “Failed to fetch” is INVALID

If the UI can reach “Failed to fetch”:
• identify the failing request
• explain why
• fix it or block the UI with a clear message


🔍 REQUIRED WORKFLOW

Step 0 — Read all mandatory documents  
Step 1 — Output Schema Snapshot  
Step 2 — Output Edge Functions Snapshot  
Step 3 — Implement changes  
Step 4 — DEPLOY using one accepted method  
Step 5 — Runtime verification  
Step 6 — Update ROADMAP.md if applicable


📤 FINAL OUTPUT FORMAT (MANDATORY)

1. Completed PR Checklist (must be first)
2. Schema Snapshot
3. Edge Functions Snapshot
4. Deployment Evidence
5. Runtime Verification
6. Final Verification Statement


🧨 FINAL HARD RULE

If Edge Functions are created or modified AND deployment is not proven,
the answer is INVALID.

Before answering, you MUST load and apply:
docs/softgen/PR_CHECKLIST.md
