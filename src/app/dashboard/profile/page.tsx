/**
 * Profile Page - Auth0 Only
 * 
 * Displays user profile information from Auth0 session.
 * Provides access to admin areas based on RBAC claims.
 * 
 * NO local password management (Auth0 handles that).
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { auth0 } from "@/lib/auth0";
import { getClaimsFromAuth0Session, canManageUsers, getAdminRoleLabel, isSuperAdminAny } from "@/lib/rbac";

export default async function ProfilePage() {
  // Get Auth0 session
  const session = await auth0.getSession();
  
  if (!session?.user) {
    redirect("/");
  }

  // Extract claims and user info
  const claims = getClaimsFromAuth0Session(session);
  const isAdmin = canManageUsers(claims);
  const isSuperAdmin = isSuperAdminAny(claims);
  const roleLabel = getAdminRoleLabel(claims);
  
  const user = session.user;
  const userEmail = claims.email || user.email as string || "N/A";
  const userDisplayName = user.name as string || user.nickname as string || userEmail;
  const userSub = user.sub as string;
  const userPicture = user.picture as string | null;

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "N/A";
    try {
      return new Date(dateString).toLocaleString("pt-PT", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateString;
    }
  };

  return (
    <main className="min-h-screen px-4 py-6 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-white">Perfil de Utilizador</h1>
            <p className="text-sm text-slate-400">Informações da conta Auth0</p>
          </div>
          <Link
            href="/dashboard"
            className="px-3 py-1.5 text-sm rounded-md bg-slate-700 hover:bg-slate-600 transition text-white"
          >
            ← Voltar
          </Link>
        </header>

        {/* User Card */}
        <section className="bg-slate-900/70 border border-slate-700 rounded-2xl p-6 mb-6 backdrop-blur-sm">
          <div className="flex items-start gap-6">
            {/* Avatar */}
            <div className="flex-shrink-0">
              {userPicture ? (
                <img
                  src={userPicture}
                  alt={userDisplayName}
                  className="w-20 h-20 rounded-full border-2 border-slate-600"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-slate-700 flex items-center justify-center">
                  <svg
                    className="w-10 h-10 text-slate-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </div>
              )}
            </div>

            {/* User Info */}
            <div className="flex-1">
              <h2 className="text-2xl font-semibold text-white">{userDisplayName}</h2>
              <p className="text-slate-400">{userEmail}</p>
              {roleLabel && (
                <span className="inline-block mt-2 px-3 py-1 text-sm rounded-full bg-amber-600/20 text-amber-400">
                  {roleLabel}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Account Details */}
        <section className="bg-slate-900/70 border border-slate-700 rounded-2xl p-6 mb-6 backdrop-blur-sm">
          <h2 className="text-lg font-medium mb-4 text-white">Detalhes da Conta</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Email</label>
              <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-white">
                {userEmail}
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Auth0 ID</label>
              <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-xs text-slate-300 font-mono">
                {userSub}
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Organização</label>
              <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-white">
                {claims.org || "Sem organização"}
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Autenticação</label>
              <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-emerald-400">
                ✓ Auth0 (Single Sign-On)
              </div>
            </div>
          </div>
        </section>

        {/* Roles & Permissions */}
        <section className="bg-slate-900/70 border border-slate-700 rounded-2xl p-6 mb-6 backdrop-blur-sm">
          <h2 className="text-lg font-medium mb-4 text-white">Funções e Permissões</h2>
          
          <div className="space-y-4">
            {/* Global Roles */}
            <div>
              <label className="block text-xs text-slate-400 mb-2">Funções Globais</label>
              <div className="flex flex-wrap gap-2">
                {claims.globalRoles.length > 0 ? (
                  claims.globalRoles.map((role) => (
                    <span
                      key={role}
                      className="px-3 py-1 text-xs rounded-full bg-purple-600/20 text-purple-400"
                    >
                      {role}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-slate-500">Sem funções globais</span>
                )}
              </div>
            </div>

            {/* Org Roles */}
            <div>
              <label className="block text-xs text-slate-400 mb-2">Funções por Organização</label>
              {Object.keys(claims.orgRoles).length > 0 ? (
                <div className="space-y-2">
                  {Object.entries(claims.orgRoles).map(([org, roles]) => (
                    <div key={org} className="flex items-center gap-3">
                      <span className="text-sm text-slate-300 min-w-[100px]">{org}:</span>
                      <div className="flex flex-wrap gap-2">
                        {roles.map((role) => (
                          <span
                            key={`${org}-${role}`}
                            className="px-3 py-1 text-xs rounded-full bg-emerald-600/20 text-emerald-400"
                          >
                            {role}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-sm text-slate-500">Sem funções de organização</span>
              )}
            </div>
          </div>
        </section>

        {/* Admin Section */}
        {isAdmin && (
          <section className="bg-slate-900/70 border border-amber-700/50 rounded-2xl p-6 mb-6 backdrop-blur-sm">
            <h2 className="text-lg font-medium mb-4 text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Área de Administração
            </h2>
            
            <div className="flex flex-wrap gap-4">
              <Link
                href="/admin/users"
                className="px-5 py-2.5 text-sm font-medium rounded-lg bg-amber-600 hover:bg-amber-500 transition text-white flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Gestão de Utilizadores
              </Link>
            </div>
          </section>
        )}

        {/* MeshCentral Devices Section */}
        {(isAdmin || Object.keys(claims.orgRoles).length > 0) && (
          <section className="bg-slate-900/70 border border-cyan-700/50 rounded-2xl p-6 mb-6 backdrop-blur-sm">
            <h2 className="text-lg font-medium mb-4 text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
              Dispositivos MeshCentral
            </h2>
            
            <div className="flex flex-wrap gap-4">
              <Link
                href="/mesh/devices"
                className="px-5 py-2.5 text-sm font-medium rounded-lg bg-cyan-600 hover:bg-cyan-500 transition text-white flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
                Ver Dispositivos
              </Link>
            </div>
          </section>
        )}

        {/* Security Notice */}
        <section className="bg-slate-900/70 border border-slate-700 rounded-2xl p-6 backdrop-blur-sm">
          <h2 className="text-lg font-medium mb-4 text-white">Segurança</h2>
          
          <div className="space-y-4">
            <div className="flex items-start gap-3 text-sm">
              <svg className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <div>
                <p className="text-slate-300">Autenticação Segura via Auth0</p>
                <p className="text-slate-500 text-xs">
                  A tua sessão é gerida pelo Auth0. Para alterar a password ou configurações de segurança,
                  utiliza o painel de conta do Auth0.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-700">
              <a
                href="/api/auth/logout"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-red-600/20 hover:bg-red-600/30 transition text-red-400"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Terminar Sessão
              </a>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
