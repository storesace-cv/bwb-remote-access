"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

import { GroupableDevice, groupDevices } from "@/lib/grouping";
import { logError } from "@/lib/debugLogger";
import { RolePermissions } from "@/lib/permissions-service";

// Refactored components
import {
  DashboardHeader,
  ManagementPanel,
  DeviceFilters,
  AddDeviceSection,
  UnadoptedDevicesList,
  AdminUnassignedDevicesList,
  AdoptedDevicesList,
  RegistrationModal,
  AdoptModal,
  AdminReassignModal,
  type RustdeskAbi,
  type AdoptFormData,
} from "./components";

const supabaseUrl: string = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey: string = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

const buildRustdeskUrl = (device: GroupableDevice): string => {
  const base = `rustdesk://connection/new/${encodeURIComponent(device.device_id)}`;
  const password = device.rustdesk_password?.trim();
  if (password && password.length > 0) {
    return `${base}?password=${encodeURIComponent(password)}`;
  }
  return base;
};

interface RegistrationSession {
  session_id: string;
  expires_at: string;
  expires_in_seconds: number;
}

type SortOption = "date_desc" | "date_asc" | "name_asc" | "name_desc" | "id_asc" | "id_desc";
type FilterStatus = "all" | "adopted" | "unadopted";

interface MeshUserOption {
  id: string;
  mesh_username: string | null;
  display_name: string | null;
}

interface CanonicalGroup {
  id: string;
  name: string;
  description: string | null;
  parent_group_id: string | null;
  path: string;
  level: number;
  device_count?: number;
}

const ADOPTED_PAGE_SIZE = 20;

