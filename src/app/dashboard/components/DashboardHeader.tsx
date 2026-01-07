"use client";

import Link from "next/link";
import { RolePermissions } from "@/lib/permissions-service";

interface DashboardHeaderProps {
  userRole: { name: string; displayName: string };
  userDomain: string;
  userDisplayName: string;
  userPermissions: RolePermissions | null;
  onLogout: () => void;
}

export function DashboardHeader({
  userRole,
  userDomain,
  userDisplayName,
  userPermissions,
  onLogout,
}: DashboardHeaderProps) {
  return (
    <header className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white font-bold text-lg shadow-lg">
          {userDisplayName ? userDisplayName.charAt(0).toUpperCase() : "U"}
        </div>
        <div>
          <h1 className="text-xl font-semibold text-white" data-testid="dashboard-title">
            Painel de Controlo
          </h1>
          {userDomain && (
            <p className="text-xs text-slate-400 mt-0.5">
              Domínio: <span className="text-emerald-400 font-mono">{userDomain}</span>
              {userRole.displayName && (
                <span className="ml-2 px-2 py-0.5 rounded-full bg-slate-700 text-[10px]">
                  {userRole.displayName}
                </span>
              )}
            </p>
          )}
          {userDisplayName && (
            <p className="text-sm text-slate-300">
              {userDisplayName}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {userPermissions?.can_view_users && (
          <Link
            href="/dashboard/users"
            className="px-3 py-1.5 text-sm rounded-md bg-slate-700 hover:bg-slate-600 transition text-white"
          >
            Gestão de Utilizadores
          </Link>
        )}
        <Link
          href="/dashboard/profile"
          className="px-3 py-1.5 text-sm rounded-md bg-slate-700 hover:bg-slate-600 transition text-white"
          data-testid="dashboard-profile-link"
        >
          Perfil
        </Link>
        <button
          onClick={onLogout}
          className="px-3 py-1.5 text-sm rounded-md bg-red-600 hover:bg-red-500 transition text-white"
        >
          Sair
        </button>
      </div>
    </header>
  );
}
