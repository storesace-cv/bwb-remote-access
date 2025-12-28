"use client";

/**
 * Admin Users List Client Component - STEP 5
 * 
 * Handles client-side interactions for the users list:
 * - Create user modal
 * - Refresh functionality
 * - Role change
 * - Deactivate/Reactivate
 * - Resync
 */

import { useState, useCallback } from "react";
import CreateUserForm from "./CreateUserForm";

type ValidDomain = "mesh" | "zonetech" | "zsangola";
type ValidRole = "DOMAIN_ADMIN" | "AGENT";

interface UserDomain {
  domain: ValidDomain;
  role: string;
}

interface User {
  id: string;
  auth0_user_id: string;
  email: string;
  display_name: string | null;
  is_superadmin_meshcentral: boolean;
  is_superadmin_rustdesk: boolean;
  created_at: string;
  deleted_at: string | null;
  domains: UserDomain[];
}

interface UsersListClientProps {
  initialUsers: User[];
  initialTotal: number;
  allowedDomains: ValidDomain[];
  filterDomain: ValidDomain | null;
  currentUserEmail: string | null;
}

export default function UsersListClient({
  initialUsers,
  initialTotal,
  allowedDomains,
  filterDomain,
  currentUserEmail,
}: UsersListClientProps) {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [total, setTotal] = useState(initialTotal);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

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
          auth0_user_id: u.auth0UserId,
          email: u.email,
          display_name: u.displayName,
          is_superadmin_meshcentral: u.isSuperAdminMeshCentral,
          is_superadmin_rustdesk: u.isSuperAdminRustDesk,
          created_at: u.createdAt,
          deleted_at: u.deletedAt,
          domains: u.domains,
        })));
        setTotal(data.total);
      }
    } catch (error) {
      console.error("Failed to refresh users:", error);
    } finally {
      setIsRefreshing(false);
    }
  }, [filterDomain]);

  const handleUserCreated = useCallback(() => {
    refreshUsers();
  }, [refreshUsers]);

  const showMessage = (type: "success" | "error", text: string) => {
    setActionMessage({ type, text });
    setTimeout(() => setActionMessage(null), 4000);
  };

  const handleRoleChange = async (userId: string, domain: ValidDomain, newRole: ValidRole) => {
    setActionInProgress(userId);
    try {
      const response = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, role: newRole }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      showMessage("success", `Role alterado para ${newRole}`);
      refreshUsers();
    } catch (error) {
      showMessage("error", error instanceof Error ? error.message : "Erro ao alterar role");
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDeactivate = async (userId: string) => {
    if (!confirm("Tens a certeza que queres desativar este utilizador?")) return;
    setActionInProgress(userId);
    try {
      const response = await fetch(`/api/admin/users/${userId}/deactivate`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      showMessage("success", "Utilizador desativado");
      refreshUsers();
    } catch (error) {
      showMessage("error", error instanceof Error ? error.message : "Erro ao desativar");
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
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      showMessage("success", "Utilizador reativado");
      refreshUsers();
    } catch (error) {
      showMessage("error", error instanceof Error ? error.message : "Erro ao reativar");
    } finally {
      setActionInProgress(null);
    }
  };

  const handleResync = async (userId: string) => {
    setActionInProgress(userId);
    try {
      const response = await fetch(`/api/admin/users/${userId}/resync`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      showMessage("success", "Utilizador sincronizado do Auth0");
      refreshUsers();
    } catch (error) {
      showMessage("error", error instanceof Error ? error.message : "Erro ao sincronizar");
    } finally {
      setActionInProgress(null);
    }
  };

  const isDeactivated = (user: User) => user.deleted_at !== null;
  const isSelf = (user: User) => user.email === currentUserEmail;

  return (
    <section className="bg-slate-900/70 border border-slate-700 rounded-2xl backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-medium text-white">
            Utilizadores ({total})
          </h2>
          <button
            onClick={refreshUsers}
            disabled={isRefreshing}
            className="p-1.5 text-slate-400 hover:text-white transition rounded-md hover:bg-slate-800 disabled:opacity-50"
            title="Atualizar lista"
          >
            <svg
              className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
        <CreateUserForm
          allowedDomains={allowedDomains}
          onSuccess={handleUserCreated}
        />
      </div>

      {/* Action Message */}
      {actionMessage && (
        <div
          className={`px-6 py-3 text-sm ${
            actionMessage.type === "success"
              ? "bg-emerald-900/50 text-emerald-300"
              : "bg-red-900/50 text-red-300"
          }`}
        >
          {actionMessage.text}
        </div>
      )}

      {/* Users List */}
      {users.length === 0 ? (
        <div className="p-8 text-center">
          <svg
            className="w-12 h-12 mx-auto mb-4 text-slate-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          <h3 className="text-lg font-medium text-slate-400 mb-2">
            Nenhum utilizador encontrado
          </h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Os utilizadores aparecem aqui após fazerem login via Auth0 ou serem criados manualmente.
            {filterDomain && ` (filtrado por domínio: ${filterDomain})`}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase tracking-wider">
                <th className="px-6 py-3 font-medium">Utilizador</th>
                <th className="px-6 py-3 font-medium">Domínios & Roles</th>
                <th className="px-6 py-3 font-medium">SuperAdmin</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {users.map((user) => {
                const deactivated = isDeactivated(user);
                const self = isSelf(user);
                const loading = actionInProgress === user.id;

                return (
                  <tr
                    key={user.id}
                    className={`transition ${
                      deactivated
                        ? "bg-red-950/20 opacity-60"
                        : "hover:bg-slate-800/50"
                    }`}
                  >
                    {/* User Info */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm text-white font-medium">
                          {user.display_name || user.email.split("@")[0]}
                          {self && (
                            <span className="ml-2 text-xs text-blue-400">(tu)</span>
                          )}
                        </span>
                        <span className="text-xs text-slate-400">{user.email}</span>
                        <span className="text-xs text-slate-600 font-mono mt-1">
                          {user.auth0_user_id.substring(0, 20)}...
                        </span>
                      </div>
                    </td>

                    {/* Domains & Roles */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        {user.domains.length === 0 ? (
                          <span className="text-xs text-slate-500 italic">Sem domínios</span>
                        ) : (
                          user.domains.map((d, idx) => {
                            const canChangeRole = allowedDomains.includes(d.domain) && !deactivated && !loading;
                            return (
                              <div key={idx} className="flex items-center gap-2">
                                <span className="text-xs text-slate-400 w-20">{d.domain}:</span>
                                {canChangeRole ? (
                                  <select
                                    value={d.role}
                                    onChange={(e) =>
                                      handleRoleChange(user.id, d.domain, e.target.value as ValidRole)
                                    }
                                    disabled={loading}
                                    className="text-xs bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  >
                                    <option value="AGENT">AGENT</option>
                                    <option value="DOMAIN_ADMIN">DOMAIN_ADMIN</option>
                                  </select>
                                ) : (
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                      d.role === "DOMAIN_ADMIN"
                                        ? "bg-emerald-900/50 text-emerald-300"
                                        : "bg-blue-900/50 text-blue-300"
                                    }`}
                                  >
                                    {d.role}
                                  </span>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </td>

                    {/* SuperAdmin */}
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {user.is_superadmin_meshcentral && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-900/50 text-amber-300">
                            MeshCentral
                          </span>
                        )}
                        {user.is_superadmin_rustdesk && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-900/50 text-amber-300">
                            RustDesk
                          </span>
                        )}
                        {!user.is_superadmin_meshcentral && !user.is_superadmin_rustdesk && (
                          <span className="text-xs text-slate-500">—</span>
                        )}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4">
                      {deactivated ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-900/50 text-red-300">
                          Desativado
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-900/50 text-green-300">
                          Ativo
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {/* Resync Button */}
                        <button
                          onClick={() => handleResync(user.id)}
                          disabled={loading}
                          className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded transition disabled:opacity-50"
                          title="Sincronizar do Auth0"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                          </svg>
                        </button>

                        {/* Deactivate/Reactivate Button */}
                        {!self && (
                          deactivated ? (
                            <button
                              onClick={() => handleReactivate(user.id)}
                              disabled={loading}
                              className="p-1.5 text-slate-400 hover:text-green-400 hover:bg-slate-800 rounded transition disabled:opacity-50"
                              title="Reativar utilizador"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                              </svg>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleDeactivate(user.id)}
                              disabled={loading}
                              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded transition disabled:opacity-50"
                              title="Desativar utilizador"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                                />
                              </svg>
                            </button>
                          )
                        )}

                        {/* Loading indicator */}
                        {loading && (
                          <svg
                            className="w-4 h-4 animate-spin text-blue-400"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            />
                          </svg>
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
    </section>
  );
}
