"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ToastContainer, useToast } from "@/components/ui/toast";
import { RolePermissions, getAllRoles } from "@/lib/permissions-service";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function fetchWithTimeout(url: string, options: RequestInit, timeout = 30000): Promise<Response> {
  return Promise.race([
    fetch(url, options),
    new Promise<Response>((_, reject) =>
      setTimeout(() => reject(new Error(`Request timeout after ${timeout}ms`)), timeout)
    ),
  ]);
}

// Interface para utilizadores da tabela mesh_users (retornado por admin-list-mesh-users)
interface AdminUser {
  id: string;
  mesh_username?: string | null;
  display_name?: string | null;
  domain?: string | null;
  user_type?: string | null;
  auth_user_id?: string | null;
  email?: string | null;
  created_at?: string | null;
}

interface MeshUserOption {
  id: string;
  mesh_username: string | null;
  display_name: string | null;
  domain: string | null;
}

interface CreateUserForm {
  email: string;
  password: string;
  display_name: string;
  mesh_username: string;
  mesh_user_id: string;
  email_confirm: boolean;
  is_agent: boolean;
}

interface EditUserForm {
  id: string;
  email: string;
  password: string;
  display_name: string;
  mesh_username: string;
  mesh_user_id: string;
  email_confirm: boolean;
  ban: boolean;
  is_agent: boolean;
}

