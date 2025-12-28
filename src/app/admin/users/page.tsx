/**
 * Admin Users Page - Skeleton for STEP 2
 * 
 * Protected by RBAC: only SuperAdmin or Domain Admin can access.
 * STEP 3 will implement actual CRUD operations.
 */

import Link from "next/link";
import { requireAdmin } from "@/lib/require-admin";
import {
  isSuperAdminAny,
  isDomainAdminForCurrentOrg,
  getAdminRoleLabel,
} from "@/lib/rbac";

export default async function AdminUsersPage() {
  // This will redirect to /auth if not authorized
  const { claims, email } = await requireAdmin();

  const roleLabel = getAdminRoleLabel(claims);
  const isSuperAdmin = isSuperAdminAny(claims);
  const isDomainAdmin = isDomainAdminForCurrentOrg(claims);

  return (
    <main className="min-h-screen px-4 py-6 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Gestão de Utilizadores</h1>
            <p className="text-sm text-slate-400 mt-1">
              Administração de utilizadores e permissões
            </p>
          </div>
          <Link
            href="/dashboard/profile"
            className="px-4 py-2 text-sm rounded-md bg-slate-700 hover:bg-slate-600 transition text-white"
          >
            ← Voltar ao Perfil
          </Link>
        </header>

        {/* Debug Info Card */}
        <section className="bg-slate-900/70 border border-slate-700 rounded-2xl p-6 mb-6 backdrop-blur-sm">
          <h2 className="text-lg font-medium text-white mb-4">Informação de Acesso</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Email (Auth0)</label>
              <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-white">
                {email || "N/A"}
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Role</label>
              <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm">
                <span className={isSuperAdmin ? "text-amber-400" : "text-emerald-400"}>
                  {roleLabel || "Unknown"}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Organização Actual</label>
              <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-white">
                {claims.org || "Nenhuma"}
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Tipo de Admin</label>
              <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm">
                {isSuperAdmin && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-900/50 text-amber-300 mr-2">
                    SuperAdmin
                  </span>
                )}
                {isDomainAdmin && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-900/50 text-emerald-300">
                    Domain Admin
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Global Roles */}
          {claims.globalRoles.length > 0 && (
            <div className="mt-4">
              <label className="block text-xs text-slate-400 mb-1">Global Roles</label>
              <div className="flex flex-wrap gap-2">
                {claims.globalRoles.map((role) => (
                  <span
                    key={role}
                    className="inline-flex items-center px-2 py-1 rounded text-xs font-mono bg-purple-900/50 text-purple-300"
                  >
                    {role}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Org Roles */}
          {Object.keys(claims.orgRoles).length > 0 && (
            <div className="mt-4">
              <label className="block text-xs text-slate-400 mb-1">Org Roles</label>
              <pre className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-xs text-blue-300 font-mono overflow-x-auto">
                {JSON.stringify(claims.orgRoles, null, 2)}
              </pre>
            </div>
          )}
        </section>

        {/* Placeholder for STEP 3 */}
        <section className="bg-slate-900/70 border border-dashed border-slate-600 rounded-2xl p-8 text-center">
          <div className="text-slate-500 mb-2">
            <svg
              className="w-12 h-12 mx-auto mb-4 opacity-50"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-slate-400 mb-2">
            Lista de Utilizadores
          </h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            STEP 3 irá implementar a listagem e criação de utilizadores.
            Por agora, esta página apenas valida o acesso RBAC.
          </p>
        </section>
      </div>
    </main>
  );
}
