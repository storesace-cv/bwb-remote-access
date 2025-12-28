# Supabase Authentication – Deep Technical Overview for AI Agents

**Audience:**  
This document is written for an AI agent (or any automation backend) that needs to:

- Authenticate *itself* against a Supabase project.
- Authenticate **end-users** using Supabase Auth.
- Understand how Supabase configuration, JWTs, API keys, and Row Level Security (RLS) work together.

It assumes the project is **hosted on Supabase Cloud**, but most concepts also apply to self-hosting.

---

## 1. High-Level Architecture

A Supabase project combines:

1. **Postgres database**
2. **Supabase Auth** (user management + JWT issuing)
3. **Data API** (REST / GraphQL) and **Realtime**
4. **Storage** (object storage)
5. **Edge Functions**

**Authentication and authorization** are primarily based on **JWTs** and **Row Level Security (RLS)**:

- Supabase Auth issues **JWT access tokens** for users.  [oai_citation:0‡Supabase](https://supabase.com/docs/guides/auth?utm_source=chatgpt.com)  
- Each token includes claims such as `sub` (user id), `role`, and metadata.  [oai_citation:1‡Supabase](https://supabase.com/docs/guides/auth/jwt-fields?utm_source=chatgpt.com)  
- When the client hits the Data API, the token is passed in `Authorization: Bearer <jwt>` and Postgres RLS policies decide what is allowed.  [oai_citation:2‡Supabase](https://supabase.com/docs/guides/database/secure-data?utm_source=chatgpt.com)  

There are **three main “identities”** an AI must understand:

1. **Anonymous/public client** (browser, mobile) – uses a **public key** (anon/publishable).
2. **Authenticated user** – same public key, plus a **JWT access token** attached to each request.
3. **Privileged server / AI agent** – uses a **secret/server key** (legacy `service_role` or new secret key) and can bypass or manage RLS.  [oai_citation:3‡Supabase](https://supabase.com/docs/guides/api/api-keys?utm_source=chatgpt.com)  

---

## 2. Project Credentials and API Keys

Every Supabase project exposes at least:

- **Project URL** – e.g. `https://<project-ref>.supabase.co`
- **API Keys** (in Dashboard → Project Settings → API)

### 2.1 Legacy Keys: `anon` and `service_role`

Legacy keys are long-lived JWTs:  [oai_citation:4‡Supabase](https://supabase.com/docs/guides/api/api-keys?utm_source=chatgpt.com)  

- **`anon` key**  
  - Used on **frontend / public clients**.  
  - Associated with the Postgres role `anon`.  
  - Safe to expose, *provided* all tables have **RLS enabled** and correct policies.  [oai_citation:5‡Supabase](https://supabase.com/docs/guides/database/secure-data?utm_source=chatgpt.com)  

- **`service_role` key**  
  - Used **only on backend / server / AI**.  
  - Bypasses RLS and has elevated privileges.  
  - **Must never be exposed to browsers or untrusted environments.**  [oai_citation:6‡Supabase](https://supabase.com/docs/guides/database/secure-data?utm_source=chatgpt.com)  

Supabase now considers these **legacy** and recommends moving to **publishable/secret keys**, but they still exist for compatibility.  [oai_citation:7‡Supabase](https://supabase.com/docs/guides/api/api-keys?utm_source=chatgpt.com)  

### 2.2 New API Keys: Publishable vs Secret

Newer projects use:

- **Publishable key** (`sb_publishable_…`)  
  - Replaces `anon` key for public usage.
  - Safe to expose to frontend as long as RLS is correct.

- **Secret key** (`sb_secret_…`)  
  - Replaces `service_role` key for confidential operations.
  - Used in backend infrastructure (servers, AI agents, Edge Functions).
  - Must be stored in **environment variables**, not in code.  [oai_citation:8‡Supabase](https://supabase.com/docs/guides/api/api-keys?utm_source=chatgpt.com)  

Internally, Supabase transforms these into short-lived JWTs before hitting Postgres.  [oai_citation:9‡Supabase](https://supabase.com/docs/guides/auth/jwts?utm_source=chatgpt.com)  

### 2.3 JWT Signing Keys vs API Keys

- **API keys** = “how you identify the client to Supabase platform” (publishable/secret or anon/service_role).  [oai_citation:10‡Supabase](https://supabase.com/docs/guides/api/api-keys?utm_source=chatgpt.com)  
- **JWT signing keys** = keys used by Supabase Auth to sign user access tokens.  [oai_citation:11‡Supabase](https://supabase.com/docs/guides/auth/signing-keys?utm_source=chatgpt.com)  

You can:

- Use the **legacy JWT secret** or
- Use the newer **public/private signing key system** for better rotation and security.  [oai_citation:12‡Supabase](https://supabase.com/docs/guides/auth/signing-keys?utm_source=chatgpt.com)  

The AI rarely needs to sign its own JWTs; it usually:

- Uses Supabase’s **Auth endpoints** to issue tokens, or
- Uses project **API keys** (publishable/secret) and lets Supabase handle JWT generation internally.

---

## 3. User Authentication Flows

Supabase Auth supports multiple user flows: password, magic link, OTP, OAuth, SSO, and third-party auth.  [oai_citation:13‡Supabase](https://supabase.com/docs/guides/auth?utm_source=chatgpt.com)  

### 3.1 Email + Password

Typical flow:

1. Client uses `supabase.auth.signUp({ email, password })`.
2. Depending on config, user may need to **confirm email** first.  [oai_citation:14‡Supabase](https://supabase.com/docs/guides/auth/general-configuration?utm_source=chatgpt.com)  
3. After sign-in (`signInWithPassword`), Supabase issues:
   - **Access token** (short-lived JWT)
   - **Refresh token**

The client library stores and refreshes tokens automatically (web/local storage or cookies).  [oai_citation:15‡Supabase](https://supabase.com/docs/reference/javascript/introduction?utm_source=chatgpt.com)  

### 3.2 Magic Link / OTP

- **Magic link** – user receives a link via email; opening it logs them in.
- **OTP** – one-time code via email or SMS.  [oai_citation:16‡Supabase](https://supabase.com/docs/guides/auth?utm_source=chatgpt.com)  

Same principle: when the user completes the flow, the client gets a session (access token + refresh token).

### 3.3 Social Logins (OAuth)

Supabase supports built-in providers (Google, GitHub, etc.) and third-party auth federations (Auth0, Cognito, etc.).  [oai_citation:17‡Supabase](https://supabase.com/docs/guides/auth?utm_source=chatgpt.com)  

Flow:

1. Client redirects user to provider.
2. Provider redirects back to Supabase.
3. Supabase exchanges code for tokens and creates/updates user in `auth.users`.
4. Supabase returns access/refresh token pair to client.

These tokens contain **standard Supabase claims** and any OAuth-specific claims used by your RLS policies.  [oai_citation:18‡Supabase](https://supabase.com/docs/guides/auth/oauth-server/token-security?utm_source=chatgpt.com)  

---

## 4. JWT Tokens & Claims

Supabase user sessions are **JWT access tokens** with structured claims, e.g.:  [oai_citation:19‡Supabase](https://supabase.com/docs/guides/auth/jwts?utm_source=chatgpt.com)  

- `sub` – user UUID (`auth.users.id`)
- `role` – `authenticated` or other roles
- `email`, `phone`
- `app_metadata` – system controlled (e.g., provider)
- `user_metadata` – custom user profile fields
- `is_anonymous` – indicates ephemeral/anonymous users
- `exp`, `iat` – expiry/issued times

**Important for RLS:**

- `auth.uid()` in Postgres = `sub` claim from JWT.
- `auth.role()` = `role` claim (e.g., `authenticated`, `anon`).  [oai_citation:20‡Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security?utm_source=chatgpt.com)  

### 4.1 Token Lifetimes and Sessions

- Access tokens are **short-lived**.
- Refresh tokens allow the client to get new access tokens without re-logging in.
- You can configure session expiry and maximum concurrent sessions per user.  [oai_citation:21‡Supabase](https://supabase.com/docs/guides/auth/sessions?utm_source=chatgpt.com)  

---

## 5. AI / Service Authentication Patterns

This section is specifically for **non-human agents** (AI tools, backend jobs, MCP servers, etc.).

### 5.1 Pattern A — AI Using a Secret/Service Key (Project-Level Access)

**Use when:**

- The AI acts as a **trusted backend**.
- It needs to perform **admin or cross-user operations** (migrations, bulk updates, maintenance jobs).

**Configuration (environment variables):**

```bash
SUPABASE_URL="https://<project-ref>.supabase.co"
SUPABASE_SECRET_KEY="sb_secret_..."      # or legacy service_role

Node.js example (supabase-js):

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!, // secret or service_role
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

Key points:
	•	Using secret key or service_role bypasses some RLS restrictions – treat as root.  
	•	Never run this code in a browser, mobile app, or any environment where the key can leak.
	•	For admin functions, call supabase.auth.admin.* methods, which explicitly require service_role / secret key.  

Typical AI responsibilities with this pattern:
	•	Creating users on behalf of other systems.
	•	Managing roles / app metadata.
	•	Running data migrations or automated cleanups.
	•	Testing / debugging RLS policies with full visibility.

5.2 Pattern B — AI Acting on Behalf of a User (OAuth / MCP Flow)

Supabase supports MCP Authentication, where an AI tool is a proper OAuth client of your Supabase project.  

Flow overview:
	1.	Discovery – AI (MCP client) retrieves OAuth config from Supabase discovery endpoint.
	2.	Client Registration (optional) – AI is registered as an OAuth client.
	3.	Authorization – human user approves access (scopes) in a browser.
	4.	Token Exchange – AI gets access + refresh tokens.
	5.	Authenticated Access – AI calls Supabase APIs using the user’s JWT.

Advantages:
	•	AI never sees a service key; it sees user-scoped tokens.
	•	RLS behaves exactly as if the user was calling Supabase directly.
	•	This is ideal for “AI agent working on behalf of user X” scenarios.

AI responsibilities here:
	•	Store OAuth client id/secret securely.
	•	Store and refresh user tokens according to expiry.
	•	Attach Authorization: Bearer <user_jwt> to each request.

⸻

6. Frontend Authentication (for Users)

Even if the AI is not the frontend, it must understand typical frontend patterns, because they affect how it designs APIs and RLS.

6.1 Browser / SPA with @supabase/supabase-js

Basic setup (legacy anon key, but same idea for publishable key):  

import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  'https://<project-ref>.supabase.co',
  '<public_anon_or_publishable_key>'
);

Examples:

// Email + password sign up
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'StrongPassword123!'
});

// Sign in
const { data: session, error: signInError } =
  await supabase.auth.signInWithPassword({
    email: 'user@example.com',
    password: 'StrongPassword123!'
  });

// Get current user
const { data: { user } } = await supabase.auth.getUser();

The library:
	•	Stores tokens (e.g. in local storage by default).
	•	Attaches JWT automatically to subsequent Supabase API calls.  

6.2 Next.js / SSR with @supabase/ssr

For SSR and cookie-based sessions:  
	•	Use @supabase/ssr helpers.
	•	Sessions are stored in HTTP-only cookies, not JS storage.
	•	AI that generates backend code should prefer cookie-based auth in SSR apps for better security.

⸻

7. Supabase Dashboard – Auth Configuration

In Supabase Dashboard → Auth → Configuration, you can control:  

7.1 General Settings
	•	Allow new users to sign up
	•	ON = users can self-register.
	•	OFF = only existing accounts can sign in.
	•	Confirm email
	•	ON = users must confirm email before first sign-in.
	•	AI must assume that some accounts may be “unconfirmed” and handle errors accordingly.
	•	Password rules
	•	Minimum password length, complexity, etc.  
	•	Redirect URLs (Site URL / Additional Redirect URLs)
	•	Used after email confirmations, magic links, and OAuth flows.
	•	AI that builds routes must ensure these URLs are correct.

7.2 External Providers / OAuth

Under Auth → Providers or similar:
	•	Enable Google, GitHub, etc.
	•	Configure client IDs, secrets, redirect URLs.  

AI must:
	•	Treat provider config as infrastructure, not inline constants in code.
	•	Use provider names that match Supabase (google, github, etc.) when calling signInWithOAuth.

7.3 JWT & Signing Keys

Under API / Auth settings:
	•	View or rotate JWT secrets or signing keys.  
	•	When rotated, all existing tokens become invalid – AI must be prepared for increased 401/jwt expired errors and gracefully refresh or re-authenticate.

7.4 Sessions & Limits

Configure:  
	•	Session lifetime.
	•	Max concurrent sessions per user.

AI should:
	•	Respect token expiry.
	•	Not assume tokens live forever.
	•	Implement refresh logic or re-login flows for automations.

⸻

8. Row Level Security (RLS) and Auth Integration

RLS is the core of authorization.  

8.1 Basic Principles
	•	RLS is enabled per table.
	•	Policies reference functions like:
	•	auth.uid() → user id (from JWT sub).
	•	auth.role() → authenticated role.
	•	When called with:
	•	Publishable/anon key + user JWT → user policies.
	•	Secret/service_role key → RLS can be bypassed or use role with higher privileges.

Example policy (pseudo-SQL):

-- Allow authenticated users to read only their own rows
create policy "Users can read own rows"
on public.user_profiles
for select
using ( auth.uid() = user_id );

8.2 Anonymous vs Authenticated vs Service Role
	•	Anonymous (public client, not logged in)
	•	role = anon
	•	Could be restricted to read-only public tables.
	•	Authenticated user
	•	role = authenticated
	•	auth.uid() = user’s UUID in auth.users.
	•	Service role / Secret key
	•	RLS can be bypassed (be careful).
	•	Used only in backend / AI.

When the AI designs policies, it must ensure:
	•	All tables with user data have RLS enabled.
	•	There are no policies that accidentally expose data across tenants/users.

⸻

9. Supabase Auth from Multiple Languages

Supabase provides official client libraries: JS/TS, Flutter/Dart, Swift, Python, etc.  

An AI generating code should:
	•	Use the official client library for the language whenever possible.
	•	For non-supported environments, use plain HTTP to call:
	•	Auth endpoints
	•	REST Data API (/rest/v1)
	•	GraphQL (/graphql/v1)

In all cases, it must:
	•	Attach apikey: <publishable_or_secret> header.
	•	Attach Authorization: Bearer <user_or_server_jwt> when acting as a user.

⸻

10. Environment Management (Dev / Staging / Prod)

Best practices for AI:
	1.	Never hard-code Supabase URL or keys in source code.
	2.	Use environment variables:

# .env
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...


	3.	Use different projects and keys per environment:
	•	SUPABASE_URL_DEV, SUPABASE_URL_STAGING, SUPABASE_URL_PROD
	•	SUPABASE_SECRET_KEY_DEV, etc.
	4.	Avoid committing .env or secrets to Git.
	5.	If a key is leaked, rotate it in Dashboard (API → rotate keys) and redeploy.  

⸻

11. Example Scenarios for an AI Agent

11.1 AI Running a Nightly Maintenance Job
	•	Runs on a trusted server.
	•	Uses SUPABASE_SECRET_KEY.
	•	Flow:
	1.	Create Supabase client with secret key.
	2.	Run queries across all tenants (bypassing RLS where needed).
	3.	Log behaviour and errors.
	4.	Avoid destructive operations without explicit configuration.

11.2 AI Acting as “Per-User Assistant”
	•	Uses MCP OAuth with Supabase.  
	•	For each user:
	1.	Obtain OAuth access/refresh tokens.
	2.	Store per-user tokens securely.
	3.	For any query, attach Authorization: Bearer <user_jwt>.
	4.	Respect RLS – AI sees only data the user can see.

11.3 AI Managing Auth Admin Tasks
	•	Uses supabase.auth.admin.* with secret/service_role key.  
	•	Can:
	•	List users.
	•	Update user email/app_metadata.
	•	Disable or delete users.
	•	Create system users.
	•	Must implement audit logging and idempotency for safety.

⸻

12. Security Checklist for AI

When interacting with Supabase Auth and data, an AI should:
	1.	Never expose secret keys to browsers, CLI tools, or logs.
	2.	Prefer user-scoped tokens (OAuth / Auth) over always using service keys.
	3.	Treat RLS as the primary guardrail and design policies carefully.
	4.	Expect token expiry and handle 401 by refreshing or re-authenticating.
	5.	Use official SDKs where possible; otherwise, follow HTTP conventions precisely.
	6.	Rotate keys if there is any suspicion of leakage and update configs.  
	7.	Avoid writing policies that inadvertently allow cross-tenant access.

⸻

13. Summary
	•	Supabase Auth issues JWTs with rich claims; RLS uses those claims for fine-grained access control.
	•	Publishable (or anon) keys power frontend clients; secret (or service_role) keys power trusted backends and AI agents.
	•	AI can either:
	•	Authenticate as a trusted backend using secret keys, or
	•	Act on behalf of users via OAuth / MCP flows and user JWTs.
	•	Configuration in the Supabase Dashboard (Auth settings, providers, JWT & signing keys, session lifetime) determines how users sign up, log in, and stay authenticated.
	•	Correct use of RLS, key management, and OAuth yields a secure, flexible architecture that AI can safely operate within.

This document should give an AI enough context to:
	•	Connect to Supabase correctly in different environments.
	•	Authenticate users and itself.
	•	Respect and leverage Supabase Auth and RLS semantics.