/**
 * Admin Users Page - STEP 3
 * 
 * Protected by RBAC: only SuperAdmin or Domain Admin can access.
 * Shows users list from Supabase mirror.
 */

import Link from "next/link";
import { requireAdmin } from "@/lib/require-admin";
import {
  isSuperAdminAny,
  isDomainAdminForCurrentOrg,
  getAdminRoleLabel,
} from "@/lib/rbac";
import { listMirrorUsers } from "@/lib/user-mirror";
import { syncUserToMirror } from "@/lib/user-mirror";
import { auth0 } from "@/lib/auth0";
import { getClaimsFromAuth0Session } from "@/lib/rbac";

type ValidDomain = "mesh" | "zonetech" | "zsangola";
const VALID_DOMAINS: ValidDomain[] = ["mesh", "zonetech", "zsangola"];

interface PageProps {
  searchParams: Promise<{ domain?: string }>;
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  // This will redirect to /auth if not authorized
  const { claims, email, sub } = await requireAdmin();

  const roleLabel = getAdminRoleLabel(claims);
  const isSuperAdmin = isSuperAdminAny(claims);
  const isDomainAdmin = isDomainAdminForCurrentOrg(claims);

  // Sync current user to mirror on page load
  if (sub) {
    try {
      const session = await auth0.getSession();
      const displayName = (session?.user?.name as string) || (session?.user?.nickname as string) || null;
      await syncUserToMirror(sub, claims, displayName);
    } catch (syncError) {
      console.error("Failed to sync current user (non-fatal):", syncError);
    }
  }

  // Determine domain filter
  const params = await searchParams;
  let filterDomain: ValidDomain | null = null;

  if (isSuperAdmin) {
    // SuperAdmin can filter by any domain
    if (params.domain && VALID_DOMAINS.includes(params.domain as ValidDomain)) {
      filterDomain = params.domain as ValidDomain;
    }
  } else if (claims.org && VALID_DOMAINS.includes(claims.org as ValidDomain)) {
    // Domain Admin only sees their org
    filterDomain = claims.org as ValidDomain;
  }

  // Fetch users from mirror
  let users: Awaited<ReturnType<typeof listMirrorUsers>>["users"] = [];
  let total = 0;
  let fetchError: string | null = null;

  try {
    const result = await listMirrorUsers({
      domain: filterDomain,
      limit: 50,
      offset: 0,
    });
    users = result.users;
    total = result.total;
  } catch (err) {
    console.error("Failed to fetch users:", err);
    fetchError = err instanceof Error ? err.message : "Unknown error";
  }

