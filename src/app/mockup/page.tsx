/**
 * TEMPORARY MOCKUP PAGE - For preview purposes only
 * Shows dashboard and admin layouts without authentication
 */

import Link from "next/link";

export default function MockupPage() {
  // Simulated data
  const userEmail = "admin@bwb.pt";
  const userDisplayName = "Admin";
  const userDomain = "mesh";
  const isAdmin = true;
  const roleLabel = "Site Admin";

  const mockUsers = [
    { id: "1", mesh_username: "siteadmin", email: "siteadmin@bwb.pt", display_name: "Site Admin", user_type: "siteadmin", domain: "mesh", disabled: false },
    { id: "2", mesh_username: "miniadmin", email: "miniadmin@bwb.pt", display_name: "Mini Admin", user_type: "minisiteadmin", domain: "zonetech", disabled: false },
    { id: "3", mesh_username: "agent1", email: "agent1@bwb.pt", display_name: "Agente João", user_type: "agent", domain: "mesh", disabled: false },
    { id: "4", mesh_username: "colab1", email: "colab1@bwb.pt", display_name: "Maria Silva", user_type: "colaborador", domain: "mesh", disabled: false },
    { id: "5", mesh_username: "inactive1", email: "inactive1@bwb.pt", display_name: "Pedro Costa", user_type: "inactivo", domain: "zsangola", disabled: true },
  ];

  const USER_TYPE_LABELS: Record<string, string> = {
    siteadmin: "Site Admin",
    minisiteadmin: "Mini Admin",
    agent: "Agente",
    colaborador: "Colaborador",
    inactivo: "Inativo",
    candidato: "Candidato",
  };

  const USER_TYPE_COLORS: Record<string, string> = {
    siteadmin: "bg-amber-600/20 text-amber-400",
    minisiteadmin: "bg-purple-600/20 text-purple-400",
    agent: "bg-blue-600/20 text-blue-400",
    colaborador: "bg-emerald-600/20 text-emerald-400",
    inactivo: "bg-slate-600/20 text-slate-400",
    candidato: "bg-orange-600/20 text-orange-400",
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Navigation */}
      <nav className="bg-slate-900/80 border-b border-slate-700 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <span className="text-cyan-400 font-bold">BWB Remote Access - MOCKUP</span>
          <div className="flex gap-2">
            <Link href="#dashboard" className="px-3 py-1.5 text-xs rounded bg-cyan-600 text-white">Dashboard</Link>
            <Link href="#users" className="px-3 py-1.5 text-xs rounded bg-amber-600 text-white">Gestão Utilizadores</Link>
          </div>
        </div>
      </nav>

      {/* === DASHBOARD MOCKUP === */}
      <section id="dashboard" className="max-w-5xl mx-auto px-4 py-8 border-b border-slate-700">
        <div className="mb-4 px-3 py-2 bg-cyan-900/30 border border-cyan-700 rounded text-cyan-300 text-sm">
          📱 MOCKUP: Dashboard (após login)
        </div>
        
        {/* Header */}
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-white">
              Olá, {userDisplayName}
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              {userEmail}
              <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-amber-600/20 text-amber-400">
                {roleLabel}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button className="px-4 py-2 text-sm rounded-md bg-slate-700 hover:bg-slate-600 transition text-white">
              Perfil
            </button>
            <button className="px-4 py-2 text-sm rounded-md bg-red-600/20 hover:bg-red-600/30 transition text-red-400">
              Terminar Sessão
            </button>
          </div>
        </header>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {/* MeshCentral Devices */}
          <div className="bg-slate-900/70 border border-cyan-700/50 rounded-xl p-6 hover:bg-slate-800/70 transition group cursor-pointer">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-cyan-600/20 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-medium text-white">Dispositivos MeshCentral</h3>
                <p className="text-sm text-slate-400">Domínio: {userDomain}</p>
              </div>
            </div>
          </div>

          {/* User Management (Admin only) */}
          {isAdmin && (
            <div className="bg-slate-900/70 border border-amber-700/50 rounded-xl p-6 hover:bg-slate-800/70 transition group cursor-pointer">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-amber-600/20 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-medium text-white">Gestão de Utilizadores</h3>
                  <p className="text-sm text-slate-400">Criar, editar e gerir utilizadores</p>
                </div>
              </div>
            </div>
          )}

          {/* Profile */}
          <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-6 hover:bg-slate-800/70 transition group cursor-pointer">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-700 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-medium text-white">Meu Perfil</h3>
                <p className="text-sm text-slate-400">Configurações e informações</p>
              </div>
            </div>
          </div>
        </div>

        {/* Session Info */}
        <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-medium text-white mb-4">Informações da Sessão</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Email</label>
              <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-white">{userEmail}</div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Organização</label>
              <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-white">{userDomain}</div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Função</label>
              <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-white">{roleLabel}</div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Autenticação</label>
              <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-emerald-400">✓ MeshCentral</div>
            </div>
          </div>
        </div>
      </section>

      {/* === ADMIN USERS MOCKUP === */}
      <section id="users" className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-4 px-3 py-2 bg-amber-900/30 border border-amber-700 rounded text-amber-300 text-sm">
          👥 MOCKUP: Gestão de Utilizadores (admin only)
        </div>

        {/* Header */}
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Gestão de Utilizadores</h1>
            <p className="text-sm text-slate-400 mt-1">
              Todos os domínios · <span className="text-amber-400">Site Admin</span>
            </p>
          </div>
          <div className="flex gap-3">
            <button className="px-4 py-2 text-sm rounded-md bg-slate-700 hover:bg-slate-600 transition text-white">Sessão</button>
            <button className="px-4 py-2 text-sm rounded-md bg-slate-700 hover:bg-slate-600 transition text-white">← Voltar ao Perfil</button>
          </div>
        </header>

        {/* Domain Filter */}
        <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-4 mb-6 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-400">Filtrar por domínio:</span>
            <div className="flex gap-2">
              <button className="px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white">Todos</button>
              <button className="px-3 py-1.5 text-xs rounded-md bg-slate-800 text-slate-300 hover:bg-slate-700">mesh</button>
              <button className="px-3 py-1.5 text-xs rounded-md bg-slate-800 text-slate-300 hover:bg-slate-700">zonetech</button>
              <button className="px-3 py-1.5 text-xs rounded-md bg-slate-800 text-slate-300 hover:bg-slate-700">zsangola</button>
            </div>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-slate-900/70 border border-slate-700 rounded-2xl p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-medium text-white">Utilizadores</h2>
              <p className="text-sm text-slate-400">{mockUsers.length} utilizadores encontrados</p>
            </div>
            <div className="flex gap-2">
              <button className="px-3 py-1.5 text-xs rounded-md bg-slate-700 hover:bg-slate-600 transition text-white">↻ Atualizar</button>
              <button className="px-3 py-1.5 text-xs rounded-md bg-emerald-600 hover:bg-emerald-500 transition text-white">+ Criar Utilizador</button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left text-xs text-slate-400 uppercase">
                  <th className="pb-3 pl-2">Utilizador</th>
                  <th className="pb-3">Tipo</th>
                  <th className="pb-3">Domínio</th>
                  <th className="pb-3">Estado</th>
                  <th className="pb-3 pr-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {mockUsers.map((user) => (
                  <tr key={user.id} className={`${user.disabled ? "opacity-50" : ""} hover:bg-slate-800/50`}>
                    <td className="py-3 pl-2">
                      <div className="flex flex-col">
                        <span className="text-white font-medium">{user.display_name}</span>
                        <span className="text-xs text-slate-500">{user.email}</span>
                      </div>
                    </td>
                    <td className="py-3">
                      <span className={`px-2 py-1 text-xs rounded ${USER_TYPE_COLORS[user.user_type]}`}>
                        {USER_TYPE_LABELS[user.user_type]}
                        <span className="ml-1 opacity-50">▼</span>
                      </span>
                    </td>
                    <td className="py-3">
                      <span className="text-xs text-cyan-400 font-mono">{user.domain}</span>
                    </td>
                    <td className="py-3">
                      {user.disabled ? (
                        <span className="text-xs text-orange-400">Inativo</span>
                      ) : (
                        <span className="text-xs text-emerald-400">Ativo</span>
                      )}
                    </td>
                    <td className="py-3 pr-2">
                      <div className="flex justify-end gap-1">
                        <button className="p-1.5 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-300">↻</button>
                        <button className="p-1.5 text-xs rounded bg-red-700 hover:bg-red-600 text-white">✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
