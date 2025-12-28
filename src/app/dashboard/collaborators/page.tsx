"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Users, UserPlus, UserX, UserCheck, Shield, Eye } from "lucide-react";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const ADMIN_AUTH_USER_ID = "9ebfa3dd-392c-489d-882f-8a1762cb36e8";

type CollaboratorStatus = "candidate" | "active" | "inactive";

interface MeshUser {
  id: string;
  mesh_username: string | null;
  display_name: string | null;
  email: string | null;
  domain: string | null;
  user_type: string | null;
  auth_user_id: string | null;
  created_at: string;
  role?: string | null;
  last_sign_in_at?: string | null;
  banned_until?: string | null;
  permission_count?: number;
  device_count?: number;
}

interface ActivateForm {
  mesh_user_id: string;
  mesh_username: string;
  display_name: string;
  email: string;
  password: string;
}

export default function CollaboratorsPage() {
  const router = useRouter();
  const [jwt, setJwt] = useState<string | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [isAgent, setIsAgent] = useState(false);
  const [isSiteadmin, setIsSiteadmin] = useState(false);
  const [isMinisiteadmin, setIsMinisiteadmin] = useState(false);
  const [agentDomain, setAgentDomain] = useState<string | null>(null);

  const [meshUsers, setMeshUsers] = useState<MeshUser[]>([]);
  const [availableDomains, setAvailableDomains] = useState<string[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<string>("all");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [activateModalOpen, setActivateModalOpen] = useState(false);
  const [activateForm, setActivateForm] = useState<ActivateForm>({
    mesh_user_id: "",
    mesh_username: "",
    display_name: "",
    email: "",
    password: "",
  });
  const [activateLoading, setActivateLoading] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"success" | "error" | "info">("info");

  const showToast = (message: string, type: "success" | "error" | "info" = "info") => {
    setToastMessage(message);
    setToastType(type);
    setTimeout(() => setToastMessage(null), 5000);
  };

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

  const checkUserTypeAndDomain = useCallback(async () => {
    if (!jwt || !authUserId) return;

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

          if (record.user_type === "agent") {
            setIsAgent(true);
            setAgentDomain(record.domain);
          } else if (record.user_type === "minisiteadmin") {
            setIsMinisiteadmin(true);
            setAgentDomain(record.domain);
          } else if (record.user_type === "siteadmin") {
            setIsSiteadmin(true);
          } else if (authUserId === ADMIN_AUTH_USER_ID) {
            setIsSiteadmin(true);
          }
        } else {
          console.log("Nenhum mesh_user encontrado para auth_user_id:", authUserId);
        }
      }
    } catch (error) {
      console.error("Erro ao verificar tipo de utilizador:", error);
    }
  }, [jwt, authUserId]);

  useEffect(() => {
    void checkUserTypeAndDomain();
  }, [checkUserTypeAndDomain]);

  const getDisplayDomain = (domain: string | null): string => {
    const d = (domain ?? "").trim();
    return d.length > 0 ? d : "mesh";
  };

  const fetchMeshUsers = useCallback(async () => {
    if (!jwt || (!isAgent && !isSiteadmin && !isMinisiteadmin)) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      // Use Edge Function that handles permissions correctly with service_role
      const res = await fetch(
        `${supabaseUrl}/functions/v1/admin-list-mesh-users`,
        {
          headers: {
            Authorization: `Bearer ${jwt}`,
            apikey: anonKey,
          },
        }
      );

      console.log("🔥 [CRITICAL] Edge Function Response Status:", res.status);
      console.log("🔥 [CRITICAL] Response OK:", res.ok);

      if (!res.ok) {
        const errorText = await res.text();
        console.error("🔥 [CRITICAL] Error Response Body:", errorText);
        throw new Error(`HTTP ${res.status}: ${errorText}`);
      }

      const responseData = (await res.json()) as { users?: MeshUser[] };
      const meshData = responseData.users ?? [];

      console.log("🔥 [CRITICAL] RAW API Response:", meshData);
      console.log("🔥 [CRITICAL] Total records returned:", meshData.length);

      // Filter to show only relevant user types for collaborators page
      const filtered = meshData.filter((u) => {
        const type = u.user_type;
        // Show: candidato, colaborador, inactivo
        // Hide: agent, siteadmin, minisiteadmin
        return type === "candidato" || type === "colaborador" || type === "inactivo";
      });

      if (isSiteadmin) {
        const domainSet = new Set<string>();
        filtered.forEach((u) => {
          domainSet.add(getDisplayDomain(u.domain));
        });
        const domains = Array.from(domainSet).sort((a, b) => a.localeCompare(b));
        setAvailableDomains(domains);
        if (domains.length === 0) {
          setSelectedDomain("all");
        }
      }

      console.log("🔥 [CRITICAL] After filtering:", filtered.length);
      setMeshUsers(filtered);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Erro inesperado ao carregar utilizadores.";
      console.error("🔥 [CRITICAL] Exception caught:", err);
      setErrorMsg(message);
      setMeshUsers([]);
    } finally {
      setLoading(false);
    }
  }, [jwt, isAgent, isSiteadmin, isMinisiteadmin]);

  useEffect(() => {
    if ((isAgent && agentDomain) || isSiteadmin || (isMinisiteadmin && agentDomain)) {
      void fetchMeshUsers();
    }
  }, [isAgent, agentDomain, isSiteadmin, isMinisiteadmin, fetchMeshUsers]);

  const computeStatus = (user: MeshUser): CollaboratorStatus => {
    if (user.user_type === "colaborador") {
      return "active";
    }

    if (user.user_type === "inactivo") {
      return "inactive";
    }

    return "candidate";
  };

  const openActivateModal = (user: MeshUser) => {
    setActivateForm({
      mesh_user_id: user.id,
      mesh_username: user.mesh_username || "",
      display_name: user.display_name || "",
      email: user.email || "",
      password: "",
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
        user_type: "colaborador",
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
        }
      );

      if (!res.ok) {
        let message = "Erro ao ativar colaborador.";
        try {
          const body = (await res.json()) as { message?: string; error?: string };
          message = body.message || body.error || message;
        } catch (error) {
          void error;
        }
        throw new Error(message);
      }

      await fetchMeshUsers();
      closeActivateModal();
      showToast(
        `Colaborador ${activateForm.mesh_username} ativado com sucesso!`,
        "success"
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Erro inesperado ao ativar colaborador.";
      setActivateError(message);
    } finally {
      setActivateLoading(false);
    }
  };

  const handleDeactivate = async (user: MeshUser) => {
    if (!jwt || !user.auth_user_id) return;

    const confirmed = window.confirm(
      `Desativar colaborador ${user.display_name || user.mesh_username}?\n\nO user_type será alterado para inactivo e o utilizador perderá acesso ao sistema.`
    );
    if (!confirmed) return;

    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/mesh_users?id=eq.${user.id}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${jwt}`,
            apikey: anonKey,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            user_type: "inactivo",
          }),
        }
      );

      if (!res.ok) {
        throw new Error(`Erro ao desativar colaborador: ${res.status}`);
      }

      await fetchMeshUsers();
      showToast(
        `Colaborador ${user.display_name || user.mesh_username} desativado.`,
        "success"
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Erro inesperado ao desativar colaborador.";
      setErrorMsg(message);
      showToast(message, "error");
    }
  };

  const handleReactivate = async (user: MeshUser) => {
    if (!jwt || !user.auth_user_id) return;

    const confirmed = window.confirm(
      `Reativar colaborador ${user.display_name || user.mesh_username}?\n\nO utilizador voltará a ter acesso ao sistema.`
    );
    if (!confirmed) return;

    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/mesh_users?id=eq.${user.id}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${jwt}`,
            apikey: anonKey,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            user_type: "colaborador",
          }),
        }
      );

      if (!res.ok) {
        throw new Error(`Erro ao reativar colaborador: ${res.status}`);
      }

      await fetchMeshUsers();
      showToast(
        `Colaborador ${user.display_name || user.mesh_username} reativado.`,
        "success"
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Erro inesperado ao reativar colaborador.";
      setErrorMsg(message);
      showToast(message, "error");
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

  const getStatusBadge = (status: CollaboratorStatus) => {
    switch (status) {
      case "active":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-600/20 text-emerald-300 flex items-center gap-1">
            <UserCheck className="w-3 h-3" />
            Activo
          </span>
        );
      case "inactive":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-red-600/20 text-red-300 flex items-center gap-1">
            <UserX className="w-3 h-3" />
            Inactivo
          </span>
        );
      case "candidate":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-600/20 text-amber-300 flex items-center gap-1">
            <UserPlus className="w-3 h-3" />
            Candidato
          </span>
        );
    }
  };

  const renderActions = (user: MeshUser, status: CollaboratorStatus) => {
    switch (status) {
      case "candidate":
        return (
          <button
            type="button"
            onClick={() => openActivateModal(user)}
            className="px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-[11px] flex items-center gap-1"
          >
            <UserCheck className="w-3 h-3" />
            Activar
          </button>
        );
      case "active":
        return (
          <div className="inline-flex items-center gap-2">
            <Link
              href={`/dashboard/permissions?user=${user.auth_user_id}`}
              className="px-2 py-1 rounded-md bg-slate-700 hover:bg-slate-600 text-[11px] flex items-center gap-1"
            >
              <Eye className="w-3 h-3" />
              Permissões
            </Link>
            <button
              type="button"
              onClick={() => handleDeactivate(user)}
              className="px-2 py-1 rounded-md bg-amber-600 hover:bg-amber-500 text-[11px] flex items-center gap-1"
            >
              <UserX className="w-3 h-3" />
              Desactivar
            </button>
          </div>
        );
      case "inactive":
        return (
          <button
            type="button"
            onClick={() => handleReactivate(user)}
            className="px-2 py-1 rounded-md bg-sky-600 hover:bg-sky-500 text-[11px] flex items-center gap-1"
          >
            <UserCheck className="w-3 h-3" />
            Reactivar
          </button>
        );
    }
  };

  const visibleMeshUsers =
    isSiteadmin && selectedDomain !== "all"
      ? meshUsers.filter(
          (u) => getDisplayDomain(u.domain) === selectedDomain
        )
      : meshUsers;

  const candidates = visibleMeshUsers.filter(
    (u) => computeStatus(u) === "candidate"
  );
  const active = visibleMeshUsers.filter(
    (u) => computeStatus(u) === "active"
  );
  const inactive = visibleMeshUsers.filter(
    (u) => computeStatus(u) === "inactive"
  );

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;

  const totalItems = visibleMeshUsers.length;
  const totalPages = totalItems === 0 ? 1 : Math.ceil(totalItems / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  const paginatedMeshUsers =
    isSiteadmin || isMinisiteadmin ? visibleMeshUsers.slice(startIndex, endIndex) : visibleMeshUsers;

  useEffect(() => {
    if (!isSiteadmin && !isMinisiteadmin) {
      if (currentPage !== 1) {
        setCurrentPage(1);
      }
      return;
    }

    const newTotalPages = totalItems === 0 ? 1 : Math.ceil(totalItems / pageSize);
    if (currentPage > newTotalPages) {
      setCurrentPage(newTotalPages);
    }
  }, [isSiteadmin, isMinisiteadmin, selectedDomain, totalItems, pageSize, currentPage]);

  if (!jwt || (!isAgent && !isSiteadmin && !isMinisiteadmin)) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950">
        <p className="text-sm text-slate-400">
          A aceder... (apenas disponível para agentes, minisiteadmins ou siteadmin)
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col bg-slate-950">
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 z-50 max-w-md rounded-lg border px-4 py-3 shadow-lg ${
            toastType === "success"
              ? "bg-emerald-600 border-emerald-500"
              : toastType === "error"
              ? "bg-red-600 border-red-500"
              : "bg-blue-600 border-blue-500"
          }`}
        >
          <p className="text-sm text-white">{toastMessage}</p>
        </div>
      )}

      <div className="w-full max-w-6xl mx-auto px-4 py-8">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-white flex items-center gap-2">
              <Users className="w-6 h-6" />
              Gestão de Colaboradores
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              {isSiteadmin ? (
                <>
                  Siteadmin global: pode visualizar colaboradores de todos os
                  domínios. Use o seletor de domínio para filtrar.
                </>
              ) : isMinisiteadmin ? (
                <>
                  Minisiteadmin do domínio{" "}
                  <span className="font-mono text-emerald-400">
                    {agentDomain}
                  </span>: pode visualizar todos os colaboradores do seu domínio.
                </>
              ) : (
                <>
                  Gerir utilizadores do domínio{" "}
                  <span className="font-mono text-emerald-400">
                    {agentDomain}
                  </span>{" "}
                  e controlar acesso ao sistema.
                </>
              )}
            </p>
            {isSiteadmin && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-slate-400">Domínio:</span>
                <select
                  value={selectedDomain}
                  onChange={(e) => setSelectedDomain(e.target.value)}
                  className="px-2 py-1 rounded-md bg-slate-800 border border-slate-700 text-xs text-slate-100"
                >
                  <option value="all">Todos os domínios</option>
                  {availableDomains.map((domain) => (
                    <option key={domain} value={domain}>
                      {domain}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/permissions"
              className="px-3 py-1.5 text-sm rounded-md bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-100 flex items-center gap-1"
            >
              <Shield className="w-4 h-4" />
              Permissões
            </Link>
            <Link
              href="/dashboard/groups"
              className="px-3 py-1.5 text-sm rounded-md bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-100"
            >
              Grupos
            </Link>
            <Link
              href="/dashboard"
              className="px-3 py-1.5 text-sm rounded-md bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-100"
            >
              ← Painel
            </Link>
          </div>
        </header>

        {errorMsg && (
          <div className="mb-4 p-3 bg-red-950/40 border border-red-900 rounded-md">
            <p className="text-sm text-red-400">{errorMsg}</p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-amber-600/10 border border-amber-600/30 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-amber-400 uppercase tracking-wide">
                  Candidatos
                </p>
                <p className="text-2xl font-bold text-amber-300 mt-1">
                  {candidates.length}
                </p>
              </div>
              <UserPlus className="w-8 h-8 text-amber-400/50" />
            </div>
          </div>
          <div className="bg-emerald-600/10 border border-emerald-600/30 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-emerald-400 uppercase tracking-wide">
                  Activos
                </p>
                <p className="text-2xl font-bold text-emerald-300 mt-1">
                  {active.length}
                </p>
              </div>
              <UserCheck className="w-8 h-8 text-emerald-400/50" />
            </div>
          </div>
          <div className="bg-red-600/10 border border-red-600/30 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-red-400 uppercase tracking-wide">
                  Inactivos
                </p>
                <p className="text-2xl font-bold text-red-300 mt-1">
                  {inactive.length}
                </p>
              </div>
              <UserX className="w-8 h-8 text-red-400/50" />
            </div>
          </div>
        </div>

        <section className="bg-slate-900/70 border border-slate-700 rounded-2xl p-6 backdrop-blur-sm">
          <div className="mb-4">
            <h2 className="text-lg font-medium text-white">
              Todos os Utilizadores MeshCentral
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {isSiteadmin ? (
                <>
                  Utilizadores de{" "}
                  {selectedDomain === "all"
                    ? "todos os domínios"
                    : `domínio `}
                  {selectedDomain === "all" ? (
                    ""
                  ) : (
                    <span className="font-mono">
                      {selectedDomain}
                    </span>
                  )}
                  . Ative candidatos para lhes dar acesso ao dashboard.
                </>
              ) : isMinisiteadmin ? (
                <>
                  Utilizadores do domínio{" "}
                  <span className="font-mono">
                    {agentDomain}
                  </span>
                  . Ative candidatos para lhes dar acesso ao dashboard.
                </>
              ) : (
                <>
                  Utilizadores do domínio{" "}
                  <span className="font-mono">
                    {agentDomain}
                  </span>
                  . Ative candidatos para lhes dar acesso ao
                  dashboard.
                </>
              )}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-xs text-left text-slate-200">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400">
                  <th className="px-2 py-1.5 font-medium">
                    Nome
                  </th>
                  <th className="px-2 py-1.5 font-medium">
                    Mesh Username
                  </th>
                  <th className="px-2 py-1.5 font-medium">
                    Email
                  </th>
                  <th className="px-2 py-1.5 font-medium">
                    Domínio
                  </th>
                  <th className="px-2 py-1.5 font-medium">
                    Status
                  </th>
                  <th className="px-2 py-1.5 font-medium">
                    Permissões
                  </th>
                  <th className="px-2 py-1.5 font-medium">
                    Dispositivos
                  </th>
                  <th className="px-2 py-1.5 font-medium">
                    Último login
                  </th>
                  <th className="px-2 py-1.5 font-medium text-right">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-2 py-4 text-center text-slate-400"
                    >
                      A carregar utilizadores…
                    </td>
                  </tr>
                ) : visibleMeshUsers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-2 py-4 text-center text-slate-500"
                    >
                      {isSiteadmin ? (
                        selectedDomain === "all" ? (
                          "Sem utilizadores para mostrar."
                        ) : (
                          <>Sem utilizadores no domínio{" "}
                            {selectedDomain}.</>
                        )
                      ) : (
                        <>Sem utilizadores no domínio{" "}
                          {agentDomain}.</>
                      )}
                    </td>
                  </tr>
                ) : (
                  ((isSiteadmin || isMinisiteadmin) ? paginatedMeshUsers : visibleMeshUsers).map((user) => {
                    const status = computeStatus(user);
                    return (
                      <tr
                        key={user.id}
                        className="border-b border-slate-800 last:border-0"
                      >
                        <td className="px-2 py-2 align-top">
                          {user.display_name || "—"}
                        </td>
                        <td className="px-2 py-2 align-top font-mono text-[11px]">
                          {user.mesh_username ?? "—"}
                        </td>
                        <td className="px-2 py-2 align-top">
                          {user.email ?? "—"}
                        </td>
                        <td className="px-2 py-2 align-top">
                          {getDisplayDomain(user.domain)}
                        </td>
                        <td className="px-2 py-2 align-top">
                          {getStatusBadge(status)}
                        </td>
                        <td className="px-2 py-2 align-top">
                          {status === "active" ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-600/20 text-slate-300">
                              —
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-2 py-2 align-top">
                          {status === "active" ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-600/20 text-slate-300">
                              —
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-2 py-2 align-top">
                          {formatDate(user.last_sign_in_at)}
                        </td>
                        <td className="px-2 py-2 align-top text-right">
                          {renderActions(user, status)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {(isSiteadmin || isMinisiteadmin) && totalItems > pageSize && (
            <div className="flex items-center justify-between mt-4 text-xs text-slate-300">
              <div>
                A mostrar{" "}
                <span className="font-mono">
                  {startIndex + 1}–{Math.min(endIndex, totalItems)}
                </span>{" "}
                de{" "}
                <span className="font-mono">{totalItems}</span>{" "}
                colaboradores
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
                <span className="text-slate-400">
                  Página {currentPage} de {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage >= totalPages}
                  className="px-2 py-1 rounded-md border border-slate-700 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Seguinte
                </button>
              </div>
            </div>
          )}
        </section>

        {candidates.length > 0 && (
          <div className="mt-4 p-4 bg-amber-900/20 border border-amber-700 rounded-lg">
            <p className="text-xs text-amber-300">
              💡 <strong>Candidatos:</strong> Estes utilizadores
              existem no MeshCentral mas ainda não têm acesso ao
              dashboard. Clique em "Ativar" para criar a conta
              Supabase e dar acesso ao sistema.
            </p>
          </div>
        )}
      </div>

      {activateModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">
                Ativar Colaborador
              </h3>
              <button
                onClick={closeActivateModal}
                className="text-slate-400 hover:text-white transition"
                disabled={activateLoading}
              >
                ✕
              </button>
            </div>

            <div className="mb-4 p-3 bg-slate-800 border border-slate-700 rounded-md">
              <p className="text-sm text-white font-medium">
                {activateForm.display_name ||
                  activateForm.mesh_username}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Mesh Username:{" "}
                <span className="font-mono">
                  {activateForm.mesh_username}
                </span>
              </p>
            </div>

            <form
              onSubmit={handleActivateSubmit}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">
                  Email{" "}
                  <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  value={activateForm.email}
                  onChange={(e) =>
                    setActivateForm({
                      ...activateForm,
                      email: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                  disabled={activateLoading}
                  placeholder="colaborador@exemplo.com"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Email para login no dashboard.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">
                  Password inicial{" "}
                  <span className="text-red-400">*</span>
                </label>
                <input
                  type="password"
                  value={activateForm.password}
                  onChange={(e) =>
                    setActivateForm({
                      ...activateForm,
                      password: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                  disabled={activateLoading}
                  placeholder="Mínimo 6 caracteres"
                />
                <p className="text-xs text-slate-500 mt-1">
                  O colaborador poderá alterar a password no
                  primeiro login.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">
                  Nome de exibição{" "}
                  <span className="text-slate-500">
                    (opcional)
                  </span>
                </label>
                <input
                  type="text"
                  value={activateForm.display_name}
                  onChange={(e) =>
                    setActivateForm({
                      ...activateForm,
                      display_name: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={activateLoading}
                  placeholder="João Silva"
                />
              </div>

              {activateError && (
                <div className="p-3 bg-red-950/40 border border-red-900 rounded-md">
                  <p className="text-sm text-red-400">
                    {activateError}
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={activateLoading}
                  className="flex-1 px-4 py-2 text-sm font-medium rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition text-white"
                >
                  {activateLoading
                    ? "A ativar..."
                    : "Ativar Colaborador"}
                </button>
                <button
                  type="button"
                  onClick={closeActivateModal}
                  disabled={activateLoading}
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