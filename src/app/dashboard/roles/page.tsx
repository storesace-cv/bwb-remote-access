"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

interface Role {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  hierarchy_level: number;
  can_access_management_panel: boolean;
  can_access_user_profile: boolean;
  can_scan_qr: boolean;
  can_provision_without_qr: boolean;
  can_view_devices: boolean;
  can_adopt_devices: boolean;
  can_edit_devices: boolean;
  can_delete_devices: boolean;
  can_view_users: boolean;
  can_create_users: boolean;
  can_edit_users: boolean;
  can_delete_users: boolean;
  can_change_user_role: boolean;
  can_view_groups: boolean;
  can_create_groups: boolean;
  can_edit_groups: boolean;
  can_delete_groups: boolean;
  can_assign_permissions: boolean;
  can_access_all_domains: boolean;
  can_access_own_domain_only: boolean;
  can_manage_roles: boolean;
  can_view_audit_logs: boolean;
}

// Agrupar permissões por categoria para melhor UX
const permissionGroups = {
  "Painel de Gestão": [
    { key: "can_access_management_panel", label: "Aceder ao Painel de Gestão" },
    { key: "can_access_user_profile", label: "Aceder ao Perfil de Utilizador" },
    { key: "can_view_audit_logs", label: "Ver Logs de Auditoria" },
  ],
  "Dispositivos": [
    { key: "can_scan_qr", label: "Escanear QR Code" },
    { key: "can_provision_without_qr", label: "Provisionar sem QR" },
    { key: "can_view_devices", label: "Ver Dispositivos" },
    { key: "can_adopt_devices", label: "Adoptar Dispositivos" },
    { key: "can_edit_devices", label: "Editar Dispositivos" },
    { key: "can_delete_devices", label: "Eliminar Dispositivos" },
  ],
  "Utilizadores": [
    { key: "can_view_users", label: "Ver Utilizadores" },
    { key: "can_create_users", label: "Criar Utilizadores" },
    { key: "can_edit_users", label: "Editar Utilizadores" },
    { key: "can_delete_users", label: "Eliminar Utilizadores" },
    { key: "can_change_user_role", label: "Alterar Role de Utilizadores" },
  ],
  "Grupos": [
    { key: "can_view_groups", label: "Ver Grupos" },
    { key: "can_create_groups", label: "Criar Grupos" },
    { key: "can_edit_groups", label: "Editar Grupos" },
    { key: "can_delete_groups", label: "Eliminar Grupos" },
    { key: "can_assign_permissions", label: "Atribuir Permissões" },
  ],
  "Domínio e Administração": [
    { key: "can_access_all_domains", label: "Aceder a Todos os Domínios" },
    { key: "can_access_own_domain_only", label: "Aceder Apenas ao Próprio Domínio" },
    { key: "can_manage_roles", label: "Gerir Roles (esta página)" },
  ],
};