  return (
    <main className="min-h-screen px-4 py-6 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Gestão de Utilizadores</h1>
            <p className="text-sm text-slate-400 mt-1">
              {isSuperAdmin ? "Todos os domínios" : `Domínio: ${claims.org || "N/A"}`}
              {" · "}
              <span className={isSuperAdmin ? "text-amber-400" : "text-emerald-400"}>
                {roleLabel}
              </span>
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/auth"
              className="px-4 py-2 text-sm rounded-md bg-slate-700 hover:bg-slate-600 transition text-white"
            >
              Auth0 Test
            </Link>
            <Link
              href="/dashboard/profile"
              className="px-4 py-2 text-sm rounded-md bg-slate-700 hover:bg-slate-600 transition text-white"
            >
              ← Voltar ao Perfil
            </Link>
          </div>
        </header>

        {/* Domain Filter (SuperAdmin only) */}
        {isSuperAdmin && (
          <section className="bg-slate-900/70 border border-slate-700 rounded-xl p-4 mb-6 backdrop-blur-sm">
            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-400">Filtrar por domínio:</span>
              <div className="flex gap-2">
                <Link
                  href="/admin/users"
                  className={`px-3 py-1.5 text-xs rounded-md transition ${
                    !filterDomain
                      ? "bg-blue-600 text-white"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  Todos
                </Link>
                {VALID_DOMAINS.map((d) => (
                  <Link
                    key={d}
                    href={`/admin/users?domain=${d}`}
                    className={`px-3 py-1.5 text-xs rounded-md transition ${
                      filterDomain === d
                        ? "bg-blue-600 text-white"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    {d}
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Users List */}
        <section className="bg-slate-900/70 border border-slate-700 rounded-2xl backdrop-blur-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
            <h2 className="text-lg font-medium text-white">
              Utilizadores ({total})
            </h2>
            {/* Placeholder for STEP 4 - Create User */}
            <button
              disabled
              className="px-4 py-2 text-sm rounded-md bg-slate-700 text-slate-500 cursor-not-allowed"
              title="STEP 4 irá implementar criação de utilizadores"
            >
              + Criar Utilizador (STEP 4)
            </button>
          </div>

          {fetchError ? (
            <div className="p-6 text-center">
              <p className="text-red-400 mb-2">Erro ao carregar utilizadores</p>
              <p className="text-sm text-slate-500">{fetchError}</p>
              <p className="text-xs text-slate-600 mt-2">
                Verifica se SUPABASE_SERVICE_ROLE_KEY está configurado e a migration foi aplicada.
              </p>
            </div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center">
              <svg
                className="w-12 h-12 mx-auto mb-4 text-slate-600"
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
              <h3 className="text-lg font-medium text-slate-400 mb-2">
                Nenhum utilizador encontrado
              </h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                Os utilizadores aparecem aqui após fazerem login via Auth0.
                {filterDomain && ` (filtrado por domínio: ${filterDomain})`}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-slate-400 uppercase tracking-wider">
                    <th className="px-6 py-3 font-medium">Utilizador</th>
                    <th className="px-6 py-3 font-medium">Domínios & Roles</th>
                    <th className="px-6 py-3 font-medium">SuperAdmin</th>
                    <th className="px-6 py-3 font-medium">Criado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-800/50 transition">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm text-white font-medium">
                            {user.display_name || user.email.split("@")[0]}
                          </span>
                          <span className="text-xs text-slate-400">{user.email}</span>
                          <span className="text-xs text-slate-600 font-mono mt-1">
                            {user.auth0_user_id.substring(0, 20)}...
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {user.domains.length === 0 ? (
                            <span className="text-xs text-slate-500 italic">Sem domínios</span>
                          ) : (
                            user.domains.map((d, idx) => (
                              <span
                                key={idx}
                                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                  d.role === "DOMAIN_ADMIN"
                                    ? "bg-emerald-900/50 text-emerald-300"
                                    : "bg-blue-900/50 text-blue-300"
                                }`}
                              >
                                {d.domain}: {d.role}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {user.is_superadmin_meshcentral && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-900/50 text-amber-300">
                              MeshCentral
                            </span>
                          )}
                          {user.is_superadmin_rustdesk && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-900/50 text-amber-300">
                              RustDesk
                            </span>
                          )}
                          {!user.is_superadmin_meshcentral && !user.is_superadmin_rustdesk && (
                            <span className="text-xs text-slate-500">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs text-slate-400">
                          {new Date(user.created_at).toLocaleDateString("pt-PT", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Current Session Info (collapsed) */}
        <details className="mt-6">
          <summary className="text-sm text-slate-500 cursor-pointer hover:text-slate-400">
            Debug: Sessão Auth0 actual
          </summary>
          <section className="mt-3 bg-slate-900/70 border border-slate-700 rounded-xl p-4 backdrop-blur-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Email</label>
                <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-white">
                  {email || "N/A"}
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Organização</label>
                <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-white">
                  {claims.org || "Nenhuma"}
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Global Roles</label>
                <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-xs font-mono text-purple-300">
                  {claims.globalRoles.length > 0 ? JSON.stringify(claims.globalRoles) : "[]"}
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Org Roles</label>
                <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-xs font-mono text-blue-300">
                  {Object.keys(claims.orgRoles).length > 0 ? JSON.stringify(claims.orgRoles) : "{}"}
                </div>
              </div>
            </div>
          </section>
        </details>
      </div>
    </main>
  );
}
