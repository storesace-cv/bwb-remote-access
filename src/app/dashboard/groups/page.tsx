"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FolderTree, Plus, ChevronRight, ChevronDown, Shield, X } from "lucide-react";
import { RolePermissions } from "@/lib/permissions-service";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const ADMIN_AUTH_USER_ID = "9ebfa3dd-392c-489d-882f-8a1762cb36e8";

interface Group {
  id: string;
  name: string;
  description: string | null;
  parent_group_id: string | null;
  agent_id: string;
  created_at: string;
  device_count?: number;
  permission_count?: number;
  path?: string;
  level?: number;
  children?: Group[];
}

interface Collaborator {
  id: string;
  email: string | null;
  mesh_username: string | null;
  display_name: string | null;
  user_type: "agent" | "collaborator";
}

interface Permission {
  id: string;
  collaborator_id: string;
  group_id: string;
  granted_by: string;
  granted_at: string;
  revoked_at: string | null;
}

interface CreateGroupForm {
  name: string;
  description: string;
  parent_group_id: string;
}

export default function GroupsPage() {
  const router = useRouter();
  const [jwt, setJwt] = useState<string | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [isAgent, setIsAgent] = useState(false);
  const [isMinisiteadmin, setIsMinisiteadmin] = useState(false);
  const [isSiteadmin, setIsSiteadmin] = useState(false);
  
  // Permissões do utilizador baseadas na tabela roles
  const [userPermissions, setUserPermissions] = useState<RolePermissions | null>(null);

  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateGroupForm>({
    name: "",
    description: "",
    parent_group_id: "",
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Permission management state
  const [permissionsModalOpen, setPermissionsModalOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [permissionsError, setPermissionsError] = useState<string | null>(null);

  // New state for group actions (dropdown + edit/delete modals)
  const [actionsOpenForGroupId, setActionsOpenForGroupId] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<Group | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteGroup, setDeleteGroup] = useState<Group | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = window.localStorage.getItem("rustdesk_jwt");
    if (!stored || stored.trim().length === 0) {
      router.replace("/");
      return;
    }

    setJwt(stored);

    try {
      const parts = stored.split(".");
      if (parts.length >= 2) {
        const payloadJson = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
        const payload = JSON.parse(payloadJson) as { sub?: string };
        if (payload.sub && typeof payload.sub === "string") {
          setAuthUserId(payload.sub);
        }
      }
    } catch (error) {
      console.error("Erro ao decodificar JWT:", error);
      router.replace("/");
    }
  }, [router]);

  const checkUserType = useCallback(async () => {
    if (!jwt || !authUserId) return;

    // Admin canónico é tratado como siteadmin (topo da hierarquia)
    if (authUserId === ADMIN_AUTH_USER_ID) {
      setIsSiteadmin(true);
      setIsMinisiteadmin(true);
      setIsAgent(true);
      return;
    }

    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/mesh_users?select=user_type,domain&auth_user_id=eq.${authUserId}`,
        {
          headers: {
            Authorization: `Bearer ${jwt}`,
            apikey: anonKey,
          },
        }
      );

      if (res.ok) {
        const data = (await res.json()) as Array<{ user_type: string; domain: string }>;
        if (data.length > 0) {
          const record = data[0];

          // reset flags antes de aplicar hierarquia
          setIsAgent(false);
          setIsMinisiteadmin(false);
          setIsSiteadmin(false);

          const role = record.user_type;

          if (role === "siteadmin") {
            setIsSiteadmin(true);
            setIsMinisiteadmin(true);
            setIsAgent(true);
          } else if (role === "minisiteadmin") {
            setIsMinisiteadmin(true);
            setIsAgent(true);
          } else if (role === "agent" || role === "colaborador") {
            // manter comportamento antigo para colaborador
            setIsAgent(true);
          }
        }
      }
    } catch (error) {
      console.error("Erro ao verificar tipo de utilizador:", error);
      setIsAgent(false);
      setIsMinisiteadmin(false);
      setIsSiteadmin(false);
    }
  }, [jwt, authUserId]);

  useEffect(() => {
    void checkUserType();
  }, [checkUserType]);

  const fetchGroups = useCallback(async () => {
    if (!jwt || (!isAgent && !isMinisiteadmin && !isSiteadmin)) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-list-groups`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${jwt}`,
          apikey: anonKey,
        },
      });

      if (!res.ok) {
        let message = "Falha ao carregar grupos.";
        try {
          const body = (await res.json()) as { message?: string; error?: string };
          message = body.message || body.error || message;
        } catch {
          message = `HTTP ${res.status}: ${res.statusText}`;
        }
        setErrorMsg(message);
        setGroups([]);
        return;
      }

      const data = (await res.json()) as { groups?: Group[] };
      const groupsList = Array.isArray(data.groups) ? data.groups : [];
      
      const hierarchical = buildHierarchy(groupsList);
      setGroups(hierarchical);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Erro inesperado ao carregar grupos.";
      setErrorMsg(message);
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [jwt, isAgent, isMinisiteadmin, isSiteadmin]);

  useEffect(() => {
    if (isAgent || isMinisiteadmin || isSiteadmin) {
      void fetchGroups();
    }
  }, [isAgent, isMinisiteadmin, isSiteadmin, fetchGroups]);

  const buildHierarchy = (flatGroups: Group[]): Group[] => {
    const groupMap = new Map<string, Group>();
    const rootGroups: Group[] = [];

    flatGroups.forEach((group) => {
      groupMap.set(group.id, { ...group, children: [] });
    });

    flatGroups.forEach((group) => {
      const node = groupMap.get(group.id)!;
      if (group.parent_group_id) {
        const parent = groupMap.get(group.parent_group_id);
        if (parent) {
          parent.children = parent.children || [];
          parent.children.push(node);
        } else {
          rootGroups.push(node);
        }
      } else {
        rootGroups.push(node);
      }
    });

    return rootGroups;
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  const openCreateModal = (parentGroupId?: string) => {
    setCreateForm({
      name: "",
      description: "",
      parent_group_id: parentGroupId || "",
    });
    setCreateError(null);
    setCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    setCreateModalOpen(false);
    setCreateError(null);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jwt) return;

    if (!createForm.name.trim()) {
      setCreateError("Nome do grupo é obrigatório.");
      return;
    }

    setCreateLoading(true);
    setCreateError(null);

    try {
      const payload = {
        name: createForm.name.trim(),
        description: createForm.description.trim() || null,
        parent_group_id: createForm.parent_group_id.trim() || null,
      };

      const res = await fetch(`${supabaseUrl}/functions/v1/admin-create-group`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          apikey: anonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let message = "Erro ao criar grupo.";
        try {
          const body = (await res.json()) as { message?: string; error?: string };
          message = body.message || body.error || message;
        } catch {
          // manter mensagem genérica
        }
        throw new Error(message);
      }

      await fetchGroups();
      closeCreateModal();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Erro inesperado ao criar grupo.";
      setCreateError(message);
    } finally {
      setCreateLoading(false);
    }
  };

  const openPermissionsModal = async (group: Group) => {
    setSelectedGroup(group);
    setPermissionsModalOpen(true);
    setPermissionsLoading(true);
    setPermissionsError(null);

    try {
      // Fetch collaborators
      const collabRes = await fetch(`${supabaseUrl}/functions/v1/admin-list-collaborators`, {
        headers: { Authorization: `Bearer ${jwt}`, apikey: anonKey },
      });

      if (!collabRes.ok) {
        throw new Error("Erro ao carregar colaboradores");
      }

      const collabData = (await collabRes.json()) as { collaborators?: Collaborator[] };
      setCollaborators(Array.isArray(collabData.collaborators) ? collabData.collaborators : []);

      // Fetch permissions for this group
      const permsRes = await fetch(
        `${supabaseUrl}/rest/v1/mesh_group_permissions?select=*&group_id=eq.${group.id}&revoked_at=is.null`,
        {
          headers: { Authorization: `Bearer ${jwt}`, apikey: anonKey },
        }
      );

      if (!permsRes.ok) {
        throw new Error("Erro ao carregar permissões");
      }

      const permsData = (await permsRes.json()) as Permission[];
      setPermissions(Array.isArray(permsData) ? permsData : []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao carregar dados";
      setPermissionsError(message);
    } finally {
      setPermissionsLoading(false);
    }
  };

  const closePermissionsModal = () => {
    setPermissionsModalOpen(false);
    setSelectedGroup(null);
    setCollaborators([]);
    setPermissions([]);
    setPermissionsError(null);
  };

  const hasPermission = (collaboratorId: string): boolean => {
    return permissions.some(p => p.collaborator_id === collaboratorId && !p.revoked_at);
  };

  const getPermission = (collaboratorId: string): Permission | null => {
    return permissions.find(p => p.collaborator_id === collaboratorId && !p.revoked_at) || null;
  };

  const handleGrantPermission = async (collaboratorId: string) => {
    if (!jwt || !selectedGroup) return;

    setPermissionsLoading(true);
    setPermissionsError(null);

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-grant-permission`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          apikey: anonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          collaborator_id: collaboratorId,
          group_id: selectedGroup.id,
        }),
      });

      if (!res.ok) {
        let message = "Erro ao conceder permissão.";
        try {
          const body = (await res.json()) as { message?: string; error?: string };
          message = body.message || body.error || message;
        } catch {
          // manter mensagem genérica
        }
        throw new Error(message);
      }

      // Refresh permissions
      const permsRes = await fetch(
        `${supabaseUrl}/rest/v1/mesh_group_permissions?select=*&group_id=eq.${selectedGroup.id}&revoked_at=is.null`,
        {
          headers: { Authorization: `Bearer ${jwt}`, apikey: anonKey },
        }
      );

      if (permsRes.ok) {
        const permsData = (await permsRes.json()) as Permission[];
        setPermissions(Array.isArray(permsData) ? permsData : []);
      }

      // Refresh groups to update permission counts
      await fetchGroups();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao conceder permissão";
      setPermissionsError(message);
    } finally {
      setPermissionsLoading(false);
    }
  };

  const handleRevokePermission = async (permissionId: string) => {
    if (!jwt || !selectedGroup) return;

    const confirmed = window.confirm("Tem a certeza que pretende revogar esta permissão?");
    if (!confirmed) return;

    setPermissionsLoading(true);
    setPermissionsError(null);

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-revoke-permission`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          apikey: anonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ permission_id: permissionId }),
      });

      if (!res.ok) {
        let message = "Erro ao revogar permissão.";
        try {
          const body = (await res.json()) as { message?: string; error?: string };
          message = body.message || body.error || message;
        } catch {
          // manter mensagem genérica
        }
        throw new Error(message);
      }

      // Refresh permissions
      const permsRes = await fetch(
        `${supabaseUrl}/rest/v1/mesh_group_permissions?select=*&group_id=eq.${selectedGroup.id}&revoked_at=is.null`,
        {
          headers: { Authorization: `Bearer ${jwt}`, apikey: anonKey },
        }
      );

      if (permsRes.ok) {
        const permsData = (await permsRes.json()) as Permission[];
        setPermissions(Array.isArray(permsData) ? permsData : []);
      }

      // Refresh groups to update permission counts
      await fetchGroups();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao revogar permissão";
      setPermissionsError(message);
    } finally {
      setPermissionsLoading(false);
    }
  };

  const handleSaveEditGroup = async () => {
    if (!jwt || !editGroup) return;

    if (!editName.trim()) {
      setEditError("Nome do grupo é obrigatório.");
      return;
    }

    setEditSaving(true);
    setEditError(null);

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-update-group`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          apikey: anonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          group_id: editGroup.id,
          name: editName.trim(),
          description: editDescription.trim() || null,
        }),
      });

      if (!res.ok) {
        let message = "Erro ao guardar alterações do grupo.";
        try {
          const body = (await res.json()) as { message?: string; error?: string };
          message = body.message || body.error || message;
        } catch {
          message = `HTTP ${res.status}: ${res.statusText}`;
        }
        throw new Error(message);
      }

      await fetchGroups();
      setEditModalOpen(false);
      setEditGroup(null);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Erro inesperado ao guardar alterações.";
      setEditError(message);
    } finally {
      setEditSaving(false);
    }
  };

  const handleConfirmDeleteGroup = async () => {
    if (!jwt || !deleteGroup) return;

    setDeleteLoading(true);
    setDeleteError(null);

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-delete-group`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          apikey: anonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          group_id: deleteGroup.id,
        }),
      });

      if (!res.ok) {
        let message = "Erro ao apagar grupo.";
        try {
          const body = (await res.json()) as { message?: string; error?: string };
          message = body.message || body.error || message;
        } catch {
          message = `HTTP ${res.status}: ${res.statusText}`;
        }
        throw new Error(message);
      }

      await fetchGroups();
      setDeleteConfirmOpen(false);
      setDeleteGroup(null);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Erro inesperado ao apagar grupo.";
      setDeleteError(message);
    } finally {
      setDeleteLoading(false);
    }
  };

  const renderGroupTree = (groupList: Group[], level = 0) => {
    return groupList.map((group) => {
      const isExpanded = expandedGroups[group.id] ?? true;
      const hasChildren = group.children && group.children.length > 0;
      const isRootGroup = (group.level ?? 0) === 0;

      // Helpers for delete rules
      const hasDevices = (group.device_count ?? 0) > 0;
      const hasSubgroups = !!(group.children && group.children.length > 0);
      const canDelete =
        isRootGroup ? !hasDevices && !hasSubgroups : !hasDevices;

      const openEditForGroup = (g: Group) => {
        setEditGroup(g);
        setEditName(g.name);
        setEditDescription(g.description ?? "");
        setEditError(null);
        setEditModalOpen(true);
        setActionsOpenForGroupId(null);
      };

      const openDeleteForGroup = (g: Group) => {
        if (!canDelete) {
          const reason = isRootGroup
            ? hasDevices && hasSubgroups
              ? "Não é possível apagar um grupo com subgrupos e dispositivos associados."
              : hasDevices
              ? "Não é possível apagar um grupo com dispositivos associados."
              : "Não é possível apagar um grupo com subgrupos."
            : "Não é possível apagar um subgrupo com dispositivos associados.";
          setDeleteError(reason);
          setDeleteGroup(null);
          setDeleteConfirmOpen(true);
          setActionsOpenForGroupId(null);
          return;
        }

        setDeleteGroup(g);
        setDeleteError(null);
        setDeleteConfirmOpen(true);
        setActionsOpenForGroupId(null);
      };

      return (
        <div key={group.id} className="mb-2">
          <div
            className="flex items-center gap-2 p-3 bg-slate-800/50 border border-slate-700 rounded-lg hover:bg-slate-800 transition"
            style={{ marginLeft: `${level * 1.5}rem` }}
          >
            <button
              type="button"
              onClick={() => toggleGroup(group.id)}
              className="text-slate-400 hover:text-white"
              disabled={!hasChildren}
            >
              {hasChildren ? (
                isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )
              ) : (
                <div className="w-4 h-4" />
              )}
            </button>

            <FolderTree className="w-4 h-4 text-emerald-400" />

            <div className="flex-1">
              <h3 className="text-sm font-medium text-white">{group.name}</h3>
              {group.description && (
                <p className="text-xs text-slate-400 mt-0.5">{group.description}</p>
              )}
              {group.path && (
                <p className="text-[10px] text-slate-500 mt-0.5 font-mono">{group.path}</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-sky-600/20 text-sky-300">
                {group.device_count ?? 0} dispositivos
              </span>
              {isRootGroup && (
                <button
                  type="button"
                  onClick={() => openCreateModal(group.id)}
                  className="px-2 py-1 rounded-md bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 text-[11px] flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Subgrupo
                </button>
              )}

              {/* Ações dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() =>
                    setActionsOpenForGroupId((current) =>
                      current === group.id ? null : group.id
                    )
                  }
                  className="px-2 py-1 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-100 text-[11px]"
                >
                  Ações
                </button>
                {actionsOpenForGroupId === group.id && (
                  <div className="absolute right-0 mt-1 w-40 rounded-md bg-slate-900 border border-slate-700 shadow-lg z-10">
                    <button
                      type="button"
                      onClick={() => {
                        setActionsOpenForGroupId(null);
                        openPermissionsModal(group);
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-slate-100 hover:bg-slate-800 flex items-center gap-2"
                    >
                      <Shield className="w-3 h-3 text-purple-300" />
                      Permissões
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditForGroup(group)}
                      className="w-full text-left px-3 py-2 text-xs text-slate-100 hover:bg-slate-800"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => openDeleteForGroup(group)}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-800 ${
                        canDelete
                          ? "text-red-300"
                          : "text-slate-500 cursor-not-allowed"
                      }`}
                    >
                      Apagar
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {isExpanded && hasChildren && (
            <div className="mt-2">
              {renderGroupTree(group.children!, level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  if (!jwt || (!isAgent && !isMinisiteadmin && !isSiteadmin)) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950">
        <p className="text-sm text-slate-400">
          A aceder... (apenas disponível para siteadmins, minisiteadmins, agentes e colaboradores)
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col bg-slate-950">
      <div className="w-full max-w-6xl mx-auto px-4 py-8">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-white flex items-center gap-2">
              <FolderTree className="w-6 h-6" />
              Gestão de Grupos e Permissões
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Organize dispositivos em grupos e atribua permissões aos colaboradores diretamente em cada grupo.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/collaborators"
              className="px-3 py-1.5 text-sm rounded-md bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-100"
            >
              Colaboradores
            </Link>
            <Link
              href="/dashboard"
              className="px-3 py-1.5 text-sm rounded-md bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-100"
            >
              ← Painel
            </Link>
          </div>
        </header>

        <section className="bg-slate-900/70 border border-slate-700 rounded-2xl p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-medium text-white">Hierarquia de Grupos</h2>
              <p className="text-xs text-slate-400 mt-1">
                Clique no botão "permissões" em cada grupo para gerir o acesso dos colaboradores.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openCreateModal()}
              className="px-3 py-1.5 text-sm rounded-md bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              Criar Grupo Raiz
            </button>
          </div>

          {errorMsg && (
            <div className="mb-4 p-3 bg-red-950/40 border border-red-900 rounded-md">
              <p className="text-sm text-red-400">{errorMsg}</p>
            </div>
          )}

          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-600 border-t-emerald-500"></div>
              <p className="text-sm text-slate-400 mt-2">A carregar grupos…</p>
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <FolderTree className="w-12 h-12 mx-auto mb-3 text-slate-700" />
              <p className="text-sm">Sem grupos criados.</p>
              <p className="text-xs text-slate-600 mt-1">
                Crie o primeiro grupo para começar a organizar os seus dispositivos.
              </p>
            </div>
          ) : (
            <div className="space-y-2">{renderGroupTree(groups)}</div>
          )}
        </section>

        {groups.length > 0 && (
          <div className="mt-4 p-4 bg-slate-900/50 border border-slate-700 rounded-lg">
            <p className="text-xs text-slate-400">
              💡 <strong>Gestão integrada:</strong> Clique no botão &quot;permissões&quot; em cada grupo para gerir que colaboradores têm acesso. 
              O sistema suporta Grupos e Subgrupos (2 níveis máximo).
            </p>
            <p className="text-xs text-emerald-400 mt-2">
              🌳 <strong>Permissões hierárquicas:</strong> Ao conceder permissão num grupo pai, o colaborador acede automaticamente a TODOS os subgrupos. 
              Se conceder apenas num subgrupo específico, o acesso fica limitado a esse subgrupo.
            </p>
          </div>
        )}
      </div>

      {createModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">
                {createForm.parent_group_id ? "Criar Subgrupo" : "Criar Grupo Raiz"}
              </h3>
              <button
                onClick={closeCreateModal}
                className="text-slate-400 hover:text-white transition"
                disabled={createLoading}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              {createForm.parent_group_id && (
                <div className="p-3 bg-slate-800/50 border border-slate-700 rounded-md">
                  <p className="text-xs text-slate-400">
                    Será criado como subgrupo de:{" "}
                    <span className="text-emerald-400 font-mono">
                      {(() => {
                        const findGroup = (list: Group[]): string | null => {
                          for (const g of list) {
                            if (g.id === createForm.parent_group_id) return g.name;
                            if (g.children) {
                              const found = findGroup(g.children);
                              if (found) return found;
                            }
                          }
                          return null;
                        };
                        return findGroup(groups) || createForm.parent_group_id;
                      })()}
                    </span>
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">
                  Nome do {createForm.parent_group_id ? "Subgrupo" : "Grupo"} <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, name: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                  disabled={createLoading}
                  placeholder={createForm.parent_group_id ? "Ex: Departamento TI, Loja Centro" : "Ex: Escritório Lisboa, Pizza Hut"}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">
                  Descrição <span className="text-slate-500">(opcional)</span>
                </label>
                <textarea
                  value={createForm.description}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, description: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[72px]"
                  disabled={createLoading}
                  placeholder="Breve descrição do grupo e sua finalidade"
                />
              </div>

              {createError && (
                <div className="p-3 bg-red-950/40 border border-red-900 rounded-md">
                  <p className="text-sm text-red-400">{createError}</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={createLoading}
                  className="flex-1 px-4 py-2 text-sm font-medium rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition text-white"
                >
                  {createLoading ? "A criar..." : (createForm.parent_group_id ? "Criar Subgrupo" : "Criar Grupo")}
                </button>
                <button
                  type="button"
                  onClick={closeCreateModal}
                  disabled={createLoading}
                  className="flex-1 px-4 py-2 text-sm rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition text-white"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {permissionsModalOpen && selectedGroup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-2xl w-full shadow-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Shield className="w-5 h-5 text-purple-400" />
                  Permissões: {selectedGroup.name}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  {selectedGroup.path}
                </p>
              </div>
              <button
                onClick={closePermissionsModal}
                className="text-slate-400 hover:text-white transition"
                disabled={permissionsLoading}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {permissionsError && (
              <div className="mb-4 p-3 bg-red-950/40 border border-red-900 rounded-md">
                <p className="text-sm text-red-400">{permissionsError}</p>
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {permissionsLoading ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-600 border-t-purple-500"></div>
                  <p className="text-sm text-slate-400 mt-2">A carregar…</p>
                </div>
              ) : collaborators.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Shield className="w-12 h-12 mx-auto mb-3 text-slate-700" />
                  <p className="text-sm">Sem colaboradores disponíveis.</p>
                  <p className="text-xs text-slate-600 mt-1">
                    Crie colaboradores primeiro para atribuir permissões.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {collaborators.map((collab) => {
                    const hasPerm = hasPermission(collab.id);
                    const perm = getPermission(collab.id);

                    return (
                      <div
                        key={collab.id}
                        className="flex items-center justify-between p-3 bg-slate-800/50 border border-slate-700 rounded-lg"
                      >
                        <div className="flex-1">
                          <p className="text-sm font-medium text-white">
                            {collab.display_name || collab.email}
                          </p>
                          <p className="text-xs text-slate-400 font-mono">
                            {collab.mesh_username}
                          </p>
                        </div>
                        <div>
                          {hasPerm && perm ? (
                            <button
                              type="button"
                              onClick={() => handleRevokePermission(perm.id)}
                              disabled={permissionsLoading}
                              className="px-3 py-1.5 text-xs rounded-md bg-emerald-600/20 hover:bg-red-600/20 border border-emerald-600/40 hover:border-red-600/40 text-emerald-300 hover:text-red-300 disabled:opacity-50 transition"
                            >
                              ✓ Tem Acesso
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleGrantPermission(collab.id)}
                              disabled={permissionsLoading}
                              className="px-3 py-1.5 text-xs rounded-md bg-slate-700 hover:bg-emerald-600/40 border border-slate-600 hover:border-emerald-600/40 text-slate-300 hover:text-emerald-300 disabled:opacity-50 transition"
                            >
                              Conceder Acesso
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-700">
              <button
                onClick={closePermissionsModal}
                disabled={permissionsLoading}
                className="w-full px-4 py-2 text-sm rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition text-white"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit group modal */}
      {editModalOpen && editGroup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">
                Editar {editGroup.level === 0 ? "Grupo" : "Subgrupo"}
              </h3>
              <button
                onClick={() => {
                  if (editSaving) return;
                  setEditModalOpen(false);
                  setEditGroup(null);
                  setEditError(null);
                }}
                className="text-slate-400 hover:text-white transition"
                disabled={editSaving}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">
                  Nome
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Nome do grupo"
                  disabled={editSaving}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">
                  Descrição
                </label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[72px]"
                  placeholder="Descrição do grupo"
                  disabled={editSaving}
                />
              </div>

              {editError && (
                <div className="p-3 bg-red-950/40 border border-red-900 rounded-md">
                  <p className="text-sm text-red-400">{editError}</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleSaveEditGroup}
                  disabled={editSaving}
                  className="flex-1 px-4 py-2 text-sm font-medium rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition text-white"
                >
                  {editSaving ? "A guardar..." : "Guardar"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (editSaving) return;
                    setEditModalOpen(false);
                    setEditGroup(null);
                    setEditError(null);
                  }}
                  disabled={editSaving}
                  className="flex-1 px-4 py-2 text-sm rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition text-white"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">
                Apagar grupo
              </h3>
              <button
                onClick={() => {
                  if (deleteLoading) return;
                  setDeleteConfirmOpen(false);
                  setDeleteGroup(null);
                  setDeleteError(null);
                }}
                className="text-slate-400 hover:text-white transition"
                disabled={deleteLoading}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {deleteError ? (
              <div className="space-y-4">
                <div className="p-3 bg-amber-950/40 border border-amber-900 rounded-md">
                  <p className="text-sm text-amber-300">{deleteError}</p>
                </div>
                <p className="text-xs text-slate-400">
                  Ajuste primeiro a hierarquia (remova subgrupos e/ou mova os
                  dispositivos para outro grupo) e tente novamente.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-slate-200">
                  Tem a certeza que pretende apagar o grupo{" "}
                  <span className="font-semibold">
                    {deleteGroup?.name ?? ""}
                  </span>
                  ? Esta acção irá marcar o grupo como removido na base de dados
                  (soft delete) e deixará de ser possível associar novos dispositivos
                  a este grupo. As regras de negócio (sem dispositivos nem subgrupos)
                  serão validadas novamente no servidor antes da remoção.
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => {
                  if (deleteLoading) return;
                  setDeleteConfirmOpen(false);
                  setDeleteGroup(null);
                  setDeleteError(null);
                }}
                className="flex-1 px-4 py-2 text-sm rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition text-white"
                disabled={deleteLoading}
              >
                Fechar
              </button>
              {!deleteError && (
                <button
                  type="button"
                  onClick={handleConfirmDeleteGroup}
                  className="flex-1 px-4 py-2 text-sm rounded-md bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition text-white"
                  disabled={deleteLoading}
                >
                  {deleteLoading ? "A apagar..." : "Confirmar"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}