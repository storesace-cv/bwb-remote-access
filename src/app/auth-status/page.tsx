/**
 * Auth Page - Auth0 Session Status
 * 
 * Shows Auth0 authentication status and user claims.
 * This is the ONLY authentication method - Auth0.
 * 
 * If not logged in: Redirects to Auth0 login
 * If logged in: Shows session details and claims
 */

import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
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

export default async function AuthPage() {
  const session = await auth0.getSession();
  const user = session?.user;

  // If not logged in, redirect to Auth0 login
  if (!user) {
    redirect("/auth/login");
  }

  const claims = extractClaims(user as Record<string, unknown>);

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-100">
            Sessão Auth0
          </h1>
          <span className="px-3 py-1 text-xs rounded-full bg-emerald-600/20 text-emerald-400">
            Autenticado
          </span>
        </div>

        {/* User Info */}
        <div className="bg-slate-800 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-2">
            Informação do Utilizador
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
            Claims Personalizadas (Auth0 Action)
          </h2>
          <ClaimsDisplay claims={claims} />
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <Link
            href="/dashboard"
            className="w-full text-center px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors"
          >
            Ir para Dashboard
          </Link>
          
          <a
            href="/auth/logout"
            className="w-full text-center px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
          >
            Terminar Sessão
          </a>
        </div>
      </div>
    </main>
  );
}

/** Display extracted custom claims */
function ClaimsDisplay({ claims }: { claims: Auth0Claims }) {
  const hasAnyClaim =
    claims.email || claims.global_roles || claims.org || claims.org_roles;

  if (!hasAnyClaim) {
    return (
      <p className="text-slate-500 text-sm italic">
        Sem claims personalizadas. Verifica se a Auth0 Post-Login Action está configurada.
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