export default function UsersManagementPage() {
  const router = useRouter();
  const { toasts, removeToast, showSuccess, showError } = useToast();
  const [jwt, setJwt] = useState<string | null>(null);
  const [currentUserType, setCurrentUserType] = useState<string | null>(null);
  const [currentHierarchyLevel, setCurrentHierarchyLevel] = useState<number>(999);
  const [allRoles, setAllRoles] = useState<RolePermissions[]>([]);
  const [accessChecked, setAccessChecked] = useState(false);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [meshUsers, setMeshUsers] = useState<MeshUserOption[]>([]);
  const [meshUsersLoading, setMeshUsersLoading] = useState(false);
  const [meshUsersError, setMeshUsersError] = useState<string | null>(null);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserForm>({
    email: "",
    password: "",
    display_name: "",
    mesh_username: "",
    mesh_user_id: "",
    email_confirm: false,
    is_agent: false,
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditUserForm>({
    id: "",
    email: "",
    password: "",
    display_name: "",
    mesh_username: "",
    mesh_user_id: "",
    email_confirm: false,
    ban: false,
    is_agent: false,
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Verificar acesso baseado no user_type
  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = window.localStorage.getItem("rustdesk_jwt");
    if (!stored || stored.trim().length === 0) {
      router.replace("/");
      return;
    }

    setJwt(stored);

    // Verificar acesso baseado na permissão can_view_users da tabela roles
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

        // Buscar user_type da tabela mesh_users
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
        setCurrentUserType(userType);
        window.localStorage.setItem("mesh_user_type", userType);

        // Buscar role para verificar can_view_users e obter hierarchy_level
        const roleRes = await fetch(
          `${supabaseUrl}/rest/v1/roles?select=*&name=eq.${userType}`,
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

        const roleData = await roleRes.json() as RolePermissions[];
        if (!roleData.length) {
          router.replace("/dashboard");
          return;
        }

        const role = roleData[0];
        
        // Verificar permissão can_view_users da tabela roles
        if (!role.can_view_users) {
          router.replace("/dashboard");
          return;
        }

        setCurrentHierarchyLevel(role.hierarchy_level);

        // Carregar todas as roles para filtragem por hierarquia
        const roles = await getAllRoles(stored);
        setAllRoles(roles);

        setAccessChecked(true);
      } catch (err) {
        console.error("Erro ao verificar acesso:", err);
        router.replace("/dashboard");
      }
    };

    void checkAccess();
  }, [router]);

  const loadMeshUsers = useCallback(async () => {
    const currentJwt = window.localStorage.getItem("rustdesk_jwt");
    if (!currentJwt) return;
    
    setMeshUsersLoading(true);
    setMeshUsersError(null);

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-list-mesh-users`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${currentJwt}`,
          apikey: anonKey,
        },
      });

      if (!res.ok) {
        let message = "Erro ao carregar lista de utilizadores Mesh.";
        try {
          const body = (await res.json()) as { message?: string; error?: string };
          message = body.message || body.error || message;
        } catch {
          // manter mensagem genérica
        }
        throw new Error(message);
      }

      const data = (await res.json()) as unknown;
      const normalized: MeshUserOption[] = Array.isArray(data)
        ? (data as Array<{ id: string; mesh_username?: string | null; display_name?: string | null; domain_key?: string | null }>).map((item) => ({
            id: item.id,
            mesh_username: item.mesh_username ?? null,
            display_name: item.display_name ?? null,
            domain: item.domain_key ?? null,
          }))
        : [];

      setMeshUsers(normalized);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Erro inesperado ao carregar utilizadores Mesh.";
      setMeshUsersError(message);
    } finally {
      setMeshUsersLoading(false);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    const currentJwt = window.localStorage.getItem("rustdesk_jwt");
    if (!currentJwt) return;
    
    setLoading(true);
    setErrorMsg(null);

    try {
      // Usar admin-list-mesh-users que suporta siteadmin, minisiteadmin e agent
      const res = await fetchWithTimeout(
        `${supabaseUrl}/functions/v1/admin-list-mesh-users`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${currentJwt}`,
            apikey: anonKey,
          },
        },
        30000,
      );

      if (!res.ok) {
        let message = "Falha ao carregar utilizadores.";
        try {
          const body = (await res.json()) as { message?: string; error?: string };
          message = body.message || body.error || message;
          console.error("[Users Page] Error response:", body);
        } catch {
          message = `HTTP ${res.status}: ${res.statusText}`;
        }

        if (res.status === 401) {
          message =
            "Sessão inválida ou expirada. Inicia sessão de novo para aceder à gestão de utilizadores.";
          try {
            if (typeof window !== "undefined") {
              window.localStorage.removeItem("rustdesk_jwt");
            }
          } catch {
            // Ignorar falhas ao limpar localStorage
          }
          try {
            router.replace("/");
          } catch {
            // Se o router ainda não estiver disponível, apenas mostramos a mensagem
          }
        }

        setErrorMsg(message);
        setUsers([]);
        return;
      }

      // admin-list-mesh-users retorna { users: [...] }
      const data = await res.json() as { users?: AdminUser[] };
      const allUsersFromApi = Array.isArray(data.users) ? data.users : [];
      
      // Filtrar utilizadores baseado na hierarquia da tabela roles
      // Só mostrar utilizadores com hierarchy_level MAIOR (menor privilégio) que o nosso
      const filteredUsers = allUsersFromApi.filter(u => {
        // Encontrar o role do utilizador na lista de roles carregada
        const userRole = allRoles.find(r => r.name === u.user_type);
        if (!userRole) return true; // Se não tem role definido, mostrar
        // Mostrar apenas utilizadores com hierarchy_level maior (menor privilégio)
        return userRole.hierarchy_level > currentHierarchyLevel;
      });
      
      setUsers(filteredUsers);
    } catch (err: unknown) {
      console.error("[Users Page] Fetch error:", err);

      let message = "Erro inesperado ao carregar utilizadores.";
      if (err instanceof Error) {
        if (err.message.includes("timeout")) {
          message =
            "Timeout ao carregar utilizadores. O servidor demorou muito tempo a responder. Tente novamente.";
        } else if (err.message.includes("Failed to fetch")) {
          message =
            "Erro de rede ao carregar utilizadores. Verifique a sua ligação à internet.";
        } else {
          message = `Erro: ${err.message}`;
        }
      }

      setErrorMsg(message);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [router, allRoles, currentHierarchyLevel]);

  // Ref para evitar chamadas duplicadas
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    if (!jwt || !accessChecked || allRoles.length === 0) return;
    
    // Evitar chamadas repetidas
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    
    void fetchUsers();
    void loadMeshUsers();
  }, [jwt, accessChecked, fetchUsers, loadMeshUsers]);

  const openCreateModal = () => {
    setCreateForm({
      email: "",
      password: "",
      display_name: "",
      mesh_username: "",
      mesh_user_id: "",
      email_confirm: false,
      is_agent: false,
    });
    setCreateError(null);
    // Só carrega se ainda não tiver dados
    if (meshUsers.length === 0 && !meshUsersLoading) {
      void loadMeshUsers();
    }
    setCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    setCreateModalOpen(false);
    setCreateError(null);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jwt) return;

    if (
      !createForm.email.trim() ||
      !createForm.password.trim() ||
      !createForm.mesh_user_id.trim()
    ) {
      setCreateError("Email, password e mesh_username são obrigatórios.");
      return;
    }

    setCreateLoading(true);
    setCreateError(null);

    try {
      const selected = meshUsers.find(
        (u) => u.id === createForm.mesh_user_id,
      );
      const meshUsernameFromOption =
        selected?.mesh_username ?? createForm.mesh_username.trim();

      const payload = {
        email: createForm.email.trim(),
        password: createForm.password.trim(),
        display_name: createForm.display_name.trim(),
        mesh_username: meshUsernameFromOption,
        mesh_user_id: createForm.mesh_user_id.trim(),
        email_confirm: createForm.email_confirm,
        user_type: createForm.is_agent ? "agent" : "colaborador", // ✅ NORMALIZADO: lowercase
      };

      const res = await fetch(
        `${supabaseUrl}/functions/v1/admin-create-auth-user`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${jwt}`,
            apikey: anonKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        let message = "Erro ao criar utilizador.";
        try {
          const body = (await res.json()) as {
            message?: string;
            error?: string;
          };
          message = body.message || body.error || message;
        } catch {
          // Manter mensagem genérica se o corpo não for JSON válido
        }
        throw new Error(message);
      }

      await fetchUsers();
      closeCreateModal();
      showSuccess(`Utilizador ${createForm.email} criado com sucesso!`);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Erro inesperado ao criar utilizador.";
      setCreateError(message);
    } finally {
      setCreateLoading(false);
    }
  };

  const openEditModal = async (user: AdminUser) => {
    // Verificar se é agent pelo user_type
    const isAgent = user.user_type === "agent";

    setEditForm({
      id: user.id,
      email: user.email ?? user.mesh_username ?? "",
      password: "",
      display_name: user.display_name ?? "",
      mesh_username: user.mesh_username ?? "",
      mesh_user_id: user.id,
      email_confirm: true, // mesh_users já está confirmado
      ban: false,
      is_agent: isAgent,
    });
    setEditError(null);
    if (!meshUsersLoading && meshUsers.length === 0) {
      void loadMeshUsers();
    }
    setEditModalOpen(true);
  };

  const closeEditModal = () => {
    setEditModalOpen(false);
    setEditError(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jwt || !editForm.id) return;

    setEditLoading(true);
    setEditError(null);

    const payload: Record<string, unknown> = {
      id: editForm.id,
      email_confirm: editForm.email_confirm,
      ban: editForm.ban,
      display_name: editForm.display_name.trim(),
      user_type: editForm.is_agent ? "agent" : "colaborador", // ✅ NORMALIZADO: lowercase
    };

    if (editForm.mesh_user_id.trim()) {
      const selected = meshUsers.find(
        (u) => u.id === editForm.mesh_user_id,
      );
      const meshUsernameFromOption =
        selected?.mesh_username ?? editForm.mesh_username.trim();
      payload.mesh_user_id = editForm.mesh_user_id.trim();
      payload.mesh_username = meshUsernameFromOption;
    }

    if (editForm.email.trim()) {
      payload.email = editForm.email.trim();
    }
    if (editForm.password.trim()) {
      payload.password = editForm.password.trim();
    }

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-update-auth-user`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          apikey: anonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let message = "Erro ao atualizar utilizador.";
        try {
          const body = (await res.json()) as {
            message?: string;
            error?: string;
          };
          message = body.message || body.error || message;
        } catch {
          // Manter mensagem genérica se o corpo não for JSON válido
        }
        throw new Error(message);
      }

      await fetchUsers();
      closeEditModal();
      showSuccess(`Utilizador atualizado com sucesso!`);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Erro inesperado ao atualizar utilizador.";
      setEditError(message);
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteUser = async (user: AdminUser) => {
    if (!jwt) return;
    const confirmed = window.confirm(
      `Tem a certeza que pretende apagar o utilizador ${user.email ?? user.id}?`,
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-delete-auth-user`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          apikey: anonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: user.id }),
      });

      if (!res.ok) {
        let message = "Erro ao apagar utilizador.";
        try {
          const body = (await res.json()) as { message?: string; error?: string };
          message = body.message || body.error || message;
        } catch {
          // manter mensagem genérica
        }
        throw new Error(message);
      }

      await fetchUsers();
      showSuccess(`Utilizador ${user.email ?? user.id} apagado com sucesso!`);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Erro inesperado ao apagar utilizador.";
      setErrorMsg(message);
      showError(message);
    }
  };

  const formatDate = (iso?: string | null) => {
    if (!iso) return "-";
    try {
      return new Date(iso).toLocaleString("pt-PT");
    } catch {
      return iso;
    }
  };

  // Verificar se o utilizador tem permissão para aceder
  const hasAccess = accessChecked && currentUserType && ALLOWED_USER_TYPES.includes(currentUserType);

  if (!jwt || !hasAccess) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950">
        <p className="text-sm text-slate-400">
          A verificar permissões de acesso...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col bg-slate-950">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <div className="w-full max-w-5xl mx-auto px-4 py-8">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-white">
              Gestão de Utilizadores
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Administração de contas em Authentication → Users (Supabase).
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="px-3 py-1.5 text-sm rounded-md bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-100"
            >
              ← Voltar ao painel
            </Link>
          </div>
        </header>

        <section className="bg-slate-900/70 border border-slate-700 rounded-2xl p-6 backdrop-blur-sm mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-medium text-white">
                Utilizadores Supabase Auth
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Cada utilizador aqui corresponde a um registo em{" "}
                <span className="font-mono">auth.users</span> e, quando associado,
                a um mapeamento em <span className="font-mono">mesh_users</span>.
              </p>
            </div>
            <button
              type="button"
              onClick={openCreateModal}
              className="px-3 py-1.5 text-sm rounded-md bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              + Criar Utilizador
            </button>
          </div>

          {errorMsg && (
            <div className="mb-4 p-3 bg-red-950/40 border border-red-900 rounded-md">
              <p className="text-sm text-red-400">{errorMsg}</p>
            </div>
          )}

          {meshUsersError && (
            <div className="mb-4 p-3 bg-amber-950/40 border border-amber-900 rounded-md">
              <p className="text-xs text-amber-300">{meshUsersError}</p>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full text-xs text-left text-slate-200">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400">
                  <th className="px-2 py-1.5 font-medium">Email</th>
                  <th className="px-2 py-1.5 font-medium">Nome</th>
                  <th className="px-2 py-1.5 font-medium">Mesh Username</th>
                  <th className="px-2 py-1.5 font-medium">Domínio</th>
                  <th className="px-2 py-1.5 font-medium">Tipo</th>
                  <th className="px-2 py-1.5 font-medium">Criado em</th>
                  <th className="px-2 py-1.5 font-medium text-right">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-2 py-4 text-center text-slate-400"
                    >
                      A carregar utilizadores…
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-2 py-4 text-center text-slate-500"
                    >
                      Sem utilizadores para mostrar.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => {
                    return (
                      <tr
                        key={user.id}
                        className="border-b border-slate-800 last:border-0"
                      >
                        <td className="px-2 py-2 align-top">
                          {user.email ?? user.mesh_username ?? "—"}
                        </td>
                        <td className="px-2 py-2 align-top">
                          {user.display_name ?? "—"}
                        </td>
                        <td className="px-2 py-2 align-top font-mono text-[11px]">
                          {user.mesh_username ?? "—"}
                        </td>
                        <td className="px-2 py-2 align-top">
                          {user.domain ? `[${user.domain}]` : "—"}
                        </td>
                        <td className="px-2 py-2 align-top">
                          {user.user_type ?? "—"}
                        </td>
                        <td className="px-2 py-2 align-top">
                          {formatDate(user.created_at)}
                        </td>
                        <td className="px-2 py-2 align-top text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEditModal(user)}
                              className="px-2 py-1 rounded-md bg-slate-700 hover:bg-slate-600 text-[11px]"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(user)}
                              className="px-2 py-1 rounded-md bg-red-600 hover:bg-red-500 text-[11px]"
                            >
                              Apagar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {createModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">
                Criar Utilizador
              </h3>
              <button
                onClick={closeCreateModal}
                className="text-slate-400 hover:text-white transition"
                disabled={createLoading}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">
                  Email <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, email: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                  disabled={createLoading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">
                  Password inicial <span className="text-red-400">*</span>
                </label>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, password: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                  disabled={createLoading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">
                  Nome de exibição{" "}
                  <span className="text-slate-500">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={createForm.display_name}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      display_name: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={createLoading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">
                  mesh_username <span className="text-red-400">*</span>
                </label>
                <select
                  value={createForm.mesh_user_id}
                  onChange={(e) => {
                    const value = e.target.value;
                    const selected = meshUsers.find((u) => u.id === value);
                    setCreateForm({
                      ...createForm,
                      mesh_user_id: value,
                      mesh_username: selected?.mesh_username ?? "",
                    });
                  }}
                  className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                  disabled={createLoading || meshUsersLoading}
                >
                  <option value="">
                    {meshUsersLoading
                      ? "A carregar utilizadores…"
                      : meshUsers.length === 0
                      ? "Nenhum utilizador encontrado em mesh_users"
                      : "Selecione um utilizador…"}
                  </option>
                  {!meshUsersLoading &&
                    meshUsers.length > 0 &&
                    (() => {
                      const sorted = [...meshUsers].sort((a, b) => {
                        const da = (a.domain ?? "").localeCompare(
                          b.domain ?? "",
                        );
                        if (da !== 0) return da;
                        return (a.mesh_username ?? "").localeCompare(
                          b.mesh_username ?? "",
                        );
                      });
                      const groups: Record<string, MeshUserOption[]> = {};
                      for (const user of sorted) {
                        const key = user.domain ?? "";
                        if (!groups[key]) groups[key] = [];
                        groups[key].push(user);
                      }
                      return Object.entries(groups).map(([domain, users]) => (
                        <optgroup
                          key={domain || "default"}
                          label={domain ? `[${domain}]` : "[default]"}
                        >
                          {users.map((user) => (
                            <option key={user.id} value={user.id}>
                              {user.display_name
                                ? `${user.display_name} (${user.mesh_username ?? "sem username"})`
                                : user.mesh_username ?? user.id}
                            </option>
                          ))}
                        </optgroup>
                      ));
                    })()}
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  Este valor corresponde a um registo existente em{" "}
                  <span className="font-mono">mesh_users</span> e define o
                  domínio por defeito do utilizador.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="create-is-agent"
                  type="checkbox"
                  checked={createForm.is_agent}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      is_agent: e.target.checked,
                    })
                  }
                  disabled={createLoading}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-800"
                />
                <label
                  htmlFor="create-is-agent"
                  className="text-xs text-slate-300"
                >
                  É Agente (pode criar colaboradores)
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="create-email-confirm"
                  type="checkbox"
                  checked={createForm.email_confirm}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      email_confirm: e.target.checked,
                    })
                  }
                  disabled={createLoading}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-800"
                />
                <label
                  htmlFor="create-email-confirm"
                  className="text-xs text-slate-300"
                >
                  Marcar email como confirmado
                </label>
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
                  {createLoading ? "A criar..." : "Criar"}
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

      {editModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">
                Editar Utilizador
              </h3>
              <button
                onClick={closeEditModal}
                className="text-slate-400 hover:text-white transition"
                disabled={editLoading}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) =>
                    setEditForm({ ...editForm, email: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={editLoading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">
                  Nova password{" "}
                  <span className="text-slate-500">
                    (deixar vazio para não alterar)
                  </span>
                </label>
                <input
                  type="password"
                  value={editForm.password}
                  onChange={(e) =>
                    setEditForm({ ...editForm, password: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={editLoading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">
                  Nome de exibição
                </label>
                <input
                  type="text"
                  value={editForm.display_name}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      display_name: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={editLoading}
                />
              </div>

              <div>
                {(() => {
                  const current = users.find((u) => u.id === editForm.id);
                  if (!current) {
                    return null;
                  }
                  if (!current.mesh_username) {
                    return (
                      <p className="text-xs text-slate-500 mb-1">
                        Mapeamento atual em{" "}
                        <span className="font-mono">mesh_users</span>:
                        <br />
                        <span className="text-slate-300">
                          nenhum (sem associação definida)
                        </span>
                      </p>
                    );
                  }

                  const baseName = current.display_name?.trim() || current.mesh_username || "";
                  const domainRaw = (current.domain ?? "").trim();

                  const formatted =
                    domainRaw.length > 0
                      ? `${baseName} [${domainRaw}]`
                      : baseName;

                  return (
                    <p className="text-xs text-slate-400 mb-1">
                      Mapeamento atual em{" "}
                      <span className="font-mono">mesh_users</span>:
                      <br />
                      <span className="font-mono text-slate-200">
                        {formatted}
                      </span>
                    </p>
                  );
                })()}

                <label className="block text-sm font-medium text-slate-200 mb-1 mt-1">
                  mesh_username
                </label>
                <select
                  value={editForm.mesh_user_id}
                  onChange={(e) => {
                    const value = e.target.value;
                    const selected = meshUsers.find((u) => u.id === value);
                    setEditForm({
                      ...editForm,
                      mesh_user_id: value,
                      mesh_username: selected?.mesh_username ?? "",
                    });
                  }}
                  className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={editLoading || meshUsersLoading}
                >
                  <option value="">
                    {meshUsersLoading
                      ? "A carregar utilizadores…"
                      : meshUsers.length === 0
                      ? "Nenhum utilizador encontrado em mesh_users"
                      : "Selecione um utilizador... (mantém o atual se deixar vazio)"}
                  </option>
                  {!meshUsersLoading &&
                    meshUsers.length > 0 &&
                    (() => {
                      const sorted = [...meshUsers].sort((a, b) => {
                        const da = (a.domain ?? "").localeCompare(
                          b.domain ?? "",
                        );
                        if (da !== 0) return da;
                        return (a.mesh_username ?? "").localeCompare(
                          b.mesh_username ?? "",
                        );
                      });
                      const groups: Record<string, MeshUserOption[]> = {};
                      for (const user of sorted) {
                        const key = user.domain ?? "";
                        if (!groups[key]) groups[key] = [];
                        groups[key].push(user);
                      }
                      return Object.entries(groups).map(([domain, users]) => (
                        <optgroup
                          key={domain || "default"}
                          label={domain ? `[${domain}]` : "[default]"}
                        >
                          {users.map((user) => (
                            <option key={user.id} value={user.id}>
                              {user.display_name
                                ? `${user.display_name} (${user.mesh_username ?? "sem username"})`
                                : user.mesh_username ?? user.id}
                            </option>
                          ))}
                        </optgroup>
                      ));
                    })()}
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  Ao alterar este valor está a mudar o mapeamento deste
                  utilizador para um outro registo em{" "}
                  <span className="font-mono">mesh_users</span>, incluindo o
                  domínio associado.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="edit-is-agent"
                  type="checkbox"
                  checked={editForm.is_agent}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      is_agent: e.target.checked,
                    })
                  }
                  disabled={editLoading}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-800"
                />
                <label
                  htmlFor="edit-is-agent"
                  className="text-xs text-slate-300"
                >
                  É Agente (pode criar colaboradores)
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="edit-email-confirm"
                  type="checkbox"
                  checked={editForm.email_confirm}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      email_confirm: e.target.checked,
                    })
                  }
                  disabled={editLoading}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-800"
                />
                <label
                  htmlFor="edit-email-confirm"
                  className="text-xs text-slate-300"
                >
                  Email confirmado
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="edit-ban"
                  type="checkbox"
                  checked={editForm.ban}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      ban: e.target.checked,
                    })
                  }
                  disabled={editLoading}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-800"
                />
                <label
                  htmlFor="edit-ban"
                  className="text-xs text-slate-300"
                >
                  Bloquear utilizador
                </label>
              </div>

              {editError && (
                <div className="p-3 bg-red-950/40 border border-red-900 rounded-md">
                  <p className="text-sm text-red-400">{editError}</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={editLoading}
                  className="flex-1 px-4 py-2 text-sm font-medium rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition text-white"
                >
                  {editLoading ? "A guardar..." : "Guardar Alterações"}
                </button>
                <button
                  type="button"
                  onClick={closeEditModal}
                  disabled={editLoading}
                  className="flex-1 px-4 py-2 text-sm rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition text-white"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}