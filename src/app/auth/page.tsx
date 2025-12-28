/**
 * Auth0 Test Page - STEP 1
 * 
 * Minimal page to verify Auth0 integration:
 * - Shows "Login (Auth0)" button if not logged in
 * - Shows user info + claims + logout if logged in
 * 
 * This page runs in PARALLEL with existing Supabase auth.
 * It does NOT replace the existing login flow.
 */

import { getSession } from "@auth0/nextjs-auth0";
import Link from "next/link";

// Custom claims namespace
const CLAIMS_NS = "https://bwb.pt/claims";

interface Auth0Claims {
  email?: string;
  global_roles?: string[];
  org?: string;
  org_roles?: Record<string, string[]>;
}

function extractClaims(user: Record<string, unknown>): Auth0Claims {
  return {
    email: user[`${CLAIMS_NS}/email`] as string | undefined,
    global_roles: user[`${CLAIMS_NS}/global_roles`] as string[] | undefined,
    org: user[`${CLAIMS_NS}/org`] as string | undefined,
    org_roles: user[`${CLAIMS_NS}/org_roles`] as Record<string, string[]> | undefined,
  };
}

export default async function Auth0TestPage() {
  const session = await getSession();
  const user = session?.user;

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-6">
        <h1 className="text-2xl font-bold text-slate-100 text-center">
          Auth0 Integration Test
        </h1>

        {!user ? (
          /* ─────────────────────────────────────────────────────────────────
             NOT LOGGED IN
           ───────────────────────────────────────────────────────────────── */
          <div className="text-center space-y-4">
            <p className="text-slate-400">
              You are not logged in via Auth0.
            </p>
            <a
              href="/api/auth/login"
              className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              Login (Auth0)
            </a>
            <p className="text-sm text-slate-500 mt-4">
              This is a parallel auth flow. Existing Supabase login remains active.
            </p>
          </div>
        ) : (
          /* ─────────────────────────────────────────────────────────────────
             LOGGED IN
           ───────────────────────────────────────────────────────────────── */
          <div className="space-y-4">
            {/* User Info */}
            <div className="bg-slate-800 rounded-lg p-4">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-2">
                User Info
              </h2>
              <p className="text-slate-100">
                <span className="text-slate-400">Email:</span>{" "}
                {user.email || "N/A"}
              </p>
              <p className="text-slate-100">
                <span className="text-slate-400">Sub:</span>{" "}
                <span className="text-xs font-mono">{user.sub}</span>
              </p>
            </div>

            {/* Custom Claims */}
            <div className="bg-slate-800 rounded-lg p-4">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-2">
                Custom Claims (from Auth0 Action)
              </h2>
              <ClaimsDisplay user={user as Record<string, unknown>} />
            </div>

            {/* Logout */}
            <div className="text-center pt-2">
              <a
                href="/api/auth/logout"
                className="inline-block px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
              >
                Logout
              </a>
            </div>

            {/* Back to dashboard */}
            <div className="text-center">
              <Link
                href="/dashboard"
                className="text-sm text-blue-400 hover:text-blue-300 underline"
              >
                ← Back to Dashboard
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

/** Display extracted custom claims */
function ClaimsDisplay({ user }: { user: Record<string, unknown> }) {
  const claims = extractClaims(user);

  const hasAnyClaim =
    claims.email || claims.global_roles || claims.org || claims.org_roles;

  if (!hasAnyClaim) {
    return (
      <p className="text-slate-500 text-sm italic">
        No custom claims found. Ensure Auth0 Post-Login Action is configured.
      </p>
    );
  }

  return (
    <div className="space-y-2 text-sm">
      {claims.email && (
        <div>
          <span className="text-slate-400">email:</span>{" "}
          <span className="text-slate-100">{claims.email}</span>
        </div>
      )}
      {claims.global_roles && claims.global_roles.length > 0 && (
        <div>
          <span className="text-slate-400">global_roles:</span>{" "}
          <span className="text-emerald-400 font-mono">
            {JSON.stringify(claims.global_roles)}
          </span>
        </div>
      )}
      {claims.org && (
        <div>
          <span className="text-slate-400">org:</span>{" "}
          <span className="text-amber-400 font-mono">{claims.org}</span>
        </div>
      )}
      {claims.org_roles && Object.keys(claims.org_roles).length > 0 && (
        <div>
          <span className="text-slate-400">org_roles:</span>
          <pre className="text-purple-400 font-mono text-xs mt-1 bg-slate-900 p-2 rounded overflow-x-auto">
            {JSON.stringify(claims.org_roles, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
