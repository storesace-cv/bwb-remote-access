/**
 * Auth Status Page - Session Status
 * 
 * Shows current authentication status and session details.
 * 
 * If not logged in: Redirects to login
 * If logged in: Shows session details
 */

import { redirect } from "next/navigation";
import { getSession } from "@/lib/mesh-auth";
import { getUserClaims } from "@/lib/rbac-mesh";
import Link from "next/link";

export default async function AuthStatusPage() {
  const session = await getSession();

  // If not logged in, redirect to login
  if (!session?.authenticated) {
    redirect("/login");
  }

  const claims = await getUserClaims(session);

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-100">
            Estado da Sessão
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
            {session.email}
          </p>
          <p className="text-slate-100">
            <span className="text-slate-400">Domínio:</span>{" "}
            <span className="text-amber-400 font-mono">{session.domain}</span>
          </p>
        </div>

        {/* Session Info */}
        <div className="bg-slate-800 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-2">
            Detalhes da Sessão
          </h2>
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-slate-400">Autenticado em:</span>{" "}
              <span className="text-slate-100">
                {new Date(session.authenticatedAt).toLocaleString("pt-PT")}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Expira em:</span>{" "}
              <span className="text-slate-100">
                {new Date(session.expiresAt).toLocaleString("pt-PT")}
              </span>
            </div>
            {claims && (
              <>
                <div>
                  <span className="text-slate-400">Role:</span>{" "}
                  <span className="text-emerald-400 font-mono">{claims.role}</span>
                </div>
                {claims.isSuperAdmin && (
                  <div>
                    <span className="px-2 py-0.5 text-xs rounded bg-amber-600/20 text-amber-400">
                      SuperAdmin
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
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
            href="/api/auth/logout"
            className="w-full text-center px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
          >
            Terminar Sessão
          </a>
        </div>
      </div>
    </main>
  );
}
