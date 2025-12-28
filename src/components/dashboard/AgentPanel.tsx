"use client";

import Link from "next/link";

interface AgentPanelProps {
  userDomain: string;
}

export function AgentPanel({ userDomain }: AgentPanelProps) {
  return (
    <section className="bg-gradient-to-br from-emerald-900/20 to-slate-900/40 border border-emerald-700/40 rounded-2xl p-6 mb-6 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-emerald-400">
            🎯 Painel de Gestão (Agent){userDomain && ` | ${userDomain}`}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Como Agent, podes criar colaboradores e gerir permissões de acesso aos teus dispositivos
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/dashboard/collaborators"
          className="group bg-slate-900/70 border border-slate-700 hover:border-emerald-600 rounded-xl p-5 transition-all flex items-center gap-5"
        >
          <div className="w-16 h-16 rounded-xl bg-emerald-600/20 flex items-center justify-center text-3xl flex-shrink-0">
            👥
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="text-base font-semibold text-white">Colaboradores</h3>
            <p className="text-sm text-slate-400">Criar e gerir colaboradores</p>
          </div>
        </Link>
        <Link
          href="/dashboard/groups"
          className="group bg-slate-900/70 border border-slate-700 hover:border-emerald-600 rounded-xl p-5 transition-all flex items-center gap-5"
        >
          <div className="w-16 h-16 rounded-xl bg-blue-600/20 flex items-center justify-center text-3xl flex-shrink-0">
            📦
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="text-base font-semibold text-white">Grupos e Permissões</h3>
            <p className="text-sm text-slate-400">Organizar dispositivos e permissões</p>
          </div>
        </Link>
      </div>
    </section>
  );
}