export default function RolesManagementPage() {
  const router = useRouter();
  const [jwt, setJwt] = useState<string | null>(null);
  const [canManageRoles, setCanManageRoles] = useState(false);
  const [accessChecked, setAccessChecked] = useState(false);
  
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Verificar acesso
  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = window.localStorage.getItem("rustdesk_jwt");
    if (!stored) {
      router.replace("/");
      return;
    }

    setJwt(stored);

    // Verificar se tem permissão can_manage_roles
    const checkAccess = async () => {
      try {
        const parts = stored.split(".");
        if (parts.length < 2) {
          router.replace("/dashboard");
          return;
        }

        const payloadJson = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
        const payload = JSON.parse(payloadJson) as { sub?: string };
        
        if (!payload.sub) {
          router.replace("/dashboard");
          return;
        }

        // Buscar user_type e depois verificar can_manage_roles
        const userRes = await fetch(
          `${supabaseUrl}/rest/v1/mesh_users?select=user_type&auth_user_id=eq.${payload.sub}`,
          {
            headers: {
              apikey: anonKey,
              Authorization: `Bearer ${stored}`,
            },
          }
        );

        if (!userRes.ok) {
          router.replace("/dashboard");
          return;
        }

        const userData = await userRes.json() as Array<{ user_type?: string }>;
        if (!userData.length || !userData[0].user_type) {
          router.replace("/dashboard");
          return;
        }

        const userType = userData[0].user_type;

        // Buscar role para verificar can_manage_roles
        const roleRes = await fetch(
          `${supabaseUrl}/rest/v1/roles?select=can_manage_roles&name=eq.${userType}`,
          {
            headers: {
              apikey: anonKey,
              Authorization: `Bearer ${stored}`,
            },
          }
        );

        if (!roleRes.ok) {
          router.replace("/dashboard");
          return;
        }

        const roleData = await roleRes.json() as Array<{ can_manage_roles?: boolean }>;
        if (!roleData.length || !roleData[0].can_manage_roles) {
          router.replace("/dashboard");
          return;
        }

        setCanManageRoles(true);
        setAccessChecked(true);
      } catch {
        router.replace("/dashboard");
      }
    };

    void checkAccess();
  }, [router]);

  // Carregar roles
  const hasFetchedRef = useRef(false);
  
  const fetchRoles = useCallback(async () => {
    if (!jwt) return;
    
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/roles?select=*&order=hierarchy_level.asc`,
        {
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${jwt}`,
          },
        }
      );

      if (!res.ok) {
        throw new Error("Erro ao carregar roles");
      }

      const data = await res.json() as Role[];
      setRoles(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [jwt]);

  useEffect(() => {
    if (!jwt || !accessChecked || !canManageRoles) return;
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    void fetchRoles();
  }, [jwt, accessChecked, canManageRoles, fetchRoles]);

  // Toggle permission
  const togglePermission = async (roleId: string, permissionKey: string, currentValue: boolean) => {
    if (!jwt) return;
    
    setSaving(roleId);
    setSuccessMessage(null);
    setError(null);

    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/roles?id=eq.${roleId}`,
        {
          method: "PATCH",
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${jwt}`,
            "Content-Type": "application/json",
            "Prefer": "return=representation",
          },
          body: JSON.stringify({ [permissionKey]: !currentValue }),
        }
      );

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error((errorData as { message?: string }).message || "Erro ao actualizar permissão");
      }

      // Actualizar estado local
      setRoles(prev => prev.map(role => 
        role.id === roleId 
          ? { ...role, [permissionKey]: !currentValue }
          : role
      ));

      setSuccessMessage("Permissão actualizada com sucesso");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao actualizar");
    } finally {
      setSaving(null);
    }
  };

  if (!accessChecked || !canManageRoles) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950">
        <p className="text-sm text-slate-400">A verificar permissões...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col bg-slate-950">
      <div className="w-full max-w-7xl mx-auto px-4 py-8">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-white">
              Gestão de Roles e Permissões
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Configure as permissões de cada role do sistema
            </p>
          </div>
          <Link
            href="/dashboard"
            className="px-3 py-1.5 text-sm rounded-md bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-100"
          >
            ← Voltar ao painel
          </Link>
        </header>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-sm">
            {successMessage}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-slate-400">A carregar roles...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {roles.map((role) => (
              <section
                key={role.id}
                className="bg-slate-900/70 border border-slate-700 rounded-2xl p-6 backdrop-blur-sm"
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-medium text-white">
                      {role.display_name}
                      <span className="ml-2 text-xs text-slate-500">({role.name})</span>
                    </h2>
                    <p className="text-sm text-slate-400">{role.description}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Nível de hierarquia: {role.hierarchy_level}
                    </p>
                  </div>
                  {saving === role.id && (
                    <span className="text-xs text-amber-400">A guardar...</span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {Object.entries(permissionGroups).map(([groupName, permissions]) => (
                    <div key={groupName} className="space-y-2">
                      <h3 className="text-sm font-medium text-slate-300 border-b border-slate-700 pb-1">
                        {groupName}
                      </h3>
                      <div className="space-y-1">
                        {permissions.map(({ key, label }) => {
                          const permKey = key as keyof Role;
                          const value = role[permKey] as boolean;
                          
                          return (
                            <label
                              key={key}
                              className="flex items-center gap-2 py-1 px-2 rounded hover:bg-slate-800/50 cursor-pointer group"
                            >
                              <input
                                type="checkbox"
                                checked={value}
                                onChange={() => togglePermission(role.id, key, value)}
                                disabled={saving === role.id}
                                className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-900"
                              />
                              <span className={`text-xs ${value ? "text-slate-200" : "text-slate-500"} group-hover:text-slate-200`}>
                                {label}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
