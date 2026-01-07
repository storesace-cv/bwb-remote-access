"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Users, UserPlus, UserX, UserCheck, Shield, Filter } from "lucide-react";
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

type UserStatus = "candidate" | "active" | "inactive" | "admin";

interface AdminUser {
  id: string;
  mesh_username?: string | null;
  display_name?: string | null;
  domain?: string | null;
  user_type?: string | null;
  auth_user_id?: string | null;
  email?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
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
  user_type: string;
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
  user_type: string;
}

interface ActivateForm {
  mesh_user_id: string;
  mesh_username: string;
  display_name: string;
  email: string;
  password: string;
  user_type: string;
}

export default function UsersManagementPage() {
  const router = useRouter();
  const { toasts, removeToast, showSuccess, showError } = useToast();
  const [jwt, setJwt] = useState<string | null>(null);
  const [currentUserType, setCurrentUserType] = useState<string | null>(null);
  const [currentHierarchyLevel, setCurrentHierarchyLevel] = useState<number>(999);
  const [allRoles, setAllRoles] = useState<RolePermissions[]>([]);
  const [accessChecked, setAccessChecked] = useState(false);
  const [isSiteadmin, setIsSiteadmin] = useState(false);
  const [currentUserPermissions, setCurrentUserPermissions] = useState<RolePermissions | null>(null);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filtros
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const [availableDomains, setAvailableDomains] = useState<string[]>([]);

  const [meshUsers, setMeshUsers] = useState<MeshUserOption[]>([]);
  const [meshUsersLoading, setMeshUsersLoading] = useState(false);
  const [meshUsersError, setMeshUsersError] = useState<string | null>(null);

  // Modal criar
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserForm>({
    email: "",
    password: "",
    display_name: "",
    mesh_username: "",
    mesh_user_id: "",
    email_confirm: false,
    user_type: "colaborador",
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Modal editar
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
    user_type: "colaborador",
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Modal activar candidato
  const [activateModalOpen, setActivateModalOpen] = useState(false);
  const [activateForm, setActivateForm] = useState<ActivateForm>({
    mesh_user_id: "",
    mesh_username: "",
    display_name: "",
    email: "",
    password: "",
    user_type: "colaborador",
  });
  const [activateLoading, setActivateLoading] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);

  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;

  // Verificar acesso
  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = window.localStorage.getItem("rustdesk_jwt");
    if (!stored || stored.trim().length === 0) {
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

        const userData = await userRes.json() as Array<{ user_type?: string }>;
        if (!userData.length || !userData[0].user_type) {
          router.replace("/dashboard");
          return;
        }

        const userType = userData[0].user_type;
        setCurrentUserType(userType);
        setIsSiteadmin(userType === "siteadmin");
        window.localStorage.setItem("mesh_user_type", userType);

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
        
        if (!role.can_view_users) {
          router.replace("/dashboard");
          return;
        }

        // Guardar permissões do utilizador actual para verificações na UI
        setCurrentUserPermissions(role);
        setCurrentHierarchyLevel(role.hierarchy_level);

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

      const data = (await res.json()) as { users?: AdminUser[] };
      const usersArray = data.users ?? [];
      
      const normalized: MeshUserOption[] = usersArray.map((item) => ({
        id: item.id,
        mesh_username: item.mesh_username ?? null,
        display_name: item.display_name ?? null,
        domain: item.domain ?? null,
      }));

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
        } catch {
          message = `HTTP ${res.status}: ${res.statusText}`;
        }

        if (res.status === 401) {
          message = "Sessão inválida ou expirada.";
          window.localStorage.removeItem("rustdesk_jwt");
          router.replace("/");
        }

        setErrorMsg(message);
        setUsers([]);
        return;
      }

      const data = await res.json() as { users?: AdminUser[] };
      const allUsersFromApi = Array.isArray(data.users) ? data.users : [];
      
      // Extrair domínios únicos
      const domainSet = new Set<string>();
      allUsersFromApi.forEach((u) => {
        const d = (u.domain ?? "").trim();
        if (d.length > 0) domainSet.add(d);
      });
      setAvailableDomains(Array.from(domainSet).sort());

      // Filtrar por hierarquia - só mostrar utilizadores com hierarchy_level MAIOR
      const filteredUsers = allUsersFromApi.filter(u => {
        const userRole = allRoles.find(r => r.name === u.user_type);
        if (!userRole) return true;
        return userRole.hierarchy_level > currentHierarchyLevel;
      });
      
      setUsers(filteredUsers);
    } catch (err: unknown) {
      let message = "Erro inesperado ao carregar utilizadores.";
      if (err instanceof Error) {
        if (err.message.includes("timeout")) {
          message = "Timeout ao carregar utilizadores.";
        } else if (err.message.includes("Failed to fetch")) {
          message = "Erro de rede ao carregar utilizadores.";
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

  const hasFetchedRef = useRef(false);

  useEffect(() => {
    if (!jwt || !accessChecked || allRoles.length === 0) return;
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    
    void fetchUsers();
    void loadMeshUsers();
  }, [jwt, accessChecked, allRoles.length, fetchUsers, loadMeshUsers]);

  // Calcular status do utilizador
  const computeStatus = (user: AdminUser): UserStatus => {
    const type = user.user_type?.toLowerCase();
    if (type === "candidato") return "candidate";
    if (type === "inactivo") return "inactive";
    if (type === "siteadmin" || type === "minisiteadmin" || type === "agent") return "admin";
    if (type === "colaborador") return "active";
    // Se tem auth_user_id, está activo
    if (user.auth_user_id) return "active";
    return "candidate";
  };

  const getStatusBadge = (status: UserStatus, userType?: string | null) => {
    switch (status) {
      case "active":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-600/20 text-emerald-300 flex items-center gap-1 w-fit">
            <UserCheck className="w-3 h-3" />
            Activo
          </span>
        );
      case "inactive":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-red-600/20 text-red-300 flex items-center gap-1 w-fit">
            <UserX className="w-3 h-3" />
            Inactivo
          </span>
        );
      case "candidate":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-600/20 text-amber-300 flex items-center gap-1 w-fit">
            <UserPlus className="w-3 h-3" />
            Candidato
          </span>
        );
      case "admin":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-purple-600/20 text-purple-300 flex items-center gap-1 w-fit">
            <Shield className="w-3 h-3" />
            {userType || "Admin"}
          </span>
        );
    }
  };

  // Filtrar utilizadores
  const getFilteredUsers = () => {
    let filtered = [...users];

    // Filtro por domínio
    if (domainFilter !== "all") {
      filtered = filtered.filter(u => (u.domain ?? "").trim() === domainFilter);
    }

    // Filtro por status
    if (statusFilter !== "all") {
      filtered = filtered.filter(u => {
        const status = computeStatus(u);
        return status === statusFilter;
      });
    }

    return filtered;
  };

  const filteredUsers = getFilteredUsers();

  // Estatísticas
  const stats = {
    candidates: users.filter(u => computeStatus(u) === "candidate").length,
    active: users.filter(u => computeStatus(u) === "active").length,
    inactive: users.filter(u => computeStatus(u) === "inactive").length,
    admin: users.filter(u => computeStatus(u) === "admin").length,
    total: users.length,
  };

  // Paginação
  const totalItems = filteredUsers.length;
  const totalPages = totalItems === 0 ? 1 : Math.ceil(totalItems / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedUsers = filteredUsers.slice(startIndex, endIndex);

  useEffect(() => {
    const newTotalPages = totalItems === 0 ? 1 : Math.ceil(totalItems / pageSize);
    if (currentPage > newTotalPages) {
      setCurrentPage(newTotalPages);
    }
  }, [totalItems, currentPage]);

  // === HANDLERS ===

  const openCreateModal = () => {
    setCreateForm({
      email: "",
      password: "",
      display_name: "",
      mesh_username: "",
      mesh_user_id: "",
      email_confirm: false,
      user_type: "colaborador",
    });
    setCreateError(null);
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

    if (!createForm.email.trim() || !createForm.password.trim() || !createForm.mesh_user_id.trim()) {
      setCreateError("Email, password e mesh_username são obrigatórios.");
      return;
    }

    setCreateLoading(true);
    setCreateError(null);

    try {
      const selected = meshUsers.find(u => u.id === createForm.mesh_user_id);
      const meshUsernameFromOption = selected?.mesh_username ?? createForm.mesh_username.trim();

      const payload = {
        email: createForm.email.trim(),
        password: createForm.password.trim(),
        display_name: createForm.display_name.trim(),
        mesh_username: meshUsernameFromOption,
        mesh_user_id: createForm.mesh_user_id.trim(),
        email_confirm: createForm.email_confirm,
        user_type: createForm.user_type,
      };

      const res = await fetch(`${supabaseUrl}/functions/v1/admin-create-auth-user`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          apikey: anonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let message = "Erro ao criar utilizador.";
        try {
          const body = (await res.json()) as { message?: string; error?: string };
          message = body.message || body.error || message;
        } catch {
          // manter genérico
        }
        throw new Error(message);
      }

      hasFetchedRef.current = false;
      await fetchUsers();
      closeCreateModal();
      showSuccess(`Utilizador ${createForm.email} criado com sucesso!`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro inesperado ao criar utilizador.";
      setCreateError(message);
    } finally {
      setCreateLoading(false);
    }
  };

  const openEditModal = (user: AdminUser) => {
    // IMPORTANTE: O Edge Function admin-update-auth-user espera o auth_user_id, não o mesh_users.id
    // O user.auth_user_id é o ID correto para a atualização no Supabase Auth
    setEditForm({
      id: user.auth_user_id ?? user.id, // Usar auth_user_id se disponível, senão usar id
      email: user.email ?? user.mesh_username ?? "",
      password: "",
      display_name: user.display_name ?? "",
      mesh_username: user.mesh_username ?? "",
      mesh_user_id: user.id, // Este é o mesh_users.id para atualização de dados adicionais
      email_confirm: true,
      ban: false,
      user_type: user.user_type ?? "colaborador",
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
      user_type: editForm.user_type,
    };

    if (editForm.mesh_user_id.trim()) {
      const selected = meshUsers.find(u => u.id === editForm.mesh_user_id);
      payload.mesh_user_id = editForm.mesh_user_id.trim();
      payload.mesh_username = selected?.mesh_username ?? editForm.mesh_username.trim();
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
          const body = (await res.json()) as { message?: string; error?: string };
          message = body.message || body.error || message;
        } catch {
          // manter genérico
        }
        throw new Error(message);
      }

      hasFetchedRef.current = false;
      await fetchUsers();
      closeEditModal();
      showSuccess(`Utilizador atualizado com sucesso!`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro inesperado ao atualizar utilizador.";
      setEditError(message);
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteUser = async (user: AdminUser) => {
    if (!jwt) return;
    const confirmed = window.confirm(`Tem a certeza que pretende apagar o utilizador ${user.email ?? user.display_name ?? user.id}?`);
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
          // manter genérico
        }
        throw new Error(message);
      }

      hasFetchedRef.current = false;
      await fetchUsers();
      showSuccess(`Utilizador apagado com sucesso!`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro inesperado ao apagar utilizador.";
      setErrorMsg(message);
      showError(message);
    }
  };

  // === ACTIVAR CANDIDATO ===
  const openActivateModal = (user: AdminUser) => {
    setActivateForm({
      mesh_user_id: user.id,
      mesh_username: user.mesh_username || "",
      display_name: user.display_name || "",
      email: user.email || "",
      password: "",
      user_type: "colaborador",
    });
    setActivateError(null);
    setActivateModalOpen(true);
  };

  const closeActivateModal = () => {
    setActivateModalOpen(false);
    setActivateError(null);
  };

  const handleActivateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jwt) return;

    if (!activateForm.email.trim() || !activateForm.password.trim()) {
      setActivateError("Email e password são obrigatórios.");
      return;
    }

    if (activateForm.password.length < 6) {
      setActivateError("Password deve ter pelo menos 6 caracteres.");
      return;
    }

    setActivateLoading(true);
    setActivateError(null);

    try {
      const payload = {
        email: activateForm.email.trim(),
        password: activateForm.password.trim(),
        display_name: activateForm.display_name.trim() || null,
        mesh_username: activateForm.mesh_username.trim(),
        mesh_user_id: activateForm.mesh_user_id,
        email_confirm: true,
        user_type: activateForm.user_type,
      };

      const res = await fetch(`${supabaseUrl}/functions/v1/admin-create-auth-user`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          apikey: anonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let message = "Erro ao activar utilizador.";
        try {
          const body = (await res.json()) as { message?: string; error?: string };
          message = body.message || body.error || message;
        } catch {
          // manter genérico
        }
        throw new Error(message);
      }

      hasFetchedRef.current = false;
      await fetchUsers();
      closeActivateModal();
      showSuccess(`Utilizador ${activateForm.display_name || activateForm.mesh_username} activado com sucesso!`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro inesperado ao activar utilizador.";
      setActivateError(message);
    } finally {
      setActivateLoading(false);
    }
  };

  // === DESACTIVAR/REACTIVAR ===
  const handleDeactivate = async (user: AdminUser) => {
    if (!jwt || !user.id) return;

    const confirmed = window.confirm(
      `Desactivar utilizador ${user.display_name || user.mesh_username}?\n\nO utilizador perderá acesso ao sistema.`
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/mesh_users?id=eq.${user.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${jwt}`,
          apikey: anonKey,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ user_type: "inactivo" }),
      });

      if (!res.ok) {
        throw new Error(`Erro ao desactivar utilizador: ${res.status}`);
      }

      hasFetchedRef.current = false;
      await fetchUsers();
      showSuccess(`Utilizador ${user.display_name || user.mesh_username} desactivado.`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro inesperado ao desactivar utilizador.";
      showError(message);
    }
  };

  const handleReactivate = async (user: AdminUser) => {
    if (!jwt || !user.id) return;

    const confirmed = window.confirm(
      `Reactivar utilizador ${user.display_name || user.mesh_username}?\n\nO utilizador voltará a ter acesso ao sistema.`
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/mesh_users?id=eq.${user.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${jwt}`,
          apikey: anonKey,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ user_type: "colaborador" }),
      });

      if (!res.ok) {
        throw new Error(`Erro ao reactivar utilizador: ${res.status}`);
      }

      hasFetchedRef.current = false;
      await fetchUsers();
      showSuccess(`Utilizador ${user.display_name || user.mesh_username} reactivado.`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro inesperado ao reactivar utilizador.";
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

  // Renderizar acções baseado no status
  const renderActions = (user: AdminUser) => {
    const status = computeStatus(user);

    return (
      <div className="inline-flex items-center gap-2">
        {/* Activar candidato - requer can_create_users */}
        {status === "candidate" && currentUserPermissions?.can_create_users && (
          <button
            type="button"
            onClick={() => openActivateModal(user)}
            className="px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-[11px] flex items-center gap-1"
            data-testid={`activate-user-${user.id}`}
          >
            <UserCheck className="w-3 h-3" />
            Activar
          </button>
        )}

        {status === "active" && (
          <>
            {/* Editar - requer can_edit_users */}
            {currentUserPermissions?.can_edit_users && (
              <button
                type="button"
                onClick={() => openEditModal(user)}
                className="px-2 py-1 rounded-md bg-slate-700 hover:bg-slate-600 text-[11px]"
                data-testid={`edit-user-${user.id}`}
              >
                Editar
              </button>
            )}
            {/* Desactivar - requer can_delete_users */}
            {currentUserPermissions?.can_delete_users && (
              <button
                type="button"
                onClick={() => handleDeactivate(user)}
                className="px-2 py-1 rounded-md bg-amber-600 hover:bg-amber-500 text-[11px] flex items-center gap-1"
                data-testid={`deactivate-user-${user.id}`}
              >
                <UserX className="w-3 h-3" />
                Desactivar
              </button>
            )}
          </>
        )}

        {status === "inactive" && (
          <>
            {/* Reactivar - requer can_edit_users */}
            {currentUserPermissions?.can_edit_users && (
              <button
                type="button"
                onClick={() => handleReactivate(user)}
                className="px-2 py-1 rounded-md bg-sky-600 hover:bg-sky-500 text-[11px] flex items-center gap-1"
                data-testid={`reactivate-user-${user.id}`}
              >
                <UserCheck className="w-3 h-3" />
                Reactivar
              </button>
            )}
            {/* Apagar - requer can_delete_users */}
            {currentUserPermissions?.can_delete_users && (
              <button
                type="button"
                onClick={() => handleDeleteUser(user)}
                className="px-2 py-1 rounded-md bg-red-600 hover:bg-red-500 text-[11px]"
                data-testid={`delete-user-${user.id}`}
              >
                Apagar
              </button>
            )}
          </>
        )}

        {status === "admin" && (
          <>
            {/* Editar admin - requer can_edit_users */}
            {currentUserPermissions?.can_edit_users && (
              <button
                type="button"
                onClick={() => openEditModal(user)}
                className="px-2 py-1 rounded-md bg-slate-700 hover:bg-slate-600 text-[11px]"
                data-testid={`edit-user-${user.id}`}
              >
                Editar
              </button>
            )}
            {/* Apagar admin - requer can_delete_users */}
            {currentUserPermissions?.can_delete_users && (
              <button
                type="button"
                onClick={() => handleDeleteUser(user)}
                className="px-2 py-1 rounded-md bg-red-600 hover:bg-red-500 text-[11px]"
                data-testid={`delete-user-${user.id}`}
              >
                Apagar
              </button>
            )}
          </>
        )}
      </div>
    );
  };

  // Tipos disponíveis para o selector
  const availableUserTypes = [
    { value: "colaborador", label: "Colaborador" },
    { value: "agent", label: "Agente" },
    ...(isSiteadmin ? [{ value: "minisiteadmin", label: "Mini Site Admin" }] : []),
  ];

  if (!jwt || !accessChecked) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950">
        <p className="text-sm text-slate-400">A verificar permissões de acesso...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col bg-slate-950">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      
      <div className="w-full max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-white flex items-center gap-2" data-testid="page-title">
              <Users className="w-6 h-6" />
              Gestão de Utilizadores
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              A gerir como: <span className="text-emerald-400">{currentUserType}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Botão Criar Utilizador - só aparece se tiver permissão */}
            {currentUserPermissions?.can_create_users && (
              <button
                type="button"
                onClick={openCreateModal}
                className="px-3 py-1.5 text-sm rounded-md bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1"
                data-testid="create-user-btn"
              >
                <UserPlus className="w-4 h-4" />
                Criar Utilizador
              </button>
            )}
            <Link
              href="/dashboard"
              className="px-3 py-1.5 text-sm rounded-md bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-100"
              data-testid="back-to-dashboard"
            >
              ← Painel
            </Link>
          </div>
        </header>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-amber-600/10 border border-amber-600/30 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-amber-400 uppercase tracking-wide">Candidatos</p>
                <p className="text-2xl font-bold text-amber-300 mt-1">{stats.candidates}</p>
              </div>
              <UserPlus className="w-8 h-8 text-amber-400/50" />
            </div>
          </div>
          <div className="bg-emerald-600/10 border border-emerald-600/30 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-emerald-400 uppercase tracking-wide">Activos</p>
                <p className="text-2xl font-bold text-emerald-300 mt-1">{stats.active}</p>
              </div>
              <UserCheck className="w-8 h-8 text-emerald-400/50" />
            </div>
          </div>
          <div className="bg-red-600/10 border border-red-600/30 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-red-400 uppercase tracking-wide">Inactivos</p>
                <p className="text-2xl font-bold text-red-300 mt-1">{stats.inactive}</p>
              </div>
              <UserX className="w-8 h-8 text-red-400/50" />
            </div>
          </div>
          <div className="bg-purple-600/10 border border-purple-600/30 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-purple-400 uppercase tracking-wide">Admins</p>
                <p className="text-2xl font-bold text-purple-300 mt-1">{stats.admin}</p>
              </div>
              <Shield className="w-8 h-8 text-purple-400/50" />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-400">Filtros:</span>
            </div>
            
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400">Status:</label>
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                className="px-2 py-1 rounded-md bg-slate-800 border border-slate-700 text-xs text-slate-100"
                data-testid="status-filter"
              >
                <option value="all">Todos</option>
                <option value="candidate">Candidatos</option>
                <option value="active">Activos</option>
                <option value="inactive">Inactivos</option>
                <option value="admin">Admins</option>
              </select>
            </div>

            {availableDomains.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400">Domínio:</label>
                <select
                  value={domainFilter}
                  onChange={(e) => { setDomainFilter(e.target.value); setCurrentPage(1); }}
                  className="px-2 py-1 rounded-md bg-slate-800 border border-slate-700 text-xs text-slate-100"
                  data-testid="domain-filter"
                >
                  <option value="all">Todos</option>
                  {availableDomains.map((domain) => (
                    <option key={domain} value={domain}>{domain}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="ml-auto text-xs text-slate-500">
              {filteredUsers.length} de {stats.total} utilizadores
            </div>
          </div>
        </div>

        {/* Error */}
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

        {/* Table */}
        <section className="bg-slate-900/70 border border-slate-700 rounded-2xl p-6 backdrop-blur-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs text-left text-slate-200">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400">
                  <th className="px-2 py-1.5 font-medium">Nome</th>
                  <th className="px-2 py-1.5 font-medium">Email</th>
                  <th className="px-2 py-1.5 font-medium">Mesh Username</th>
                  <th className="px-2 py-1.5 font-medium">Domínio</th>
                  <th className="px-2 py-1.5 font-medium">Status</th>
                  <th className="px-2 py-1.5 font-medium">Tipo</th>
                  <th className="px-2 py-1.5 font-medium">Criado em</th>
                  <th className="px-2 py-1.5 font-medium text-right">Acções</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-2 py-4 text-center text-slate-400">
                      A carregar utilizadores…
                    </td>
                  </tr>
                ) : paginatedUsers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-2 py-4 text-center text-slate-500">
                      Sem utilizadores para mostrar.
                    </td>
                  </tr>
                ) : (
                  paginatedUsers.map((user) => {
                    const status = computeStatus(user);
                    return (
                      <tr key={user.id} className="border-b border-slate-800 last:border-0" data-testid={`user-row-${user.id}`}>
                        <td className="px-2 py-2 align-top">{user.display_name || "—"}</td>
                        <td className="px-2 py-2 align-top">{user.email || "—"}</td>
                        <td className="px-2 py-2 align-top font-mono text-[11px]">{user.mesh_username || "—"}</td>
                        <td className="px-2 py-2 align-top">{user.domain || "—"}</td>
                        <td className="px-2 py-2 align-top">{getStatusBadge(status, user.user_type)}</td>
                        <td className="px-2 py-2 align-top">{user.user_type || "—"}</td>
                        <td className="px-2 py-2 align-top">{formatDate(user.created_at)}</td>
                        <td className="px-2 py-2 align-top text-right">{renderActions(user)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalItems > pageSize && (
            <div className="flex items-center justify-between mt-4 text-xs text-slate-300">
              <div>
                A mostrar <span className="font-mono">{startIndex + 1}–{Math.min(endIndex, totalItems)}</span> de <span className="font-mono">{totalItems}</span> utilizadores
              </div>
              <div className="inline-flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2 py-1 rounded-md border border-slate-700 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Anterior
                </button>
                <span className="text-slate-400">Página {currentPage} de {totalPages}</span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="px-2 py-1 rounded-md border border-slate-700 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Seguinte
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Tip for candidates */}
        {stats.candidates > 0 && (
          <div className="mt-4 p-4 bg-amber-900/20 border border-amber-700 rounded-lg">
            <p className="text-xs text-amber-300">
              💡 <strong>Candidatos:</strong> Estes utilizadores existem no MeshCentral mas ainda não têm acesso ao dashboard. Clique em &quot;Activar&quot; para criar a conta e dar acesso ao sistema.
            </p>
          </div>
        )}
      </div>

      {/* Modal Criar */}
      {createModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Criar Utilizador</h3>
              <button onClick={closeCreateModal} className="text-slate-400 hover:text-white transition" disabled={createLoading}>✕</button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">Email <span className="text-red-400">*</span></label>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                  disabled={createLoading}
                  data-testid="create-email"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">Password <span className="text-red-400">*</span></label>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                  disabled={createLoading}
                  data-testid="create-password"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">Nome de exibição</label>
                <input
                  type="text"
                  value={createForm.display_name}
                  onChange={(e) => setCreateForm({ ...createForm, display_name: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={createLoading}
                  data-testid="create-display-name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">Mesh User <span className="text-red-400">*</span></label>
                <select
                  value={createForm.mesh_user_id}
                  onChange={(e) => {
                    const selected = meshUsers.find((u) => u.id === e.target.value);
                    setCreateForm({
                      ...createForm,
                      mesh_user_id: e.target.value,
                      mesh_username: selected?.mesh_username ?? "",
                    });
                  }}
                  className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                  disabled={createLoading || meshUsersLoading}
                  data-testid="create-mesh-user"
                >
                  <option value="">{meshUsersLoading ? "A carregar..." : "Selecione..."}</option>
                  {meshUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.display_name || u.mesh_username || u.id} {u.domain ? `[${u.domain}]` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">Tipo de utilizador</label>
                <select
                  value={createForm.user_type}
                  onChange={(e) => setCreateForm({ ...createForm, user_type: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={createLoading}
                  data-testid="create-user-type"
                >
                  {availableUserTypes.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="create-email-confirm"
                  type="checkbox"
                  checked={createForm.email_confirm}
                  onChange={(e) => setCreateForm({ ...createForm, email_confirm: e.target.checked })}
                  disabled={createLoading}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-800"
                />
                <label htmlFor="create-email-confirm" className="text-xs text-slate-300">Marcar email como confirmado</label>
              </div>

              {createError && (
                <div className="p-3 bg-red-950/40 border border-red-900 rounded-md">
                  <p className="text-sm text-red-400">{createError}</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={createLoading} className="flex-1 px-4 py-2 text-sm font-medium rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white" data-testid="create-submit">
                  {createLoading ? "A criar..." : "Criar"}
                </button>
                <button type="button" onClick={closeCreateModal} disabled={createLoading} className="flex-1 px-4 py-2 text-sm rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar */}
      {editModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Editar Utilizador</h3>
              <button onClick={closeEditModal} className="text-slate-400 hover:text-white transition" disabled={editLoading}>✕</button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">Email</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={editLoading}
                  data-testid="edit-email"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">Nova password <span className="text-slate-500">(deixar vazio para não alterar)</span></label>
                <input
                  type="password"
                  value={editForm.password}
                  onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={editLoading}
                  data-testid="edit-password"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">Nome de exibição</label>
                <input
                  type="text"
                  value={editForm.display_name}
                  onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={editLoading}
                  data-testid="edit-display-name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">Tipo de utilizador</label>
                <select
                  value={editForm.user_type}
                  onChange={(e) => setEditForm({ ...editForm, user_type: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={editLoading}
                  data-testid="edit-user-type"
                >
                  {availableUserTypes.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="edit-email-confirm"
                  type="checkbox"
                  checked={editForm.email_confirm}
                  onChange={(e) => setEditForm({ ...editForm, email_confirm: e.target.checked })}
                  disabled={editLoading}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-800"
                />
                <label htmlFor="edit-email-confirm" className="text-xs text-slate-300">Email confirmado</label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="edit-ban"
                  type="checkbox"
                  checked={editForm.ban}
                  onChange={(e) => setEditForm({ ...editForm, ban: e.target.checked })}
                  disabled={editLoading}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-800"
                />
                <label htmlFor="edit-ban" className="text-xs text-slate-300">Bloquear utilizador</label>
              </div>

              {editError && (
                <div className="p-3 bg-red-950/40 border border-red-900 rounded-md">
                  <p className="text-sm text-red-400">{editError}</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={editLoading} className="flex-1 px-4 py-2 text-sm font-medium rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white" data-testid="edit-submit">
                  {editLoading ? "A guardar..." : "Guardar"}
                </button>
                <button type="button" onClick={closeEditModal} disabled={editLoading} className="flex-1 px-4 py-2 text-sm rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Activar Candidato */}
      {activateModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Activar Utilizador</h3>
              <button onClick={closeActivateModal} className="text-slate-400 hover:text-white transition" disabled={activateLoading}>✕</button>
            </div>

            <div className="mb-4 p-3 bg-slate-800 border border-slate-700 rounded-md">
              <p className="text-sm text-white font-medium">{activateForm.display_name || activateForm.mesh_username}</p>
              <p className="text-xs text-slate-400 mt-1">Mesh Username: <span className="font-mono">{activateForm.mesh_username}</span></p>
            </div>

            <form onSubmit={handleActivateSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">Email <span className="text-red-400">*</span></label>
                <input
                  type="email"
                  value={activateForm.email}
                  onChange={(e) => setActivateForm({ ...activateForm, email: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                  disabled={activateLoading}
                  placeholder="utilizador@exemplo.com"
                  data-testid="activate-email"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">Password inicial <span className="text-red-400">*</span></label>
                <input
                  type="password"
                  value={activateForm.password}
                  onChange={(e) => setActivateForm({ ...activateForm, password: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                  disabled={activateLoading}
                  placeholder="Mínimo 6 caracteres"
                  data-testid="activate-password"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">Tipo de utilizador</label>
                <select
                  value={activateForm.user_type}
                  onChange={(e) => setActivateForm({ ...activateForm, user_type: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={activateLoading}
                  data-testid="activate-user-type"
                >
                  {availableUserTypes.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {activateError && (
                <div className="p-3 bg-red-950/40 border border-red-900 rounded-md">
                  <p className="text-sm text-red-400">{activateError}</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={activateLoading} className="flex-1 px-4 py-2 text-sm font-medium rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white" data-testid="activate-submit">
                  {activateLoading ? "A activar..." : "Activar Utilizador"}
                </button>
                <button type="button" onClick={closeActivateModal} disabled={activateLoading} className="flex-1 px-4 py-2 text-sm rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white">
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
