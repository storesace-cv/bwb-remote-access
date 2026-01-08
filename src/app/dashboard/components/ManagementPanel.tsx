"use client";

import Link from "next/link";
import { RolePermissions } from "@/lib/permissions-service";
import { getMeshCentralUrl } from "@/lib/domain";

interface ManagementPanelProps {
  userPermissions: RolePermissions | null;
  userDomain?: string;
}

export function ManagementPanel({ userPermissions, userDomain }: ManagementPanelProps) {
  if (!userPermissions?.can_access_management_panel) {
    return null;
  }

  const handleOpenMeshCentral = () => {
    const url = getMeshCentralUrl(userDomain || "mesh");
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <section className="bg-gradient-to-br from-emerald-900/20 to-slate-900/40 border border-emerald-700/40 rounded-2xl p-6 mb-6 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-medium text-white">Painel de Gestão</h2>
          <p className="text-xs text-slate-400 mt-1">
            Administra utilizadores, grupos e permissões
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Utilizadores */}
        {userPermissions?.can_view_users && (
          <Link
            href="/dashboard/users"
            className="group bg-slate-900/70 border border-slate-700 hover:border-emerald-600 rounded-xl p-4 transition-all hover:shadow-lg hover:shadow-emerald-900/20"
            data-testid="users-link"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-600/20 flex items-center justify-center text-xl">
                👥
              </div>
              <svg className="w-5 h-5 text-slate-600 group-hover:text-emerald-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <h3 className="font-medium text-white mb-1">Utilizadores</h3>
            <p className="text-xs text-slate-400">
              Gerir todos os utilizadores: candidatos, colaboradores e administradores
            </p>
          </Link>
        )}

        {/* Grupos */}
        {userPermissions?.can_view_groups && (
          <Link
            href="/dashboard/groups"
            className="group bg-slate-900/70 border border-slate-700 hover:border-sky-600 rounded-xl p-4 transition-all hover:shadow-lg hover:shadow-sky-900/20"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-sky-600/20 flex items-center justify-center text-xl">
                📁
              </div>
              <svg className="w-5 h-5 text-slate-600 group-hover:text-sky-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <h3 className="font-medium text-white mb-1">Grupos e Permissões</h3>
            <p className="text-xs text-slate-400">
              Organizar dispositivos em grupos e gerir permissões dos colaboradores
            </p>
          </Link>
        )}

        {/* Gestão de Roles */}
        {userPermissions?.can_manage_roles && (
          <Link
            href="/dashboard/roles"
            className="group bg-slate-900/70 border border-slate-700 hover:border-purple-600 rounded-xl p-4 transition-all hover:shadow-lg hover:shadow-purple-900/20"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center text-xl">
                ⚙️
              </div>
              <svg className="w-5 h-5 text-slate-600 group-hover:text-purple-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <h3 className="font-medium text-white mb-1">Gestão de Roles</h3>
            <p className="text-xs text-slate-400">
              Configurar permissões e níveis de acesso para cada tipo de utilizador
            </p>
          </Link>
        )}

        {/* Aceder ao MeshCentral */}
        {userPermissions?.can_access_meshcentral && (
          <button
            type="button"
            onClick={handleOpenMeshCentral}
            className="group bg-slate-900/70 border border-slate-700 hover:border-amber-600 rounded-xl p-4 transition-all hover:shadow-lg hover:shadow-amber-900/20 text-left"
            data-testid="meshcentral-link"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-amber-600/20 flex items-center justify-center text-xl">
                🌐
              </div>
              <svg className="w-5 h-5 text-slate-600 group-hover:text-amber-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </div>
            <h3 className="font-medium text-white mb-1">Aceder ao MeshCentral</h3>
            <p className="text-xs text-slate-400">
              Abrir o painel MeshCentral do domínio {userDomain || "mesh"}.bwb.pt
            </p>
          </button>
        )}
      </div>
    </section>
  );
}
