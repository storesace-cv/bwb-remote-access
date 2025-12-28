✅ Softgen – Mandatory PR Checklist (Auto-Gate)

This checklist MUST be completed.
If any blocking item cannot be checked, STOP.

────────────────────────────────

🔒 1. Schema & Data Safety
[ ] Schema Snapshot produced
[ ] No schema assumptions
[ ] No guessed columns
[ ] Schema Drift reported if present

────────────────────────────────

⚙️ 2. Edge Functions Safety
[ ] Edge Functions Snapshot listed
[ ] Every /functions/v1/* call maps to a folder
[ ] No phantom functions
[ ] New functions follow existing auth & tenant patterns

────────────────────────────────

🚀 3. Edge Functions Deploy (BLOCKING)
If supabase/functions/** changed:

[ ] Deployed via ONE accepted method:
    [ ] Supabase CLI
    [ ] Supabase Dashboard
    [ ] Supabase GitHub Integration

[ ] Deployment evidence provided
[ ] At least one real HTTP call per function executed

If deployment is impossible:
[ ] CLI unavailable
[ ] Dashboard unavailable
[ ] GitHub Integration unavailable
→ ONLY if all three are true may STOP be used

────────────────────────────────

🧪 4. Runtime Verification
[ ] Success path verified
[ ] Failure path verified
[ ] UI does not fail silently

────────────────────────────────

📁 5. Repo & Deliverables
[ ] All files exist
[ ] No broken references
[ ] ROADMAP.md updated if applicable

────────────────────────────────

📤 6. Final Verification Statement

I confirm that:
• All schema references are verified
• All Edge Functions exist
• Deployment was executed and proven
• Runtime behavior was validated

Any unchecked item INVALIDATES this PR.
