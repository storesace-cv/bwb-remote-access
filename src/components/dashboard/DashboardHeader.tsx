"use client";

import Link from "next/link";

interface DashboardHeaderProps {
  userDisplayName: string;
  isAdmin: boolean;
  onLogout: () => void;
}

export function DashboardHeader({ userDisplayName, isAdmin, onLogout }: DashboardHeaderProps) {
  return (
    <header className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-xl font-semibold text-white">BWB | Suporte Android</h1>
        <div className="flex flex-col">
          <p className="text-sm text-slate-400">© jorge peixinho - Business with Brains</p>
          {userDisplayName && <p className="text-xs text-slate-500">{userDisplayName}</p>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {isAdmin && (
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
