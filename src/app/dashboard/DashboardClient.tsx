"use client";

/**
 * Dashboard Client Component
 * 
 * Handles client-side device management interactions.
 * Auth0 session is already validated by the parent Server Component.
 */

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface DashboardClientProps {
  userEmail: string;
  userDisplayName: string;
  userDomain: string | null;
  isAdmin: boolean;
  roleLabel: string | null;
  orgRoles: Record<string, string[]>;
}

export default function DashboardClient({
  userEmail,
  userDisplayName,
  userDomain,
  isAdmin,
  roleLabel,
  orgRoles,
}: DashboardClientProps) {
  const router = useRouter();

  const handleLogout = useCallback(() => {
    // Clear any legacy tokens
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("rustdesk_jwt");
    }
    // Redirect to Auth0 logout
    router.push("/api/auth/logout");
  }, [router]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-white">
              Olá, {userDisplayName}
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              {userEmail}
              {roleLabel && (
                <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-amber-600/20 text-amber-400">
                  {roleLabel}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/profile"
              className="px-4 py-2 text-sm rounded-md bg-slate-700 hover:bg-slate-600 transition text-white"
            >
              Perfil
            </Link>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm rounded-md bg-red-600/20 hover:bg-red-600/30 transition text-red-400"
            >
              Terminar Sessão
            </button>
          </div>
        </header>

        {/* Quick Actions */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {/* MeshCentral Devices */}
          {(isAdmin || Object.keys(orgRoles).length > 0) && (
            <Link
              href="/mesh/devices"
              className="bg-slate-900/70 border border-cyan-700/50 rounded-xl p-6 hover:bg-slate-800/70 transition group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-cyan-600/20 rounded-lg flex items-center justify-center group-hover:bg-cyan-600/30 transition">
                  <svg
                    className="w-6 h-6 text-cyan-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-medium text-white">
                    Dispositivos MeshCentral
                  </h3>
                  <p className="text-sm text-slate-400">
                    {userDomain ? `Domínio: ${userDomain}` : "Ver todos os dispositivos"}
                  </p>
                </div>
              </div>
            </Link>
          )}

          {/* User Management (Admin only) */}
          {isAdmin && (
            <Link
              href="/admin/users"
              className="bg-slate-900/70 border border-amber-700/50 rounded-xl p-6 hover:bg-slate-800/70 transition group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-amber-600/20 rounded-lg flex items-center justify-center group-hover:bg-amber-600/30 transition">
                  <svg
                    className="w-6 h-6 text-amber-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-medium text-white">
                    Gestão de Utilizadores
                  </h3>
                  <p className="text-sm text-slate-400">
                    Criar, editar e gerir utilizadores
                  </p>
                </div>
              </div>
            </Link>
          )}

          {/* Profile */}
          <Link
            href="/dashboard/profile"
            className="bg-slate-900/70 border border-slate-700 rounded-xl p-6 hover:bg-slate-800/70 transition group"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-700 rounded-lg flex items-center justify-center group-hover:bg-slate-600 transition">
                <svg
                  className="w-6 h-6 text-slate-300"
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
              <div>
                <h3 className="text-lg font-medium text-white">
                  Meu Perfil
                </h3>
                <p className="text-sm text-slate-400">
                  Configurações e informações
                </p>
              </div>
            </div>
          </Link>
        </section>

        {/* Domain Info */}
        <section className="bg-slate-900/70 border border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-medium text-white mb-4">
            Informações da Sessão
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Email</label>
              <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-white">
                {userEmail}
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Organização</label>
              <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-white">
                {userDomain || "Sem organização atribuída"}
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Função</label>
              <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-white">
                {roleLabel || "Utilizador"}
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
      </div>
    </main>
  );
}
