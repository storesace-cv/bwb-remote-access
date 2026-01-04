/**
 * Admin Users Page
 * 
 * Protected by RBAC: only SuperAdmin or Domain Admin can access.
 * Shows users list from Supabase mirror with create functionality.
 */

import Link from "next/link";
import { requireAdmin } from "@/lib/require-admin";
import {
  isSuperAdmin as checkSuperAdmin,
  getAdminRoleLabel,
  type ValidDomain,
  VALID_DOMAINS,
} from "@/lib/rbac-mesh";
import { listMirrorUsers } from "@/lib/user-mirror";
import UsersListClient from "@/components/admin/UsersListClient";

interface PageProps {
  searchParams: Promise<{ domain?: string }>;
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  // This will redirect to /login if not authorized
  const { claims, email } = await requireAdmin();

  if (!claims) {
    return null; // requireAdmin will redirect
  }

  const roleLabel = getAdminRoleLabel(claims);
  const isSuperAdmin = checkSuperAdmin(claims);

  // Determine domain filter
  const params = await searchParams;
  let filterDomain: ValidDomain | null = null;

  if (isSuperAdmin) {
    // SuperAdmin can filter by any domain
    if (params.domain && VALID_DOMAINS.includes(params.domain as ValidDomain)) {
      filterDomain = params.domain as ValidDomain;
    }
  } else if (claims.domain && VALID_DOMAINS.includes(claims.domain as ValidDomain)) {
    // Domain Admin only sees their domain
    filterDomain = claims.domain as ValidDomain;
  }

  // Determine allowed domains for creating users
  const allowedDomains: ValidDomain[] = isSuperAdmin 
    ? [...VALID_DOMAINS]
    : (claims.domain && VALID_DOMAINS.includes(claims.domain as ValidDomain) 
        ? [claims.domain as ValidDomain] 
        : []);

  // Fetch users from mirror (including deleted for admin view)
  let users: Awaited<ReturnType<typeof listMirrorUsers>>["users"] = [];
  let total = 0;
  let fetchError: string | null = null;

  try {
    const result = await listMirrorUsers({
      domain: filterDomain,
      limit: 50,
      offset: 0,
      includeDeleted: true, // Show deactivated users too
    });
    users = result.users;
    total = result.total;
  } catch (err) {
    console.error("Failed to fetch users:", err);
    fetchError = err instanceof Error ? err.message : "Unknown error";
  }

  // Transform users for client component
  const clientUsers = users.map((u) => ({
    id: u.id,
    user_id: u.auth0_user_id || u.id,
    email: u.email,
    display_name: u.display_name,
    is_superadmin_meshcentral: u.is_superadmin_meshcentral,
    is_superadmin_rustdesk: u.is_superadmin_rustdesk,
    created_at: u.created_at,
    deleted_at: u.deleted_at,
    domains: u.domains?.map((d) => ({
      domain: d.domain,
      role: d.role,
    })) || [],
  }));

  return (
    <main className="min-h-screen px-4 py-6 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Gestão de Utilizadores</h1>
            <p className="text-sm text-slate-400 mt-1">
              {isSuperAdmin ? "Todos os domínios" : `Domínio: ${claims.domain || "N/A"}`}
              {" · "}
              <span className={isSuperAdmin ? "text-amber-400" : "text-emerald-400"}>
                {roleLabel}
              </span>
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/auth-status"
              className="px-4 py-2 text-sm rounded-md bg-slate-700 hover:bg-slate-600 transition text-white"
            >
              Sessão
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

        {/* Users List (Client Component) */}
        {fetchError ? (
          <section className="bg-slate-900/70 border border-slate-700 rounded-2xl p-6 backdrop-blur-sm">
            <div className="text-center">
              <p className="text-red-400 mb-2">Erro ao carregar utilizadores</p>
              <p className="text-sm text-slate-500">{fetchError}</p>
              <p className="text-xs text-slate-600 mt-2">
                Verifica se SUPABASE_SERVICE_ROLE_KEY está configurado e a migration foi aplicada.
              </p>
            </div>
          </section>
        ) : (
          <UsersListClient
            initialUsers={clientUsers}
            initialTotal={total}
            allowedDomains={allowedDomains}
            filterDomain={filterDomain}
            currentUserEmail={email}
          />
        )}

        {/* Current Session Info (collapsed) */}
        <details className="mt-6">
          <summary className="text-sm text-slate-500 cursor-pointer hover:text-slate-400">
            Debug: Sessão actual
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
                <label className="block text-xs text-slate-400 mb-1">Domínio</label>
                <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-white">
                  {claims.domain || "Nenhum"}
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Role</label>
                <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-xs font-mono text-purple-300">
                  {claims.role}
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">SuperAdmin</label>
                <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-xs font-mono text-blue-300">
                  {isSuperAdmin ? "Sim" : "Não"}
                </div>
              </div>
            </div>
          </section>
        </details>
      </div>
    </main>
  );
}
