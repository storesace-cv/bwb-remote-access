"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Shield, ChevronDown, ChevronRight, Check, X, Settings, Users, Monitor, FolderTree, Globe } from "lucide-react";

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

// Agrupar permissões por categoria
const permissionGroups = [
  {
    name: "Painel de Gestão",
    icon: Settings,
    color: "emerald",
    permissions: [
      { key: "can_access_management_panel", label: "Aceder ao Painel de Gestão", description: "Permite ver o painel de gestão" },
      { key: "can_access_user_profile", label: "Aceder ao Perfil", description: "Permite aceder ao perfil pessoal" },
      { key: "can_view_audit_logs", label: "Ver Logs de Auditoria", description: "Permite visualizar histórico de acções" },
    ],
  },
  {
    name: "Dispositivos",
    icon: Monitor,
    color: "sky",
    permissions: [
      { key: "can_scan_qr", label: "Escanear QR Code", description: "Permite adicionar dispositivos via QR" },
      { key: "can_provision_without_qr", label: "Provisionar sem QR", description: "Permite adicionar dispositivos sem câmara" },
      { key: "can_view_devices", label: "Ver Dispositivos", description: "Permite listar dispositivos" },
      { key: "can_adopt_devices", label: "Adoptar Dispositivos", description: "Permite adoptar dispositivos pendentes" },
      { key: "can_edit_devices", label: "Editar Dispositivos", description: "Permite modificar dados dos dispositivos" },
      { key: "can_delete_devices", label: "Eliminar Dispositivos", description: "Permite remover dispositivos" },
    ],
  },
  {
    name: "Utilizadores",
    icon: Users,
    color: "amber",
    permissions: [
      { key: "can_view_users", label: "Ver Utilizadores", description: "Permite listar utilizadores" },
      { key: "can_create_users", label: "Criar Utilizadores", description: "Permite adicionar novos utilizadores" },
      { key: "can_edit_users", label: "Editar Utilizadores", description: "Permite modificar dados dos utilizadores" },
      { key: "can_delete_users", label: "Eliminar Utilizadores", description: "Permite remover utilizadores" },
      { key: "can_change_user_role", label: "Alterar Role", description: "Permite alterar o role dos utilizadores" },
    ],
  },
  {
    name: "Grupos",
    icon: FolderTree,
    color: "purple",
    permissions: [
      { key: "can_view_groups", label: "Ver Grupos", description: "Permite listar grupos" },
      { key: "can_create_groups", label: "Criar Grupos", description: "Permite adicionar novos grupos" },
      { key: "can_edit_groups", label: "Editar Grupos", description: "Permite modificar grupos" },
      { key: "can_delete_groups", label: "Eliminar Grupos", description: "Permite remover grupos" },
      { key: "can_assign_permissions", label: "Atribuir Permissões", description: "Permite gerir permissões dos grupos" },
    ],
  },
  {
    name: "Domínio e Administração",
    icon: Globe,
    color: "rose",
    permissions: [
      { key: "can_access_all_domains", label: "Todos os Domínios", description: "Acesso total a todos os domínios" },
      { key: "can_access_own_domain_only", label: "Apenas Próprio Domínio", description: "Acesso limitado ao próprio domínio" },
      { key: "can_manage_roles", label: "Gerir Roles", description: "Permite configurar esta página" },
    ],
  },
];

