# Supabase Edge Functions – Deployment Rules

Edge Functions MUST be deployed whenever changed.

There are THREE valid deployment methods.

────────────────────────────────

## Method A — Supabase CLI

Use when CLI is available.

Example:
supabase functions deploy admin-update-group

Evidence required:
• command output
• project ref
• real HTTP call

────────────────────────────────

## Method B — Supabase Dashboard

Use when CLI is unavailable.

Steps:
1) Open Supabase Dashboard
2) Project → Edge Functions
3) Create or edit function
4) Save (auto-deploy)

Evidence required:
• function name
• confirmation deployed
• timestamp/version
• real HTTP call

────────────────────────────────

## Method C — GitHub Integration

Use when repo is connected to Supabase.

Steps:
1) Commit changes to monitored branch
2) Supabase auto-deploys

Evidence required:
• commit hash
• branch
• confirmation deploy completed
• real HTTP call

────────────────────────────────

## STOP Rule

STOP is allowed ONLY if:
• CLI unavailable
• Dashboard unavailable
• GitHub Integration unavailable

Otherwise, deployment MUST proceed.
