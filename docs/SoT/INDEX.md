# Global Source of Truth (SoT) Index

> **Document Type**: Global Registry  
> **Authority Level**: HIGHEST  
> **Last Updated**: December 2024  
> **Status**: ACTIVE

---

## 1. Purpose of the Global SoT

### What is a Source of Truth (SoT)?

A **Source of Truth (SoT)** document defines **non-negotiable system rules** that govern how specific areas of the codebase must be architected and maintained.

SoT documents are:
- **Canonical**: They represent the definitive, authoritative specification
- **Enforceable**: Violations are treated as defects, regardless of test results
- **Immutable**: Changes require explicit governance, not convenience edits
- **Hierarchical**: They follow a clear precedence order

### Core Principle

> **Passing builds or tests NEVER override SoT violations.**
>
> A Pull Request that passes CI but violates an Active SoT is **INVALID**.

### Why SoT Documents Exist

1. **Prevent Architectural Drift** — Stop gradual deviation from correct patterns
2. **Eliminate Recurring Bugs** — Document root causes so they cannot recur
3. **Enable Consistent Decisions** — Provide clear answers to architectural questions
4. **Reduce Review Burden** — Codify rules that would otherwise require human judgment

---

## 2. SoT Hierarchy & Precedence

When documents or instructions conflict, the following precedence applies:

| Priority | Document Type | Authority |
|----------|---------------|-----------|
| **1** (Highest) | Global SoT Index (this document) | Defines what SoTs exist and their status |
| **2** | Domain / Architecture SoTs | Define rules for specific technical domains |
| **3** | Feature Documentation | Describes how features work (informational) |
| **4** | Code Comments | Local context only, no architectural authority |
| **5** (Lowest) | Verbal / Chat Instructions | Never override written SoT |

### Conflict Resolution

- If a **feature doc** conflicts with a **Domain SoT** → **SoT wins**
- If a **code comment** conflicts with a **SoT** → **SoT wins**
- If **two SoTs** conflict → Escalate to maintainers; do not proceed
- If an **instruction** (human or AI) conflicts with a **SoT** → **SoT wins**

---

## 3. Canonical SoT Registry

The following table is the **authoritative registry** of all Source of Truth documents in this repository.

| SoT Name | Path | Scope | Status | Notes |
|----------|------|-------|--------|-------|
| **Authentication & Middleware Architecture** | [`/docs/SoT/AUTH_AND_MIDDLEWARE_ARCHITECTURE.md`](./AUTH_AND_MIDDLEWARE_ARCHITECTURE.md) | Next.js 16 proxy, routing, Auth0 integration | **Active (Canonical)** | Defines the ONLY allowed architecture for authentication. **Boundary file must be `/proxy.ts` at root (not middleware.ts).** |

### Registry Rules

- **Active (Canonical)**: The definitive, enforceable specification
- **Active (Supplementary)**: Provides additional detail; does not override Canonical
- **Deprecated**: No longer enforced; kept for historical reference
- **Draft**: Under review; not yet enforceable

---

## 4. Governed Domains

### 4.1 Authentication & Proxy (Next.js 16)

**Governing SoT**: [AUTH_AND_MIDDLEWARE_ARCHITECTURE.md](./AUTH_AND_MIDDLEWARE_ARCHITECTURE.md)

This SoT **exclusively governs**:

| Domain | Rule Summary |
|--------|--------------|
| Boundary file | MUST be `/proxy.ts` at project root (not `middleware.ts`, not in `src/`) |
| Function name | MUST be `export async function proxy()` |
| `NextResponse.next()` usage | ONLY allowed in `/proxy.ts` |
| `/auth/*` routing | RESERVED for Auth0 SDK; no application code at `src/app/auth/` |
| `auth0.middleware()` calls | ONLY allowed from `/proxy.ts` |
| Legacy auth paths | `/api/login` → 410 Gone; `/api/auth/*` → redirect to `/auth/*` |
| Route handler responses | Must return `NextResponse.json()` or `redirect()`; NEVER `next()` |

**Any code that violates these rules is architecturally invalid, regardless of whether it compiles or passes tests.**

### Validation Commands (from SoT)

```bash
# All must PASS before merge
test -f proxy.ts                     # proxy.ts exists at root
test ! -f src/proxy.ts               # src/proxy.ts does NOT exist
test ! -f middleware.ts              # middleware.ts does NOT exist
test ! -d src/app/auth               # src/app/auth/ does NOT exist
```

---

## 5. Governance Rules

### 5.1 Adding New SoT Documents

All new SoT documents MUST:

1. Be added to the **Canonical SoT Registry** table in this index
2. Have a clearly defined **Scope** that does not overlap with existing SoTs
3. Include explicit **DO / DO NOT** rules
4. Include **validation commands** where applicable
5. Be reviewed by at least one maintainer

