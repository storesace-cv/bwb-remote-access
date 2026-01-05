/**
 * Profile Page
 * 
 * Displays user profile information from session and database.
 * Shows role/permissions and account details.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/mesh-auth";
import { createClient } from "@supabase/supabase-js";
import { ROLE_DISPLAY_NAMES, ROLE_COLORS, type RoleName } from "@/lib/rbac";

// Get user data from Supabase
async function getUserData(authUserId: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.warn("[Profile] Supabase not configured");
    return null;
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // Get user with role
  const { data: userData, error } = await supabase
    .from("mesh_users")
    .select(`
      id,
      mesh_username,
      email,
      full_name,
      display_name,
      domain,
      created_at,
      role_id,
      roles:role_id (
        id,
        name,
        display_name,
        hierarchy_level
      )
    `)
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  
  if (error) {
    console.error("[Profile] Error fetching user:", error);
    return null;
  }
  
  return userData;
}

export default async function ProfilePage() {
  const session = await getSession();
  
  if (!session?.authenticated) {
    redirect("/");
  }

  // Get user data from database if we have auth_user_id in session
  let userData = null;
  if (session.userId) {
    // Try to get by mesh_users.id first
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data } = await supabase
        .from("mesh_users")
        .select(`
          id,
          mesh_username,
          email,
          full_name,
          display_name,
          domain,
          created_at,
          auth_user_id,
          role_id,
          roles:role_id (
            id,
            name,
            display_name,
            hierarchy_level
          )
        `)
        .eq("id", session.userId)
        .maybeSingle();
      
      userData = data;
    }
  }
  
  // Fallback values from session
  const userEmail = userData?.email || session.email;
  const userDisplayName = userData?.display_name || userData?.full_name || session.email.split("@")[0];
  const userDomain = userData?.domain || session.domain;
  const userCreatedAt = userData?.created_at;
  
  // Get role info
  const roleData = userData?.roles as { id: string; name: string; display_name: string; hierarchy_level: number } | null;
  const roleName = (roleData?.name || 'colaborador') as RoleName;
  const roleDisplayName = roleData?.display_name || ROLE_DISPLAY_NAMES[roleName] || 'Colaborador';
  const roleColors = ROLE_COLORS[roleName] || ROLE_COLORS.colaborador;

  return (
    <main className="min-h-screen px-4 py-6 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-white">Perfil de Utilizador</h1>
            <p className="text-sm text-slate-400">Informações da conta</p>
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
            </div>

            {/* User Info */}
            <div className="flex-1">
              <h2 className="text-2xl font-semibold text-white">{userDisplayName}</h2>
              <p className="text-slate-400">{userEmail}</p>
              <span className={`inline-block mt-2 px-3 py-1 text-sm rounded-full ${roleColors.bg} ${roleColors.text}`}>
                {roleDisplayName}
              </span>
            </div>
          </div>
        </section>

        {/* Account Details - RustDesk/App Data */}
        <section className="bg-slate-900/70 border border-slate-700 rounded-2xl p-6 mb-6 backdrop-blur-sm">
          <h2 className="text-lg font-medium mb-4 text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Dados da Conta RustDesk
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Email</label>
              <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-white">
                {userEmail}
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Domínio</label>
              <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-white">
                {userDomain}
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Perfil</label>
              <div className={`px-3 py-2 bg-slate-800 border rounded-md text-sm ${roleColors.text} ${roleColors.border}`}>
                {roleDisplayName}
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Membro desde</label>
              <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-white">
                {userCreatedAt 
                  ? new Date(userCreatedAt).toLocaleDateString('pt-PT', { 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })
                  : 'N/A'
                }
              </div>
            </div>
          </div>
        </section>

        {/* MeshCentral Account Details */}
        <section className="bg-slate-900/70 border border-cyan-700/50 rounded-2xl p-6 mb-6 backdrop-blur-sm">
          <h2 className="text-lg font-medium mb-4 text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
            Dados MeshCentral
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Autenticação</label>
              <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-emerald-400">
                ✓ MeshCentral
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Sessão</label>
              <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-emerald-400">
                ✓ Ativa
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs text-slate-400 mb-1">Servidor MeshCentral</label>
              <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-white">
                {userDomain}
              </div>
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t border-cyan-700/30">
            <Link
              href="/mesh/devices"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-cyan-600 hover:bg-cyan-500 transition text-white"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
              Ver Dispositivos MeshCentral
            </Link>
          </div>
        </section>

        {/* Security Notice */}
        <section className="bg-slate-900/70 border border-slate-700 rounded-2xl p-6 backdrop-blur-sm">
          <h2 className="text-lg font-medium mb-4 text-white">Segurança</h2>
          
          <div className="space-y-4">
            <div className="flex items-start gap-3 text-sm">
              <svg className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <div>
                <p className="text-slate-300">Autenticação Segura via MeshCentral</p>
                <p className="text-slate-500 text-xs">
                  A tua sessão é gerida pelo MeshCentral. Para alterar a password,
                  utiliza o painel MeshCentral.
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
