"use client";

/**
 * Admin Users List Client Component
 * 
 * Handles client-side interactions for the users list:
 * - Create user modal
 * - Refresh functionality
 * - User type change (with hierarchy enforcement)
 * - Deactivate/Reactivate
 */

import { useState, useCallback, useEffect } from "react";
import CreateUserForm from "./CreateUserForm";

type ValidDomain = "mesh" | "zonetech" | "zsangola";
type UserType = "siteadmin" | "minisiteadmin" | "agent" | "colaborador" | "inactivo" | "candidato";

interface User {
  id: string;
  mesh_username: string;
  email: string | null;
  display_name: string | null;
  user_type: UserType;
  domain: string;
  disabled: boolean;
  siteadmin: number;
  created_at: string;
  deleted_at: string | null;
}

interface UsersListClientProps {
  initialUsers: User[];
  initialTotal: number;
  allowedDomains: ValidDomain[];
  filterDomain: ValidDomain | null;
  currentUserEmail: string | null;
  currentUserType?: UserType;
}

const USER_TYPE_LABELS: Record<UserType, string> = {
  siteadmin: "Site Admin",
  minisiteadmin: "Mini Admin",
  agent: "Agente",
  colaborador: "Colaborador",
  inactivo: "Inativo",
  candidato: "Candidato",
};

const USER_TYPE_COLORS: Record<UserType, string> = {
  siteadmin: "bg-amber-600/20 text-amber-400",
  minisiteadmin: "bg-purple-600/20 text-purple-400",
  agent: "bg-blue-600/20 text-blue-400",
  colaborador: "bg-emerald-600/20 text-emerald-400",
  inactivo: "bg-slate-600/20 text-slate-400",
  candidato: "bg-orange-600/20 text-orange-400",
};

// User type hierarchy (lower index = higher privilege)
const USER_TYPE_HIERARCHY: UserType[] = [
  "siteadmin",
  "minisiteadmin",
  "agent",
  "colaborador",
  "inactivo",
  "candidato",
];