### 5.2 Modifying Existing SoT Documents

Modifications to Active SoT documents MUST:

1. Be explicitly justified (not convenience-driven)
2. Update the "Last Updated" date
3. Preserve the architectural intent unless explicitly superseding it
4. Not introduce contradictions with other Active SoTs

### 5.3 Deprecating SoT Documents

To deprecate an SoT:

1. Update its status in this index to **Deprecated**
2. Add a deprecation notice at the top of the document
3. Reference the replacement SoT (if any)
4. Do NOT delete the file (preserve for historical reference)

### 5.4 Emergency Fixes

Even in emergencies:

- If a fix violates an SoT → The SoT MUST be updated to reflect the new rule
- "Temporary" violations are forbidden
- "We'll fix the docs later" is not acceptable

---

## 6. Enforcement Expectations

### 6.1 Pull Request Validation

Before merging any PR, verify:

```bash
# Run all SoT validation commands
# From AUTH_AND_MIDDLEWARE_ARCHITECTURE.md:

# 1. proxy.ts exists at root (Next.js 16 requirement)
test -f proxy.ts && echo "PASS" || echo "FAIL"

# 2. src/proxy.ts does NOT exist
test -f src/proxy.ts && echo "FAIL" || echo "PASS"

# 3. middleware.ts does NOT exist (deprecated in Next.js 16)
test -f middleware.ts && echo "FAIL" || echo "PASS"

# 4. src/app/auth/ does NOT exist
test -d src/app/auth && echo "FAIL" || echo "PASS"

# 5. NextResponse.next() only in proxy.ts
grep -rn "NextResponse.next" --include="*.ts" . | grep -v node_modules | grep -v "proxy.ts"
# Expected: (empty)

# 6. RUNTIME: /auth/login must NOT return 404
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/auth/login
# Expected: 200 or 302 (NOT 404)
```

### 6.2 Violation Handling

| Violation Type | Response |
|----------------|----------|
| PR introduces SoT violation | **Block merge** until fixed |
| Existing code violates SoT | File defect; prioritize fix |
| "Quick fix" bypasses SoT | Revert; require proper fix |
| Instruction conflicts with SoT | Reject instruction; follow SoT |

### 6.3 Accountability

- **All developers** are responsible for knowing Active SoTs
- **Reviewers** must verify SoT compliance before approving PRs
- **Maintainers** are responsible for keeping this index accurate

---

## 7. Quick Reference

### Finding the Right SoT

| Question | Relevant SoT |
|----------|--------------|
| "Where should the boundary file be?" | [AUTH_AND_MIDDLEWARE_ARCHITECTURE.md](./AUTH_AND_MIDDLEWARE_ARCHITECTURE.md) — `/proxy.ts` at root |
| "Can I use `NextResponse.next()`?" | [AUTH_AND_MIDDLEWARE_ARCHITECTURE.md](./AUTH_AND_MIDDLEWARE_ARCHITECTURE.md) — Only in `/proxy.ts` |
| "How should Auth0 routes be handled?" | [AUTH_AND_MIDDLEWARE_ARCHITECTURE.md](./AUTH_AND_MIDDLEWARE_ARCHITECTURE.md) — Via `auth0.middleware()` |
| "Can I create pages under `/auth/`?" | [AUTH_AND_MIDDLEWARE_ARCHITECTURE.md](./AUTH_AND_MIDDLEWARE_ARCHITECTURE.md) — **NO** |
| "Should I use middleware.ts or proxy.ts?" | [AUTH_AND_MIDDLEWARE_ARCHITECTURE.md](./AUTH_AND_MIDDLEWARE_ARCHITECTURE.md) — **proxy.ts** (Next.js 16) |

### SoT Validation Checklist

Before any architectural change:

- [ ] Have I read the relevant SoT document(s)?
- [ ] Does my change comply with all Active SoTs?
- [ ] Have I run the SoT validation commands?
- [ ] If I need to deviate, have I proposed an SoT update?

---

## 8. Document History

| Date | Change | Author |
|------|--------|--------|
| December 2024 | Initial creation; registered AUTH_AND_MIDDLEWARE_ARCHITECTURE.md | System |

---

## 9. Related Documents

- [/docs/INDEX.md](../INDEX.md) — General documentation index
- [/docs/ARCHITECTURE.md](../ARCHITECTURE.md) — High-level architecture overview
- [/README.md](../../README.md) — Project overview

---

**This document is the authoritative registry of all Source of Truth documents.**

**If in doubt, consult the relevant SoT. If the SoT doesn't cover it, propose an update.**
