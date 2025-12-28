"use client";

/**
 * Admin Users List Client Component
 * 
 * Handles client-side interactions for the users list:
 * - Create user modal
 * - Refresh functionality
 */

import { useState, useCallback } from "react";
import CreateUserForm from "./CreateUserForm";

type ValidDomain = "mesh" | "zonetech" | "zsangola";

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
  domains: UserDomain[];
}

interface UsersListClientProps {
  initialUsers: User[];
  initialTotal: number;
  allowedDomains: ValidDomain[];
  filterDomain: ValidDomain | null;
  isSuperAdmin: boolean;
}

export default function UsersListClient({
  initialUsers,
  initialTotal,
  allowedDomains,
  filterDomain,
  isSuperAdmin,
}: UsersListClientProps) {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [total, setTotal] = useState(initialTotal);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshUsers = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const params = new URLSearchParams();
      if (filterDomain) params.set("domain", filterDomain);
      
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
    // Refresh the list after creating a user
    refreshUsers();
  }, [refreshUsers]);

  return (
    <section className="bg-slate-900/70 border border-slate-700 rounded-2xl backdrop-blur-sm overflow-hidden">
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
                <th className="px-6 py-3 font-medium">Criado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-800/50 transition">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm text-white font-medium">
                        {user.display_name || user.email.split("@")[0]}
                      </span>
                      <span className="text-xs text-slate-400">{user.email}</span>
                      <span className="text-xs text-slate-600 font-mono mt-1">
                        {user.auth0_user_id.substring(0, 20)}...
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {user.domains.length === 0 ? (
                        <span className="text-xs text-slate-500 italic">Sem domínios</span>
                      ) : (
                        user.domains.map((d, idx) => (
                          <span
                            key={idx}
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              d.role === "DOMAIN_ADMIN"
                                ? "bg-emerald-900/50 text-emerald-300"
                                : "bg-blue-900/50 text-blue-300"
                            }`}
                          >
                            {d.domain}: {d.role}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
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
                  <td className="px-6 py-4">
                    <span className="text-xs text-slate-400">
                      {new Date(user.created_at).toLocaleDateString("pt-PT", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