export default function UsersListClient({
  initialUsers,
  initialTotal,
  allowedDomains,
  filterDomain,
  currentUserEmail,
  currentUserType,
}: UsersListClientProps) {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [total, setTotal] = useState(initialTotal);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [allowedTypes, setAllowedTypes] = useState<UserType[]>([]);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  // Fetch allowed types on mount
  useEffect(() => {
    async function fetchAllowedTypes() {
      try {
        const response = await fetch("/api/admin/users/allowed-types");
        if (response.ok) {
          const data = await response.json();
          setAllowedTypes(data.allowedTypes || []);
        }
      } catch (error) {
        console.error("Failed to fetch allowed types:", error);
      }
    }
    fetchAllowedTypes();
  }, []);

  const refreshUsers = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const params = new URLSearchParams();
      if (filterDomain) params.set("domain", filterDomain);
      params.set("includeDeleted", "true");
      
      const response = await fetch(`/api/admin/users?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users.map((u: Record<string, unknown>) => ({
          id: u.id,
          mesh_username: u.meshUsername,
          email: u.email,
          display_name: u.displayName,
          user_type: u.userType,
          domain: u.domain,
          disabled: u.disabled,
          siteadmin: u.siteadmin,
          created_at: u.createdAt,
          deleted_at: u.deletedAt,
        })));
        setTotal(data.total);
      }
    } catch (error) {
      console.error("Failed to refresh users:", error);
    } finally {
      setIsRefreshing(false);
    }
  }, [filterDomain]);

  const showMessage = (type: "success" | "error", text: string) => {
    setActionMessage({ type, text });
    setTimeout(() => setActionMessage(null), 5000);
  };

  const handleDeactivate = async (userId: string) => {
    setActionInProgress(userId);
    try {
      const response = await fetch(`/api/admin/users/${userId}/deactivate`, {
        method: "POST",
      });
      if (response.ok) {
        showMessage("success", "Utilizador desativado");
        await refreshUsers();
      } else {
        const error = await response.json();
        showMessage("error", error.error || "Falha ao desativar");
      }
    } catch {
      showMessage("error", "Erro ao desativar utilizador");
    } finally {
      setActionInProgress(null);
    }
  };

  const handleReactivate = async (userId: string) => {
    setActionInProgress(userId);
    try {
      const response = await fetch(`/api/admin/users/${userId}/reactivate`, {
        method: "POST",
      });
      if (response.ok) {
        showMessage("success", "Utilizador reativado");
        await refreshUsers();
      } else {
        const error = await response.json();
        showMessage("error", error.error || "Falha ao reativar");
      }
    } catch {
      showMessage("error", "Erro ao reativar utilizador");
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRefresh = async (userId: string) => {
    setActionInProgress(userId);
    try {
      const response = await fetch(`/api/admin/users/${userId}/resync`, {
        method: "POST",
      });
      if (response.ok) {
        showMessage("success", "Dados do utilizador atualizados");
        await refreshUsers();
      } else {
        const error = await response.json();
        showMessage("error", error.error || "Falha ao atualizar");
      }
    } catch {
      showMessage("error", "Erro ao atualizar dados");
    } finally {
      setActionInProgress(null);
    }
  };

  const handleChangeType = async (userId: string, newType: UserType) => {
    setActionInProgress(userId);
    try {
      const response = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_type: newType }),
      });
      
      if (response.ok) {
        showMessage("success", `Tipo alterado para ${USER_TYPE_LABELS[newType]}`);
        await refreshUsers();
      } else {
        const error = await response.json();
        showMessage("error", error.error || "Falha ao alterar tipo");
      }
    } catch {
      showMessage("error", "Erro ao alterar tipo de utilizador");
    } finally {
      setActionInProgress(null);
      setEditingUserId(null);
    }
  };

  // Check if current user can modify a target user
  const canModifyUser = (targetUser: User): boolean => {
    if (!currentUserType) return false;
    const currentIndex = USER_TYPE_HIERARCHY.indexOf(currentUserType);
    const targetIndex = USER_TYPE_HIERARCHY.indexOf(targetUser.user_type);
    // Can only modify users with lower privilege (higher index)
    return targetIndex > currentIndex;
  };

  // Get types that can be assigned to a specific user
  const getAssignableTypes = (targetUser: User): UserType[] => {
    if (!canModifyUser(targetUser)) return [];
    return allowedTypes;
  };

  const [showCreateModal, setShowCreateModal] = useState(false);

  return (
    <section className="bg-slate-900/70 border border-slate-700 rounded-2xl p-6 backdrop-blur-sm">
      {/* Action Message */}
      {actionMessage && (
        <div
          className={`mb-4 px-4 py-2 rounded-lg text-sm ${
            actionMessage.type === "success"
              ? "bg-emerald-900/50 text-emerald-400 border border-emerald-700"
              : "bg-red-900/50 text-red-400 border border-red-700"
          }`}
        >
          {actionMessage.text}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-medium text-white">Utilizadores</h2>
          <p className="text-sm text-slate-400">
            {total} utilizador{total !== 1 ? "es" : ""} encontrado{total !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refreshUsers()}
            disabled={isRefreshing}
            className="px-3 py-1.5 text-xs rounded-md bg-slate-700 hover:bg-slate-600 transition text-white disabled:opacity-50"
          >
            {isRefreshing ? "A atualizar..." : "↻ Atualizar"}
          </button>
          {allowedDomains.length > 0 && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-3 py-1.5 text-xs rounded-md bg-emerald-600 hover:bg-emerald-500 transition text-white"
            >
              + Criar Utilizador
            </button>
          )}
        </div>
      </div>

      {/* Users Table */}
      {users.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-slate-400">Nenhum utilizador encontrado.</p>
          <p className="text-xs text-slate-500 mt-1">
            Os utilizadores aparecem aqui após fazerem login ou serem criados.
          </p>
        </div>
      ) : (
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
              {users.map((user) => {
                const isDeleted = !!user.deleted_at;
                const isInactive = user.user_type === "inactivo" || user.disabled;
                const isSelf = user.email === currentUserEmail || user.mesh_username === currentUserEmail;
                const assignableTypes = getAssignableTypes(user);
                const canChangeType = !isSelf && assignableTypes.length > 0;

                return (
                  <tr
                    key={user.id}
                    className={`${isDeleted || isInactive ? "opacity-50" : ""} hover:bg-slate-800/50`}
                  >
                    <td className="py-3 pl-2">
                      <div className="flex flex-col">
                        <span className="text-white font-medium">
                          {user.display_name || user.mesh_username}
                        </span>
                        <span className="text-xs text-slate-500">
                          {user.email || user.mesh_username}
                        </span>
                        <span className="text-xs text-slate-600 font-mono mt-1">
                          ID: {user.id.substring(0, 12)}...
                        </span>
                      </div>
                    </td>
                    <td className="py-3">
                      {editingUserId === user.id ? (
                        <select
                          value={user.user_type}
                          onChange={(e) => handleChangeType(user.id, e.target.value as UserType)}
                          onBlur={() => setEditingUserId(null)}
                          autoFocus
                          className="px-2 py-1 text-xs rounded bg-slate-700 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          disabled={actionInProgress === user.id}
                        >
                          {assignableTypes.map((type) => (
                            <option key={type} value={type}>
                              {USER_TYPE_LABELS[type]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <button
                          onClick={() => canChangeType && setEditingUserId(user.id)}
                          disabled={!canChangeType}
                          className={`px-2 py-1 text-xs rounded ${
                            USER_TYPE_COLORS[user.user_type] || "bg-slate-700 text-slate-300"
                          } ${canChangeType ? "cursor-pointer hover:ring-2 hover:ring-emerald-500/50" : "cursor-default"}`}
                          title={canChangeType ? "Clique para alterar tipo" : isSelf ? "Não pode alterar o próprio tipo" : "Sem permissão para alterar"}
                        >
                          {USER_TYPE_LABELS[user.user_type] || user.user_type}
                          {canChangeType && <span className="ml-1 opacity-50">▼</span>}
                        </button>
                      )}
                    </td>
                    <td className="py-3">
                      <span className="text-xs text-cyan-400 font-mono">
                        {user.domain}
                      </span>
                    </td>
                    <td className="py-3">
                      {isDeleted ? (
                        <span className="text-xs text-red-400">Eliminado</span>
                      ) : isInactive ? (
                        <span className="text-xs text-orange-400">Inativo</span>
                      ) : (
                        <span className="text-xs text-emerald-400">Ativo</span>
                      )}
                    </td>
                    <td className="py-3 pr-2">
                      <div className="flex justify-end gap-1">
                        {!isSelf && (
                          <>
                            <button
                              onClick={() => handleRefresh(user.id)}
                              disabled={actionInProgress === user.id}
                              className="p-1.5 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-300 disabled:opacity-50"
                              title="Atualizar dados"
                            >
                              ↻
                            </button>
                            {isDeleted ? (
                              <button
                                onClick={() => handleReactivate(user.id)}
                                disabled={actionInProgress === user.id}
                                className="p-1.5 text-xs rounded bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-50"
                                title="Reativar"
                              >
                                ✓
                              </button>
                            ) : (
                              <button
                                onClick={() => handleDeactivate(user.id)}
                                disabled={actionInProgress === user.id}
                                className="p-1.5 text-xs rounded bg-red-700 hover:bg-red-600 text-white disabled:opacity-50"
                                title="Desativar"
                              >
                                ✕
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <CreateUserForm
          allowedDomains={allowedDomains}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            refreshUsers();
          }}
        />
      )}
    </section>
  );
}