export default function DashboardPage() {
  const router = useRouter();
  const [jwt, setJwt] = useState<string | null>(null);
  // User role from roles table
  const [userRole, setUserRole] = useState<{
    name: string;
    displayName: string;
  }>({ name: "", displayName: "" });
  // Permissões carregadas da tabela roles
  const [userPermissions, setUserPermissions] = useState<RolePermissions | null>(null);
  
  const [userTypeChecked, setUserTypeChecked] = useState(false);
  const [initialDevicesLoaded, setInitialDevicesLoaded] = useState(false);
  
  // NEW: User profile data
  const [userDomain, setUserDomain] = useState<string>("");
  const [userDisplayName, setUserDisplayName] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [devices, setDevices] = useState<GroupableDevice[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("date_desc");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedSubgroups, setExpandedSubgroups] = useState<Record<string, boolean>>({});

  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [registrationSession, setRegistrationSession] = useState<RegistrationSession | null>(null);
  const [qrImageUrl, setQrImageUrl] = useState<string>("");
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string>("");
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [registrationStatus, setRegistrationStatus] = useState<"awaiting" | "completed" | "expired">("awaiting");
  const [matchedDevice, setMatchedDevice] = useState<{ device_id: string; friendly_name?: string } | null>(null);
  const [checkingDevice, setCheckingDevice] = useState(false);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [hybridDeviceIdInput, setHybridDeviceIdInput] = useState<string>("");
  const [hybridSubmitLoading, setHybridSubmitLoading] = useState<boolean>(false);
  const [hybridSubmitError, setHybridSubmitError] = useState<string | null>(null);
  const [hybridSubmitSuccess, setHybridSubmitSuccess] = useState<string | null>(null);

  const [showAdoptModal, setShowAdoptModal] = useState(false);
  const [adoptingDevice, setAdoptingDevice] = useState<GroupableDevice | null>(null);
  const [adoptFormData, setAdoptFormData] = useState<AdoptFormData>({
    friendly_name: "",
    group_id: "",
    rustdesk_password: "",
    observations: "",
  });
  const [adoptLoading, setAdoptLoading] = useState(false);
  const [adoptError, setAdoptError] = useState<string | null>(null);

  // NEW: Canonical groups state
  const [canonicalGroups, setCanonicalGroups] = useState<CanonicalGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);

  const [showAdminReassignModal, setShowAdminReassignModal] = useState(false);
  const [adminDeviceToManage, setAdminDeviceToManage] = useState<GroupableDevice | null>(null);
  const [adminReassignForm, setAdminReassignForm] = useState<{ mesh_username: string }>({
    mesh_username: "",
  });
  const [adminActionLoading, setAdminActionLoading] = useState(false);
  const [adminActionError, setAdminActionError] = useState<string | null>(null);
  const [meshUsersLoading, setMeshUsersLoading] = useState(false);
  const [meshUsers, setMeshUsers] = useState<MeshUserOption[]>([]);

  const [selectedRustdeskAbi, setSelectedRustdeskAbi] = useState<RustdeskAbi>(null);
  const [currentAdoptedPage, setCurrentAdoptedPage] = useState<number>(1);
  const [adoptedPageSize, setAdoptedPageSize] = useState<number>(ADOPTED_PAGE_SIZE);

  const RUSTDESK_APK_URLS: Record<"arm64" | "armeabi" | "x86_64", string> = {
    arm64: "https://rustdesk.bwb.pt/apk/rustdesk/latest?abi=arm64-v8a",
    armeabi: "https://rustdesk.bwb.pt/apk/rustdesk/latest?abi=armeabi-v7a",
    x86_64: "https://rustdesk.bwb.pt/apk/rustdesk/latest?abi=x86_64",
  };

  // Ler JWT e authUserId do localStorage ao montar o dashboard
  // NOTA: Não redirecionamos para "/" aqui porque a sessão já foi validada pelo servidor
  // na página raiz. Se não houver JWT, mostramos estado de carregamento e tentamos novamente.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const loadJwt = () => {
      const stored = window.localStorage.getItem("rustdesk_jwt");
      if (!stored || stored.trim().length === 0) {
        // JWT ainda não está disponível - pode estar em processo de ser guardado
        // Não redirecionamos, apenas esperamos
        return false;
      }

      setJwt(stored);

      try {
        const parts = stored.split(".");
        if (parts.length >= 2) {
          const payloadJson = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
          const payload = JSON.parse(payloadJson) as { sub?: string };
          // JWT decodificado com sucesso - o sub contém o auth_user_id
          if (!payload.sub) {
            console.warn("JWT não contém sub (auth_user_id)");
          }
        }
      } catch (error) {
        console.error("Erro ao decodificar JWT em /dashboard:", error);
      }
      return true;
    };

    // Tentar carregar imediatamente
    if (!loadJwt()) {
      // Se não encontrou, tentar novamente após um pequeno delay
      // (o localStorage pode ainda estar sendo escrito pelo login-form)
      const retryTimeout = setTimeout(() => {
        loadJwt();
      }, 100);
      return () => clearTimeout(retryTimeout);
    }
  }, []);

  // Check user type and permissions from roles table
  const checkUserType = useCallback(async () => {
    if (!jwt || userTypeChecked) return;

    try {
      // Decode email from JWT
      let userEmail = "";
      try {
        const parts = jwt.split(".");
        if (parts.length >= 2) {
          const payloadJson = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
          const payload = JSON.parse(payloadJson) as { email?: string; sub?: string };
          userEmail = payload.email || "";
          console.log("[Dashboard] JWT email:", userEmail);
        }
      } catch (e) {
        console.warn("[Dashboard] Could not decode JWT:", e);
      }

      if (!userEmail) {
        console.warn("[Dashboard] No email in JWT");
        setUserTypeChecked(true);
        return;
      }

      // Query mesh_users with role_id
      const userQueryUrl = `${supabaseUrl}/rest/v1/mesh_users?select=domain,display_name,role_id&mesh_username=eq.${encodeURIComponent(userEmail.toLowerCase())}`;
      
      console.log("[Dashboard] Querying user:", userEmail.toLowerCase());

      const userRes = await fetch(userQueryUrl, {
        headers: {
          Authorization: `Bearer ${jwt}`,
          apikey: anonKey,
        },
      });

      if (!userRes.ok) {
        console.error("[Dashboard] User query failed:", userRes.status);
        setUserTypeChecked(true);
        return;
      }

      const userData = (await userRes.json()) as Array<{
        domain: string;
        display_name: string | null;
        role_id: string | null;
      }>;

      console.log("[Dashboard] User data:", userData);

      if (userData.length === 0) {
        console.warn("[Dashboard] No user found");
        setUserTypeChecked(true);
        return;
      }

      const user = userData[0];
      setUserDomain(user.domain || "");
      setUserDisplayName(user.display_name || "");

      // Fetch permissions from roles table
      if (user.role_id) {
        // Trazer todas as colunas da tabela roles
        const roleQueryUrl = `${supabaseUrl}/rest/v1/roles?select=*&id=eq.${user.role_id}`;
        
        console.log("[Dashboard] Fetching role permissions for role_id:", user.role_id);

        const roleRes = await fetch(roleQueryUrl, {
          headers: {
            Authorization: `Bearer ${jwt}`,
            apikey: anonKey,
          },
        });

        if (roleRes.ok) {
          const roleData = await roleRes.json();
          console.log("[Dashboard] Role data:", roleData);

          if (roleData.length > 0) {
            const role = roleData[0];
            
            // Set role name and display name
            setUserRole({
              name: role.name || "",
              displayName: role.display_name || role.name || "",
            });
            
            // Set all permissions from roles table
            setUserPermissions(role as RolePermissions);

            console.log("[Dashboard] Permissions set from role:", role.name);
          }
        } else {
          console.warn("[Dashboard] Failed to fetch role:", roleRes.status);
        }
      } else {
        console.warn("[Dashboard] User has no role_id assigned");
        // Default to null permissions (restricted access)
        setUserRole({ name: "colaborador", displayName: "Colaborador" });
        setUserPermissions(null);
      }

      setUserTypeChecked(true);
    } catch (error) {
      console.error("[Dashboard] Error:", error);
      setUserTypeChecked(true);
    }
  }, [jwt, userTypeChecked]);

  useEffect(() => {
    void checkUserType();
  }, [checkUserType]);

  const fetchDevices = useCallback(async (): Promise<void> => {
    if (!jwt) {
      return;
    }

    if (!supabaseUrl || !anonKey) {
      setLoading(false);
      setErrorMsg("Configuração de ligação à Supabase em falta. Contacte o administrador.");
      setDevices([]);
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/get-devices`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${jwt}`,
          apikey: anonKey,
        },
      });

      if (!res.ok) {
        let message = "Falha ao carregar dispositivos.";
        try {
          const errorBody = (await res.json()) as { message?: string; error?: string };
          if (errorBody.message) {
            message = errorBody.message;
          } else if (errorBody.error) {
            message = errorBody.error;
          }
        } catch {
          // manter mensagem genérica se não conseguir ler o body
        }
        setErrorMsg(message);
        setDevices([]);
        return;
      }

      let body: unknown;
      try {
        body = await res.json();
      } catch {
        setErrorMsg("Resposta inesperada do servidor ao carregar dispositivos.");
        setDevices([]);
        return;
      }

      let devicesList: GroupableDevice[] = [];

      if (Array.isArray(body)) {
        devicesList = body as GroupableDevice[];
      } else if (
        body &&
        typeof body === "object" &&
        Array.isArray((body as { devices?: unknown }).devices)
      ) {
        devicesList = (body as { devices: GroupableDevice[] }).devices;
      }

      setDevices(devicesList);
    } catch (err: unknown) {
      let message = "Erro inesperado ao carregar dispositivos.";
      if (err instanceof TypeError && err.message === "Failed to fetch") {
        message =
          "Falha ao comunicar com o servidor de dispositivos. Verifique a configuração ou contacte o administrador.";
      } else if (err instanceof Error) {
        message = err.message;
      }
      setErrorMsg(message);
      setDevices([]);
    } finally {
      setLoading(false);
    }
  }, [jwt, supabaseUrl, anonKey]);

  // Carregar devices automaticamente assim que tivermos um JWT válido
  useEffect(() => {
    if (!jwt || initialDevicesLoaded) return;
    setInitialDevicesLoaded(true);
    void fetchDevices();
  }, [jwt, fetchDevices, initialDevicesLoaded]);

  // Carregar lista de utilizadores (mesh_users) para utilizadores com acesso
  // via Edge Function admin-list-mesh-users
  const loadMeshUsers = useCallback(async () => {
    if (typeof window === "undefined") return;
    const currentJwt = window.localStorage.getItem("rustdesk_jwt");
    if (!currentJwt) return;

    setMeshUsersLoading(true);
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-list-mesh-users`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${currentJwt}`,
          apikey: anonKey,
        },
      });

      if (!res.ok) {
        let message = "Erro ao carregar lista de utilizadores (mesh_users).";
        try {
          const data = (await res.json()) as { message?: string; error?: string };
          message = data.message || data.error || message;
        } catch {
          // manter mensagem genérica se não conseguirmos ler o body
        }
        setAdminActionError(message);
        return;
      }

      const data = (await res.json()) as unknown;

      if (Array.isArray(data)) {
        const normalized = (data as Array<{ id: string; mesh_username?: string | null; display_name?: string | null }>).map(
          (item) => ({
            id: item.id,
            mesh_username: item.mesh_username ?? null,
            display_name: item.display_name ?? null,
          }),
        );
        setMeshUsers(normalized);
      } else {
        setAdminActionError("Resposta inesperada ao carregar mesh_users (não é uma lista).");
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Erro inesperado ao carregar lista de utilizadores.";
      setAdminActionError(message);
    } finally {
      setMeshUsersLoading(false);
    }
  }, []);

  // Ref para evitar chamadas duplicadas de loadMeshUsers
  const hasFetchedMeshUsersRef = useRef(false);

  useEffect(() => {
    if (!jwt || !userTypeChecked) return;
    // Usar permissão da tabela roles em vez de verificação hardcoded
    if (!userPermissions?.can_access_management_panel) return;
    if (hasFetchedMeshUsersRef.current) return;
    hasFetchedMeshUsersRef.current = true;
    void loadMeshUsers();
  }, [jwt, userTypeChecked, userPermissions?.can_access_management_panel, loadMeshUsers]);

  const handleLogout = useCallback(async () => {
    try {
      if (typeof window === "undefined") return;
      
      // Limpar localStorage primeiro
      window.localStorage.removeItem("rustdesk_jwt");
      
      // Chamar API de logout para limpar cookie de sessão
      await fetch("/api/auth/logout", { method: "POST" });
      
      // Usar router.push para navegação client-side do Next.js
      // Isto garante uma transição suave e limpa o estado do router
      router.push("/");
    } catch (error) {
      console.error("Erro ao fazer logout:", error);
      // Em caso de erro, forçar redirecionamento com reload completo
      window.location.href = "/";
    }
  }, [router]);

  const handleRefreshStatus = useCallback(async () => {
    if (!jwt) return;

    setRefreshError(null);
    setRefreshing(true);

    try {
      const res = await fetch("/api/devices/refresh", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
      });

      let json: { message?: string; error?: string } | null = null;

      try {
        json = (await res.json()) as { message?: string; error?: string };
      } catch {
        json = null;
      }

      if (!res.ok) {
        const message =
          json?.message ??
          (json?.error === "sync_api_not_configured"
            ? "Sincronização on-demand com RustDesk não está configurada neste ambiente."
            : "Falha ao sincronizar com RustDesk.");
        setRefreshError(message);
        return;
      }

      await fetchDevices();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Erro inesperado ao sincronizar com RustDesk.";
      setRefreshError(message);
    } finally {
      setRefreshing(false);
    }
  }, [jwt]);

  const checkForDevice = useCallback(async () => {
    if (!jwt || !registrationSession) return;

    setCheckingDevice(true);
    setQrError("");

    try {
      const statusRes = await fetch(
        `${supabaseUrl}/functions/v1/check-registration-status?session_id=${registrationSession.session_id}`,
        {
          headers: {
            Authorization: `Bearer ${jwt}`,
            apikey: anonKey,
          },
        }
      );

      if (!statusRes.ok) {
        throw new Error("Erro ao verificar status de registro");
      }

      const statusData = await statusRes.json();

      if (statusData.status === "completed") {
        setRegistrationStatus("completed");
        setMatchedDevice(statusData.device_id);

        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
        }

        setTimeout(() => {
          fetchDevices();
        }, 1000);
      } else if (statusData.status === "expired") {
        setRegistrationStatus("expired");
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
        }
      } else {
        setQrError("Dispositivo ainda não detectado. Certifique-se de ter escaneado o QR code na app RustDesk.");
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("Erro ao verificar dispositivo:", errorMsg);
      setQrError(errorMsg);
    } finally {
      setCheckingDevice(false);
    }
  }, [jwt, registrationSession]);

  useEffect(() => {
    // Mantém a referência a checkForDevice activa para futura extensão sem alterar o comportamento actual.
    if (!checkForDevice) {
      return;
    }
  }, [checkForDevice]);

  useEffect(() => {
    // Placeholder para futuros indicadores visuais de "a procurar dispositivo".
    if (checkingDevice) {
      // Sem comportamento adicional por agora.
    }
  }, [checkingDevice]);

  const startRegistrationSession = useCallback(async () => {
    console.log("[Dashboard] startRegistrationSession called, jwt exists:", !!jwt);
    
    if (!jwt) {
      console.error("[Dashboard] No JWT available - cannot start registration");
      setQrError("Sessão não disponível. Por favor faça login novamente.");
      return;
    }

    setShowRegistrationModal(true);
    setQrLoading(true);
    setQrError("");
    setRegistrationStatus("awaiting");
    setMatchedDevice(null);
    setTimeRemaining(300);
    setCheckingDevice(false);
    setHybridDeviceIdInput("");
    setHybridSubmitError(null);
    setHybridSubmitLoading(false);

    try {
      console.log("[Dashboard] Calling start-registration-session edge function");
      const sessionRes = await fetch(`${supabaseUrl}/functions/v1/start-registration-session`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          apikey: anonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          geolocation: null,
        }),
      });

      if (!sessionRes.ok) {
        const error = await sessionRes.json();
        console.error("[Dashboard] Registration session error:", error);
        throw new Error(error.message || "Erro ao iniciar sessão");
      }

      const sessionData = await sessionRes.json();
      setRegistrationSession(sessionData);
      setTimeRemaining(sessionData.expires_in_seconds);

      const qrRes = await fetch(`${supabaseUrl}/functions/v1/generate-qr-image`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${jwt}`,
          apikey: anonKey,
        },
      });

      if (!qrRes.ok) {
        throw new Error("Erro ao gerar QR code");
      }

      const blob = await qrRes.blob();
      const url = URL.createObjectURL(blob);
      setQrImageUrl(url);

      countdownIntervalRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            if (countdownIntervalRef.current) {
              clearInterval(countdownIntervalRef.current);
            }
            setRegistrationStatus("expired");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("Erro ao iniciar registro:", errorMsg);
      setQrError(errorMsg);
    } finally {
      setQrLoading(false);
    }
  }, [jwt]);

  const handleRestartRegistration = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    if (qrImageUrl) {
      URL.revokeObjectURL(qrImageUrl);
    }

    setRegistrationSession(null);
    setQrImageUrl("");
    setQrError("");
    setRegistrationStatus("awaiting");
    setMatchedDevice(null);
    setTimeRemaining(0);
    setCheckingDevice(false);
    setHybridDeviceIdInput("");
    setHybridSubmitError(null);
    setHybridSubmitSuccess(null);
    setHybridSubmitLoading(false);

    void startRegistrationSession();
  }, [qrImageUrl, startRegistrationSession]);

  const closeRegistrationModal = useCallback(() => {
    setShowRegistrationModal(false);
    setRegistrationSession(null);
    setQrImageUrl("");
    setQrError("");
    setRegistrationStatus("awaiting");
    setMatchedDevice(null);
    setTimeRemaining(0);
    setCheckingDevice(false);
    setHybridDeviceIdInput("");
    setHybridSubmitError(null);
    setHybridSubmitSuccess(null);
    setHybridSubmitLoading(false);

    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    if (qrImageUrl) {
      URL.revokeObjectURL(qrImageUrl);
    }
  }, [countdownIntervalRef, qrImageUrl]);

  const handleTryAgainRegistration = useCallback(() => {
    closeRegistrationModal();
    // Start a new registration session after closing
    setTimeout(() => {
      void startRegistrationSession();
    }, 100);
  }, [closeRegistrationModal, startRegistrationSession]);

  const handleHybridSubmit = useCallback(async () => {
    if (!jwt) {
      setHybridSubmitError("Sessão inválida. Por favor, faça login novamente.");
      setHybridSubmitSuccess(null);
      return;
    }

    setHybridSubmitError(null);
    setHybridSubmitSuccess(null);

    const raw = hybridDeviceIdInput;
    const sanitized = raw.replace(/\s+/g, "");

    if (!sanitized) {
      setHybridSubmitError("Por favor, introduza o ID RustDesk.");
      return;
    }

    if (!/^\d+$/.test(sanitized)) {
      setHybridSubmitError("O ID RustDesk deve conter apenas dígitos.");
      return;
    }

    try {
      setHybridSubmitLoading(true);

      const response = await fetch(`${supabaseUrl}/functions/v1/register-device`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          apikey: anonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          device_id: sanitized,
          last_seen: new Date().toISOString(),
          observations: "QR-hybrid adoption",
        }),
      });

      if (!response.ok) {
        let message = "Não foi possível associar o dispositivo. Tente novamente.";
        try {
          const errorBody = (await response.json()) as { message?: string; error?: string };
          if (errorBody.message) {
            message = errorBody.message;
          } else if (errorBody.error) {
            message = errorBody.error;
          }
        } catch {
          // manter mensagem genérica se não conseguir ler o body
        }
        setHybridSubmitError(message);
        setHybridSubmitSuccess(null);
        return;
      }

      await fetchDevices();
      setHybridSubmitError(null);
      setHybridSubmitSuccess("Dispositivo associado com sucesso. A lista foi atualizada.");
    } catch (error) {
      logError("dashboard", "Hybrid RustDesk ID submission failed", { error });
      setHybridSubmitError("Ocorreu um erro ao comunicar com o servidor. Tente novamente.");
      setHybridSubmitSuccess(null);
    } finally {
      setHybridSubmitLoading(false);
    }
  }, [jwt, hybridDeviceIdInput, fetchDevices]);

  const fetchCanonicalGroups = useCallback(async () => {
    if (!jwt) return;

    setGroupsLoading(true);
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-list-groups`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${jwt}`,
          apikey: anonKey,
        },
      });

      if (!res.ok) {
        console.error("Failed to fetch canonical groups:", res.status);
        return;
      }

      const data = (await res.json()) as { groups?: CanonicalGroup[] };
      setCanonicalGroups(Array.isArray(data.groups) ? data.groups : []);
    } catch (err) {
      console.error("Error fetching canonical groups:", err);
    } finally {
      setGroupsLoading(false);
    }
  }, [jwt]);

  useEffect(() => {
    if (jwt) {
      void fetchCanonicalGroups();
    }
  }, [jwt, fetchCanonicalGroups]);

  const openAdoptModal = useCallback((device: GroupableDevice) => {
    setAdoptingDevice(device);
    
    // Try to match legacy group/subgroup to canonical groups
    let matchedGroupId = "";
    let matchedSubgroupId: string | undefined;

    if (device.group_id) {
      matchedGroupId = device.group_id;
      if (device.subgroup_id) {
        matchedSubgroupId = device.subgroup_id;
      }
    } else if (device.group_name) {
      // Legacy: try to find canonical group by normalized name
      const normalized = device.group_name.trim().toLowerCase().replace(/\s+/g, ' ');
      const matchedGroup = canonicalGroups.find(g => 
        g.name.trim().toLowerCase().replace(/\s+/g, ' ') === normalized && !g.parent_group_id
      );
      if (matchedGroup) {
        matchedGroupId = matchedGroup.id;
        
        // Try to match subgroup
        if (device.subgroup_name) {
          const subNormalized = device.subgroup_name.trim().toLowerCase().replace(/\s+/g, ' ');
          const matchedSubgroup = canonicalGroups.find(g =>
            g.name.trim().toLowerCase().replace(/\s+/g, ' ') === subNormalized && 
            g.parent_group_id === matchedGroup.id
          );
          if (matchedSubgroup) {
            matchedSubgroupId = matchedSubgroup.id;
          }
        }
      }
    }

    const notesRaw = device.notes ?? "";
    const parts = notesRaw
      .split("|")
      .map((p: string) => p.trim())
      .filter((p: string) => p.length > 0);

    // Extract observations from notes (skip group/subgroup parts)
    const observations =
      parts.length > 2
        ? parts.slice(2).join(" | ")
        : "";

    setAdoptFormData({
      friendly_name: device.friendly_name || "",
      group_id: matchedGroupId,
      subgroup_id: matchedSubgroupId,
      rustdesk_password: device.rustdesk_password || "",
      observations,
    });
    setAdoptError(null);
    setShowAdoptModal(true);
  }, [canonicalGroups]);

  const closeAdoptModal = useCallback(() => {
    setShowAdoptModal(false);
    setAdoptingDevice(null);
    setAdoptFormData({
      friendly_name: "",
      group_id: "",
      subgroup_id: undefined,
      rustdesk_password: "",
      observations: "",
    });
    setAdoptError(null);
  }, []);

  const handleAdoptSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!jwt || !adoptingDevice) return;

    if (!adoptFormData.group_id.trim()) {
      setAdoptError("Grupo é obrigatório");
      return;
    }

    setAdoptLoading(true);
    setAdoptError(null);

    try {
      const observations = adoptFormData.observations.trim();
      const rustdeskPasswordTrimmed = adoptFormData.rustdesk_password.trim();

      const payload: Record<string, unknown> = {
        device_id: adoptingDevice.device_id,
        friendly_name: adoptFormData.friendly_name.trim() || null,
        group_id: adoptFormData.group_id,
        subgroup_id: adoptFormData.subgroup_id?.trim() || null,
        observations: observations.length > 0 ? observations : null,
        rustdesk_password: rustdeskPasswordTrimmed.length > 0 ? rustdeskPasswordTrimmed : null,
      };

      const res = await fetch(`${supabaseUrl}/functions/v1/register-device`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          apikey: anonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let errorMessage = "Erro ao guardar dispositivo";
        try {
          const error = await res.json();
          errorMessage = error.message || error.error || errorMessage;
        } catch {
          // Ignore parsing errors
        }
        throw new Error(errorMessage);
      }

      await fetchDevices();
      closeAdoptModal();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("Erro ao guardar device:", errorMsg);
      setAdoptError(errorMsg);
    } finally {
      setAdoptLoading(false);
    }
  }, [jwt, adoptingDevice, adoptFormData, fetchDevices, closeAdoptModal]);

  const openAdminReassignModal = useCallback(
    (device: GroupableDevice) => {
      setAdminDeviceToManage(device);
      setAdminReassignForm({
        mesh_username: "",
      });
      setAdminActionError(null);
      if (!meshUsersLoading && meshUsers.length === 0) {
        void loadMeshUsers();
      }
      setShowAdminReassignModal(true);
    },
    [meshUsersLoading, meshUsers.length, loadMeshUsers],
  );

  const closeAdminReassignModal = useCallback(() => {
    setShowAdminReassignModal(false);
    setAdminDeviceToManage(null);
    setAdminReassignForm({ mesh_username: "" });
    setAdminActionError(null);
  }, []);

  const handleAdminReassignSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jwt || !adminDeviceToManage) return;

    if (!adminReassignForm.mesh_username.trim()) {
      setAdminActionError("mesh_username de destino é obrigatório");
      return;
    }

    setAdminActionLoading(true);
    setAdminActionError(null);

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-update-device`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          apikey: anonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          device_id: adminDeviceToManage.device_id,
          target_mesh_username: adminReassignForm.mesh_username.trim(),
        }),
      });

      if (!res.ok) {
        let errorMessage = "Erro ao reatribuir dispositivo";
        try {
          const error = await res.json();
          errorMessage = error.message || error.error || errorMessage;
        } catch {
          // Ignorar erros ao parsear resposta de erro; mantemos a mensagem padrão.
        }
        throw new Error(errorMessage);
      }

      await fetchDevices();
      closeAdminReassignModal();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("Erro ao reatribuir device (admin):", errorMsg);
      setAdminActionError(errorMsg);
    } finally {
      setAdminActionLoading(false);
    }
  }, [jwt, adminDeviceToManage, adminReassignForm, fetchDevices, closeAdminReassignModal]);

  const handleAdminDeleteDevice = useCallback(async (device: GroupableDevice) => {
    if (!jwt) return;
    const confirmed = window.confirm(
      `Tem a certeza que pretende apagar o dispositivo ${device.device_id}?`,
    );
    if (!confirmed) return;

    setAdminActionLoading(true);
    setAdminActionError(null);

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-delete-device`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          apikey: anonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ device_id: device.device_id }),
      });

      if (!res.ok) {
        let errorMessage = "Erro ao apagar dispositivo";
        try {
          const error = await res.json();
          errorMessage = error.message || error.error || errorMessage;
        } catch {
          // Ignorar erros ao parsear resposta de erro; mantemos a mensagem padrão.
        }
        throw new Error(errorMessage);
      }

      await fetchDevices();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("Erro ao apagar device (admin):", errorMsg);
      setAdminActionError(errorMsg);
    } finally {
      setAdminActionLoading(false);
    }
  }, [jwt, fetchDevices]);

  const handleDeleteDevice = useCallback(async (device: GroupableDevice) => {
    if (!jwt) return;
    const confirmed = window.confirm(
      `Tem a certeza que pretende apagar o dispositivo ${device.device_id}?`,
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/remove-device`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${jwt}`,
          apikey: anonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ device_id: device.device_id }),
      });

      if (!res.ok) {
        let errorMessage = "Erro ao apagar dispositivo";
        try {
          const error = await res.json();
          errorMessage = error.message || error.error || errorMessage;
        } catch {
          // Ignorar erros ao parsear resposta de erro; mantemos a mensagem padrão.
        }
        throw new Error(errorMessage);
      }

      await fetchDevices();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("Erro ao apagar device:", errorMsg);
      setErrorMsg(errorMsg);
    }
  }, [jwt, fetchDevices]);

  const isDeviceAdopted = useCallback((device: GroupableDevice): boolean => {
    return device.owner !== null &&
      device.notes !== null &&
      device.notes.trim().length > 0;
  }, []);

  const getFilteredAndSortedDevices = useCallback(() => {
    let filtered = [...devices];

    if (filterStatus === "adopted") {
      filtered = filtered.filter(d => isDeviceAdopted(d));
    } else if (filterStatus === "unadopted") {
      filtered = filtered.filter(d => !isDeviceAdopted(d));
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(d =>
        d.device_id.toLowerCase().includes(query) ||
        (d.notes?.toLowerCase().includes(query)) ||
        (d.friendly_name?.toLowerCase().includes(query))
      );
    }

    filtered.sort((a, b) => {
      switch (sortBy) {
        case "date_desc":
          return new Date(b.last_seen_at || b.created_at || 0).getTime() -
            new Date(a.last_seen_at || a.created_at || 0).getTime();
        case "date_asc":
          return new Date(a.last_seen_at || a.created_at || 0).getTime() -
            new Date(b.last_seen_at || b.created_at || 0).getTime();
        case "name_asc":
          return (a.friendly_name || a.device_id).localeCompare(b.friendly_name || b.device_id);
        case "name_desc":
          return (b.friendly_name || b.device_id).localeCompare(a.friendly_name || a.device_id);
        case "id_asc":
          return a.device_id.localeCompare(b.device_id);
        case "id_desc":
          return b.device_id.localeCompare(a.device_id);
        default:
          return 0;
      }
    });

    return filtered;
  }, [devices, filterStatus, searchQuery, sortBy, isDeviceAdopted]);

  const filteredDevices = getFilteredAndSortedDevices();
  // Usar permissão can_access_all_domains para definir se pode ver todos os dispositivos
  const canAccessAllDomains = userPermissions?.can_access_all_domains ?? false;
  // isAdmin baseado na permissão can_access_all_domains (substitui verificação hardcoded por role name)
  const isAdmin = canAccessAllDomains;
  const unadoptedDevices = filteredDevices.filter((d: GroupableDevice) => !isDeviceAdopted(d));
  const adoptedDevices = filteredDevices.filter((d: GroupableDevice) => isDeviceAdopted(d));
  // Só mostra dispositivos não atribuídos para quem pode aceder a todos os domínios
  const adminUnassignedDevices = isAdmin ? unadoptedDevices : [];

  const totalAdopted = adoptedDevices.length;
  const adoptedTotalPages = Math.max(1, Math.ceil(totalAdopted / adoptedPageSize));

  useEffect(() => {
    // sempre que a lista mudar ou o tamanho de página for alterado, garantir que a página actual é válida
    setCurrentAdoptedPage(1);
  }, [totalAdopted, adoptedPageSize]);

  const paginatedAdoptedDevices = useMemo(() => {
    const start = (currentAdoptedPage - 1) * adoptedPageSize;
    return adoptedDevices.slice(start, start + adoptedPageSize);
  }, [adoptedDevices, currentAdoptedPage, adoptedPageSize]);

  const grouped = useMemo(() => groupDevices(paginatedAdoptedDevices), [paginatedAdoptedDevices]);
  const isEditingDevice = adoptingDevice ? isDeviceAdopted(adoptingDevice) : false;

  const selectedGroup = adoptFormData.group_id 
    ? canonicalGroups.find(g => g.id === adoptFormData.group_id)
    : undefined;
  const availableSubgroups = selectedGroup 
    ? canonicalGroups.filter(g => g.parent_group_id === selectedGroup.id)
    : [];

  return (
    <main className="min-h-screen flex flex-col bg-slate-950">
      <div className="w-full max-w-5xl mx-auto px-4 py-8">
        <DashboardHeader
          userRole={userRole}
          userDomain={userDomain}
          userDisplayName={userDisplayName}
          userPermissions={userPermissions}
          onLogout={handleLogout}
        />

        {refreshError && (
          <div className="mb-4 p-3 bg-amber-950/40 border border-amber-900 rounded-md">
            <p className="text-sm text-amber-400">⚠️ {refreshError}</p>
          </div>
        )}

        <ManagementPanel userPermissions={userPermissions} />

        {/* Secção Adicionar Dispositivo - verifica permissões internamente */}
        <AddDeviceSection
          jwt={jwt}
          selectedRustdeskAbi={selectedRustdeskAbi}
          onSelectAbi={setSelectedRustdeskAbi}
          onOpenQrModal={startRegistrationSession}
          rustdeskApkUrls={RUSTDESK_APK_URLS}
          userPermissions={userPermissions}
        />

        <DeviceFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filterStatus={filterStatus}
          onFilterStatusChange={setFilterStatus}
          sortBy={sortBy}
          onSortChange={setSortBy}
          totalDevices={devices.length}
          adoptedCount={adoptedDevices.length}
          unadoptedCount={unadoptedDevices.length}
          onRefresh={handleRefreshStatus}
          refreshing={refreshing}
        />

        {!isAdmin && (
          <UnadoptedDevicesList
            devices={unadoptedDevices}
            onAdopt={openAdoptModal}
            userPermissions={userPermissions}
          />
        )}

        {isAdmin && (
          <AdminUnassignedDevicesList
            devices={adminUnassignedDevices}
            onReassign={openAdminReassignModal}
            onDelete={handleAdminDeleteDevice}
            loading={adminActionLoading}
            error={adminActionError}
          />
        )}

        <AdoptedDevicesList
          devices={adoptedDevices}
          grouped={grouped}
          loading={loading}
          refreshing={refreshing}
          errorMsg={errorMsg}
          isAdmin={isAdmin}
          currentPage={currentAdoptedPage}
          totalPages={adoptedTotalPages}
          pageSize={adoptedPageSize}
          onPageChange={setCurrentAdoptedPage}
          onPageSizeChange={setAdoptedPageSize}
          onRefresh={handleRefreshStatus}
          onEdit={openAdoptModal}
          onDelete={handleDeleteDevice}
          onConnect={(d) => {
            const url = buildRustdeskUrl(d);
            if (typeof window !== "undefined") {
              window.location.href = url;
            }
          }}
          expandedGroups={expandedGroups}
          expandedSubgroups={expandedSubgroups}
          onToggleGroup={(groupKey) =>
            setExpandedGroups((prev) => ({
              ...prev,
              [groupKey]: !(prev[groupKey] ?? true),
            }))
          }
          onToggleSubgroup={(subKey) =>
            setExpandedSubgroups((prev) => ({
              ...prev,
              [subKey]: !prev[subKey],
            }))
          }
          userPermissions={userPermissions}
        />
      </div>

      <RegistrationModal
        isOpen={showRegistrationModal}
        onClose={closeRegistrationModal}
        registrationStatus={registrationStatus}
        qrLoading={qrLoading}
        qrError={qrError}
        qrImageUrl={qrImageUrl}
        timeRemaining={timeRemaining}
        hybridDeviceIdInput={hybridDeviceIdInput}
        onHybridDeviceIdChange={setHybridDeviceIdInput}
        hybridSubmitLoading={hybridSubmitLoading}
        hybridSubmitError={hybridSubmitError}
        hybridSubmitSuccess={hybridSubmitSuccess}
        onHybridSubmit={handleHybridSubmit}
        onRestart={handleRestartRegistration}
        matchedDevice={matchedDevice}
        onTryAgain={handleTryAgainRegistration}
      />

      {!isAdmin && (
        <AdoptModal
          isOpen={showAdoptModal && !!adoptingDevice}
          device={adoptingDevice}
          isEditing={isEditingDevice}
          formData={adoptFormData}
          onFormChange={setAdoptFormData}
          onSubmit={handleAdoptSubmit}
          onClose={closeAdoptModal}
          loading={adoptLoading}
          error={adoptError}
          groupsLoading={groupsLoading}
          groups={canonicalGroups}
          availableSubgroups={availableSubgroups}
          selectedGroup={selectedGroup}
        />
      )}

      <AdminReassignModal
        isOpen={showAdminReassignModal && !!adminDeviceToManage}
        device={adminDeviceToManage}
        formData={adminReassignForm}
        onFormChange={setAdminReassignForm}
        onSubmit={handleAdminReassignSubmit}
        onClose={closeAdminReassignModal}
        loading={adminActionLoading}
        error={adminActionError}
        meshUsersLoading={meshUsersLoading}
        meshUsers={meshUsers}
      />
    </main>
  );
}