const colorClasses: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  emerald: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400", icon: "text-emerald-500" },
  sky: { bg: "bg-sky-500/10", border: "border-sky-500/30", text: "text-sky-400", icon: "text-sky-500" },
  amber: { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400", icon: "text-amber-500" },
  purple: { bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-400", icon: "text-purple-500" },
  rose: { bg: "bg-rose-500/10", border: "border-rose-500/30", text: "text-rose-400", icon: "text-rose-500" },
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

  // Expandir/colapsar roles
  const [expandedRoles, setExpandedRoles] = useState<Record<string, boolean>>({});
  // Expandir/colapsar grupos de permissões dentro de cada role
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Verificar acesso
  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = window.localStorage.getItem("rustdesk_jwt");
    if (!stored) {
      router.replace("/");
      return;
    }

    setJwt(stored);

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

        const userData = (await userRes.json()) as Array<{ user_type?: string }>;
        if (!userData.length || !userData[0].user_type) {
          router.replace("/dashboard");
          return;
        }

        const userType = userData[0].user_type;

        const roleRes = await fetch(`${supabaseUrl}/rest/v1/roles?select=can_manage_roles&name=eq.${userType}`, {
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${stored}`,
          },
        });

        if (!roleRes.ok) {
          router.replace("/dashboard");
          return;
        }

        const roleData = (await roleRes.json()) as Array<{ can_manage_roles?: boolean }>;
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
      const res = await fetch(`${supabaseUrl}/rest/v1/roles?select=*&order=hierarchy_level.asc`, {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${jwt}`,
        },
      });

      if (!res.ok) {
        throw new Error("Erro ao carregar roles");
      }

      const data = (await res.json()) as Role[];
      setRoles(data);

      // Expandir o primeiro role por defeito
      if (data.length > 0) {
        setExpandedRoles({ [data[0].id]: true });
      }
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

  // Toggle permission via Edge Function
  const togglePermission = async (roleId: string, permissionKey: string, currentValue: boolean) => {
    if (!jwt) return;

    setSaving(roleId);
    setSuccessMessage(null);
    setError(null);

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-update-role`, {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          role_id: roleId, 
          permission_key: permissionKey, 
          value: !currentValue 
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error((errorData as { error?: string }).error || "Erro ao actualizar permissão");
      }

      // Actualizar estado local
      setRoles((prev) =>
        prev.map((role) => (role.id === roleId ? { ...role, [permissionKey]: !currentValue } : role))
      );

      setSuccessMessage("Permissão actualizada!");
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao actualizar");
    } finally {
      setSaving(null);
    }
  };

  // Contar permissões activas por grupo
  const countActivePermissions = (role: Role, groupIndex: number) => {
    const group = permissionGroups[groupIndex];
    return group.permissions.filter((p) => role[p.key as keyof Role] as boolean).length;
  };

  // Contar total de permissões activas para um role
  const countTotalActivePermissions = (role: Role) => {
    return permissionGroups.reduce((total, group) => {
      return total + group.permissions.filter((p) => role[p.key as keyof Role] as boolean).length;
    }, 0);
  };

  const totalPermissions = permissionGroups.reduce((total, g) => total + g.permissions.length, 0);

  const toggleRole = (roleId: string) => {
    setExpandedRoles((prev) => ({ ...prev, [roleId]: !prev[roleId] }));
  };

  const toggleGroup = (roleId: string, groupIndex: number) => {
    const key = `${roleId}-${groupIndex}`;
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (!accessChecked || !canManageRoles) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-slate-600 border-t-emerald-500"></div>
          <p className="text-sm text-slate-400">A verificar permissões...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col bg-slate-950">
      <div className="w-full max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shadow-lg">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-white" data-testid="roles-page-title">
                Gestão de Roles e Permissões
              </h1>
              <p className="text-sm text-slate-400 mt-0.5">
                Configure as permissões de cada role do sistema
              </p>
            </div>
          </div>
          <Link
            href="/dashboard"
            className="px-4 py-2 text-sm rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-100 transition"
            data-testid="back-to-dashboard"
          >
            ← Voltar ao painel
          </Link>
        </header>

        {/* Messages */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-3">
            <X className="w-5 h-5 text-red-400" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {successMessage && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3">
            <Check className="w-5 h-5 text-emerald-400" />
            <p className="text-sm text-emerald-400">{successMessage}</p>
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-600 border-t-emerald-500"></div>
              <p className="text-slate-400">A carregar roles...</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {roles.map((role) => {
              const isExpanded = expandedRoles[role.id] ?? false;
              const activeCount = countTotalActivePermissions(role);

              return (
                <section
                  key={role.id}
                  className="bg-slate-900/70 border border-slate-700 rounded-2xl overflow-hidden backdrop-blur-sm"
                  data-testid={`role-section-${role.name}`}
                >
                  {/* Role Header */}
                  <button
                    type="button"
                    onClick={() => toggleRole(role.id)}
                    className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-800/50 transition"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          role.hierarchy_level === 1
                            ? "bg-amber-500/20 text-amber-400"
                            : role.hierarchy_level === 2
                              ? "bg-purple-500/20 text-purple-400"
                              : "bg-slate-700 text-slate-400"
                        }`}
                      >
                        <Shield className="w-5 h-5" />
                      </div>
                      <div className="text-left">
                        <h2 className="text-lg font-medium text-white flex items-center gap-2">
                          {role.display_name}
                          <span className="text-xs font-normal text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                            {role.name}
                          </span>
                        </h2>
                        <p className="text-sm text-slate-400">{role.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-medium text-white">
                          {activeCount}/{totalPermissions}
                        </p>
                        <p className="text-xs text-slate-500">permissões</p>
                      </div>
                      <div className="text-slate-400">
                        {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                      </div>
                      {saving === role.id && (
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-600 border-t-amber-500"></div>
                      )}
                    </div>
                  </button>

                  {/* Permissions Grid */}
                  {isExpanded && (
                    <div className="px-6 pb-6 pt-2">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {permissionGroups.map((group, groupIndex) => {
                          const GroupIcon = group.icon;
                          const colors = colorClasses[group.color];
                          const groupKey = `${role.id}-${groupIndex}`;
                          const isGroupExpanded = expandedGroups[groupKey] ?? true;
                          const activeInGroup = countActivePermissions(role, groupIndex);

                          return (
                            <div
                              key={group.name}
                              className={`rounded-xl border ${colors.border} ${colors.bg} overflow-hidden`}
                            >
                              <button
                                type="button"
                                onClick={() => toggleGroup(role.id, groupIndex)}
                                className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition"
                              >
                                <div className="flex items-center gap-2">
                                  <GroupIcon className={`w-4 h-4 ${colors.icon}`} />
                                  <span className={`text-sm font-medium ${colors.text}`}>{group.name}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-slate-500">
                                    {activeInGroup}/{group.permissions.length}
                                  </span>
                                  {isGroupExpanded ? (
                                    <ChevronDown className="w-4 h-4 text-slate-500" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4 text-slate-500" />
                                  )}
                                </div>
                              </button>

                              {isGroupExpanded && (
                                <div className="px-4 pb-3 space-y-1">
                                  {group.permissions.map(({ key, label, description }) => {
                                    const permKey = key as keyof Role;
                                    const value = role[permKey] as boolean;

                                    return (
                                      <label
                                        key={key}
                                        className="flex items-start gap-3 py-2 px-2 rounded-lg hover:bg-white/5 cursor-pointer group"
                                        title={description}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={value}
                                          onChange={() => togglePermission(role.id, key, value)}
                                          disabled={saving === role.id}
                                          className="mt-0.5 w-4 h-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-900 disabled:opacity-50"
                                        />
                                        <div className="flex-1 min-w-0">
                                          <span
                                            className={`text-sm block ${value ? "text-slate-200" : "text-slate-500"} group-hover:text-slate-200`}
                                          >
                                            {label}
                                          </span>
                                          <span className="text-xs text-slate-600 block truncate">{description}</span>
                                        </div>
                                        {value && <Check className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />}
                                      </label>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Hierarchy Info */}
                      <div className="mt-4 pt-4 border-t border-slate-700/50">
                        <p className="text-xs text-slate-500">
                          <span className="font-medium">Nível de hierarquia:</span> {role.hierarchy_level}
                          <span className="mx-2">•</span>
                          Utilizadores com este role só podem gerir utilizadores de nível superior (maior número)
                        </p>
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}

        {/* Help Text */}
        <div className="mt-8 p-4 bg-slate-900/50 border border-slate-800 rounded-xl">
          <h3 className="text-sm font-medium text-slate-300 mb-2">💡 Dicas</h3>
          <ul className="text-xs text-slate-500 space-y-1">
            <li>• Clique no nome do role para expandir/colapsar as permissões</li>
            <li>• As alterações são guardadas automaticamente ao clicar nas checkboxes</li>
            <li>• Roles com nível de hierarquia menor (ex: 1) têm mais privilégios que roles com nível maior (ex: 3)</li>
            <li>• O role &quot;siteadmin&quot; deve sempre ter a permissão &quot;Gerir Roles&quot; activa</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
