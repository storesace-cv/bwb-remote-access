"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import QRCode from "react-qr-code";

import { GroupableDevice, groupDevices } from "@/lib/grouping";
import { logError } from "@/lib/debugLogger";
import { RolePermissions, getCurrentUserPermissions } from "@/lib/permissions-service";

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

interface AdoptFormData {
  friendly_name: string;
  group_id: string;
  subgroup_id?: string;
  rustdesk_password: string;
  observations: string;
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

  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("date_desc");
  const [showFilters, setShowFilters] = useState(false);

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

  const [selectedRustdeskAbi, setSelectedRustdeskAbi] = useState<"arm64" | "armeabi" | "x86_64" | null>(null);
  const [currentAdoptedPage, setCurrentAdoptedPage] = useState<number>(1);
  const [adoptedPageSize, setAdoptedPageSize] = useState<number>(ADOPTED_PAGE_SIZE);

  const RUSTDESK_APK_URLS = {
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

  const handleLogout = useCallback(() => {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.removeItem("rustdesk_jwt");
      window.location.href = "/";
      return;
    } catch {
      // Se não conseguirmos limpar o localStorage, continuamos o logout mesmo assim.
    }
    router.push("/");
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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const selectedGroup = adoptFormData.group_id 
    ? canonicalGroups.find(g => g.id === adoptFormData.group_id)
    : null;
  const availableSubgroups = selectedGroup 
    ? canonicalGroups.filter(g => g.parent_group_id === selectedGroup.id)
    : [];

  return (
    <main className="min-h-screen flex flex-col bg-slate-950">
      <div className="w-full max-w-5xl mx-auto px-4 py-8">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-white">BWB | Suporte Android</h1>
            <div className="flex flex-col">
              <p className="text-sm text-slate-400">
                © jorge peixinho - Business with Brains
              </p>
              {userDisplayName && (
                <p className="text-xs text-slate-500">
                  {userDisplayName}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {userPermissions?.can_view_users && (
              <Link
                href="/dashboard/users"
                className="px-3 py-1.5 text-sm rounded-md bg-slate-700 hover:bg-slate-600 transition text-white"
              >
                Gestão de Utilizadores
              </Link>
            )}
            <Link
              href="/dashboard/profile"
              className="px-3 py-1.5 text-sm rounded-md bg-slate-700 hover:bg-slate-600 transition text-white"
              data-testid="dashboard-profile-link"
            >
              Perfil
            </Link>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 text-sm rounded-md bg-red-600 hover:bg-red-500 transition text-white"
            >
              Sair
            </button>
          </div>
        </header>

        {refreshError && (
          <div className="mb-4 p-3 bg-amber-950/40 border border-amber-900 rounded-md">
            <p className="text-sm text-amber-400">⚠️ {refreshError}</p>
          </div>
        )}

        {/* Painel de Gestão - visível se tem permissão can_access_management_panel */}
        {userPermissions?.can_access_management_panel && (
          <section className="bg-gradient-to-br from-emerald-900/20 to-slate-900/40 border border-emerald-700/40 rounded-2xl p-6 mb-6 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-emerald-400">
                  🎯 Painel de Gestão ({userRole.displayName || "Utilizador"}){userDomain && ` | ${userDomain}`}{userDisplayName && ` | ${userDisplayName}`}
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  {userPermissions?.can_access_all_domains
                    ? "Tens acesso total à gestão de utilizadores, colaboradores e dispositivos"
                    : userPermissions?.can_access_own_domain_only
                    ? "Podes gerir utilizadores e colaboradores do teu domínio"
                    : "Tens acesso ao painel de gestão"}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Colaboradores - visível se pode ver utilizadores */}
              {userPermissions?.can_view_users && (
                <Link
                  href="/dashboard/collaborators"
                  className="group bg-slate-900/70 border border-slate-700 hover:border-emerald-600 rounded-xl p-4 transition-all hover:shadow-lg hover:shadow-emerald-900/20"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-600/20 flex items-center justify-center text-xl">
                      👥
                    </div>
                    <svg className="w-5 h-5 text-slate-600 group-hover:text-emerald-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <h3 className="font-medium text-white mb-1">Colaboradores</h3>
                  <p className="text-xs text-slate-400">
                    Criar e gerir colaboradores que terão acesso aos teus dispositivos
                  </p>
                </Link>
              )}

              {/* Grupos - visível se pode ver grupos */}
              {userPermissions?.can_view_groups && (
                <Link
                  href="/dashboard/groups"
                  className="group bg-slate-900/70 border border-slate-700 hover:border-emerald-600 rounded-xl p-4 transition-all hover:shadow-lg hover:shadow-emerald-900/20"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center text-xl">
                      📦
                    </div>
                    <svg className="w-5 h-5 text-slate-600 group-hover:text-emerald-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <h3 className="font-medium text-white mb-1">Grupos e Permissões</h3>
                  <p className="text-xs text-slate-400">
                    Organizar dispositivos em grupos e gerir permissões dos colaboradores
                  </p>
                </Link>
              )}

              {/* Gestão de Utilizadores - visível se pode ver utilizadores */}
              {userPermissions?.can_view_users && (
                <Link
                  href="/dashboard/users"
                  className="group bg-slate-900/70 border border-slate-700 hover:border-amber-600 rounded-xl p-4 transition-all hover:shadow-lg hover:shadow-amber-900/20"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-amber-600/20 flex items-center justify-center text-xl">
                      🔑
                    </div>
                    <svg className="w-5 h-5 text-slate-600 group-hover:text-amber-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <h3 className="font-medium text-white mb-1">Gestão de Utilizadores</h3>
                  <p className="text-xs text-slate-400">
                    Gerir utilizadores, criar contas e atribuir roles
                  </p>
                </Link>
              )}

              {/* Gestão de Roles - visível apenas se pode gerir roles */}
              {userPermissions?.can_manage_roles && (
                <Link
                  href="/dashboard/roles"
                  className="group bg-slate-900/70 border border-slate-700 hover:border-purple-600 rounded-xl p-4 transition-all hover:shadow-lg hover:shadow-purple-900/20"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center text-xl">
                      ⚙️
                    </div>
                    <svg className="w-5 h-5 text-slate-600 group-hover:text-purple-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <h3 className="font-medium text-white mb-1">Gestão de Roles</h3>
                  <p className="text-xs text-slate-400">
                    Configurar permissões de cada role do sistema
                  </p>
                </Link>
              )}
            </div>
          </section>
        )}

        {/* Secção Adicionar Dispositivo - visível para todos os utilizadores */}
        <section className="bg-gradient-to-br from-sky-900/20 to-slate-900/40 border border-sky-700/40 rounded-2xl p-6 mb-6 backdrop-blur-sm" data-testid="add-device-section">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-sky-400" data-testid="add-device-title">📱 Adicionar Dispositivo</h2>
              <p className="text-xs text-slate-400 mt-1">
                Escolhe o método de provisionamento que melhor se adapta ao teu dispositivo
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={startRegistrationSession}
              disabled={!jwt}
              className={`group bg-slate-900/70 border border-slate-700 hover:border-sky-600 rounded-xl p-4 transition-all hover:shadow-lg hover:shadow-sky-900/20 text-left ${!jwt ? 'opacity-50 cursor-not-allowed' : ''}`}
              data-testid="scan-qr-button"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-sky-600/20 flex items-center justify-center text-xl">
                  📷
                </div>
                <svg className="w-5 h-5 text-slate-600 group-hover:text-sky-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
                <h3 className="font-medium text-white mb-1">Escanear QR Code</h3>
                <p className="text-xs text-slate-400">
                  Gera um QR code para dispositivos móveis com câmara (smartphones, tablets Android)
                </p>
                <div className="mt-3 inline-flex items-center text-xs text-sky-400 font-medium">
                  <span>Abrir modal QR</span>
                  <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </div>
              </button>

              <Link
                href="/provisioning"
                className="group bg-slate-900/70 border border-slate-700 hover:border-sky-600 rounded-xl p-4 transition-all hover:shadow-lg hover:shadow-sky-900/20 block"
                data-testid="provisioning-link"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center text-xl">
                    🔢
                  </div>
                  <svg className="w-5 h-5 text-slate-600 group-hover:text-sky-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
                <h3 className="font-medium text-white mb-1">Provisionamento sem QR</h3>
                <p className="text-xs text-slate-400">
                  Gera código de 4 dígitos para Android TV, boxes e dispositivos sem câmara
                </p>
                <div className="mt-3 inline-flex items-center text-xs text-sky-400 font-medium">
                  <span>Ir para Provisioning</span>
                  <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </div>
              </Link>
            </div>

            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                <button
                  type="button"
                  onClick={() => setSelectedRustdeskAbi("arm64")}
                  className={`px-3 py-2 text-xs sm:text-sm rounded-md border transition ${
                    selectedRustdeskAbi === "arm64"
                      ? "bg-emerald-600 border-emerald-500 text-white"
                      : "bg-slate-800 border-slate-600 text-slate-100 hover:bg-slate-700"
                  }`}
                >
                  arm64‑v8a (recomendado)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedRustdeskAbi("armeabi")}
                  className={`px-3 py-2 text-xs sm:text-sm rounded-md border transition ${
                    selectedRustdeskAbi === "armeabi"
                      ? "bg-emerald-600 border-emerald-500 text-white"
                      : "bg-slate-800 border-slate-600 text-slate-100 hover:bg-slate-700"
                  }`}
                >
                  armeabi‑v7a (dispositivos mais antigos, 32‑bit)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedRustdeskAbi("x86_64")}
                  className={`px-3 py-2 text-xs sm:text-sm rounded-md border transition ${
                    selectedRustdeskAbi === "x86_64"
                      ? "bg-emerald-600 border-emerald-500 text-white"
                      : "bg-slate-800 border-slate-600 text-slate-100 hover:bg-slate-700"
                  }`}
                >
                  x86_64 (Android TV / x86)
                </button>
              </div>

              {selectedRustdeskAbi ? (
                <div className="flex flex-col items-center space-y-2">
                  <div className="bg-white p-3 rounded-md shadow-sm">
                    <QRCode
                      value={RUSTDESK_APK_URLS[selectedRustdeskAbi]}
                      size={128}
                      bgColor="#ffffff"
                      fgColor="#020617"
                    />
                  </div>
                  <p className="text-xs font-semibold text-slate-100">
                    {selectedRustdeskAbi === "arm64" && "arm64‑v8a (a maioria dos dispositivos Android recentes)"}
                    {selectedRustdeskAbi === "armeabi" && "armeabi‑v7a (dispositivos mais antigos, 32‑bit)"}
                    {selectedRustdeskAbi === "x86_64" && "x86_64 (Android TV / boxes e ambientes x86_64)"}
                  </p>
                  <p className="text-[11px] text-center text-slate-400">
                    Aponta a câmara do dispositivo Android para este QR code para descarregar o APK correspondente.
                  </p>
                  <p className="text-[10px] text-center text-slate-500 break-all">
                    {RUSTDESK_APK_URLS[selectedRustdeskAbi]}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-400 text-center">
                  Escolhe primeiro o tipo de processador para ver o QR‑code correspondente.
                </p>
              )}
            </div>
          </section>

        <section className="bg-slate-900/70 border border-slate-700 rounded-2xl p-4 mb-6 backdrop-blur-sm">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="🔍 Procurar por ID, nome ou notas..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 text-sm rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="px-4 py-2 text-sm rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="date_desc">📅 Mais recentes</option>
              <option value="date_asc">📅 Mais antigos</option>
              <option value="name_asc">🔤 Nome A-Z</option>
              <option value="name_desc">🔤 Nome Z-A</option>
              <option value="id_asc">🔢 ID crescente</option>
              <option value="id_desc">🔢 ID decrescente</option>
            </select>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-4 py-2 text-sm rounded-lg transition ${
                showFilters
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-800 border border-slate-600 text-slate-300 hover:bg-slate-700"
              }`}
            >
              🔧 Filtros
            </button>
          </div>

          {showFilters && (
            <div className="mt-4 pt-4 border-t border-slate-700/50">
              <div className="flex gap-2">
                <button
                  onClick={() => setFilterStatus("all")}
                  className={`px-3 py-1.5 text-xs rounded-md transition ${
                    filterStatus === "all"
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  Todos ({devices.length})
                </button>
                <button
                  onClick={() => setFilterStatus("adopted")}
                  className={`px-3 py-1.5 text-xs rounded-md transition ${
                    filterStatus === "adopted"
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  Adoptados ({devices.filter(d => isDeviceAdopted(d)).length})
                </button>
                {!isAdmin && (
                  <button
                    onClick={() => setFilterStatus("unadopted")}
                    className={`px-3 py-1.5 text-xs rounded-md transition ${
                      filterStatus === "unadopted"
                        ? "bg-amber-600 text-white"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    Por adoptar ({devices.filter(d => !isDeviceAdopted(d)).length})
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        {!isAdmin && unadoptedDevices.length > 0 && (
          <section className="bg-amber-950/30 border border-amber-800/50 rounded-2xl p-6 mb-6 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-medium text-amber-400">
                  ⚠️ Dispositivos por adoptar
                </h2>
                <p className="text-sm text-amber-300/70 mt-1">
                  Estes dispositivos conectaram mas ainda precisam de informações
                  adicionais (grupo, nome, etc.)
                </p>
              </div>
              <span className="px-3 py-1 text-xs font-semibold rounded-full bg-amber-600 text-white">
                {unadoptedDevices.length}
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {unadoptedDevices.map((device: GroupableDevice) => {
                const fromProvisioningCode = !!device.from_provisioning_code;
                const tagLabel = fromProvisioningCode ? "PM" : "QR";
                const tagClassName = fromProvisioningCode
                  ? "bg-white text-black border border-slate-300"
                  : "bg-sky-600/80 text-white border border-sky-500";
                const notesParts = (device.notes ?? "")
                  .split("|")
                  .map((p: string) => p.trim())
                  .filter((p: string) => p.length > 0);

                const groupLabel =
                  device.group_name || notesParts[0] || "";
                const subgroupLabel =
                  device.subgroup_name || notesParts[1] || "";
                const observations =
                  notesParts.length > 2
                    ? notesParts.slice(2).join(" | ")
                    : "";

                return (
                  <div
                    key={device.id}
                    className="border border-amber-700/50 rounded-lg px-4 py-3 bg-slate-950/50"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-amber-100 text-sm">
                            {device.device_id}
                          </span>
                          {device.friendly_name && (
                            <span className="text-xs text-amber-300/70">
                              ({device.friendly_name})
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${tagClassName}`}
                          >
                            {tagLabel}
                          </span>
                        </div>
                        {(groupLabel || subgroupLabel) && (
                          <p className="text-xs text-slate-400">
                            {groupLabel}
                            {groupLabel && subgroupLabel ? " | " : ""}
                            {subgroupLabel}
                          </p>
                        )}
                        {observations && (
                          <p className="text-xs text-slate-500 mt-0.5">
                            Obs: {observations}
                          </p>
                        )}
                        <p className="text-xs text-slate-500 mt-1">
                          Visto:{" "}
                          {new Date(
                            device.last_seen_at || device.created_at || "",
                          ).toLocaleString("pt-PT")}
                        </p>
                        {device.owner && (
                          <p className="text-xs text-emerald-400 mt-1">
                            ✓ Associado ao utilizador
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => openAdoptModal(device)}
                        className="px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-600 hover:bg-emerald-500 transition text-white"
                      >
                        ✓ Adoptar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {isAdmin && adminUnassignedDevices.length > 0 && (
          <section className="bg-purple-950/30 border border-purple-800/60 rounded-2xl p-6 mb-6 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-medium text-purple-200">
                  🧩 Dispositivos sem Utilizador Atribuido
                </h2>
                <p className="text-sm text-purple-200/70 mt-1">
                  Dispositivos que não foi possível associar com segurança a nenhum utilizador. Pode reatribuir manualmente ou apagar.
                </p>
              </div>
              <span className="px-3 py-1 text-xs font-semibold rounded-full bg-purple-600 text-white">
                {adminUnassignedDevices.length}
              </span>
            </div>

            {adminActionError && (
              <div className="mb-4 p-3 bg-red-950/40 border border-red-900 rounded-md">
                <p className="text-sm text-red-400">{adminActionError}</p>
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              {adminUnassignedDevices.map((device: GroupableDevice) => (
                <div
                  key={device.id}
                  className="border border-purple-800/60 rounded-lg px-4 py-3 bg-slate-950/60"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-purple-100 text-sm">
                          {device.device_id}
                        </span>
                        {device.friendly_name && (
                          <span className="text-xs text-purple-200/80">
                            ({device.friendly_name})
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        Visto:{" "}
                        {new Date(
                          device.last_seen_at || device.created_at ||
                          "",
                        ).toLocaleString("pt-PT")}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 ml-2">
                      <button
                        type="button"
                        onClick={() => openAdminReassignModal(device)}
                        disabled={adminActionLoading}
                        className="px-3 py-1.5 text-xs rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition text-white"
                      >
                        Reatribuir
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAdminDeleteDevice(device)}
                        disabled={adminActionLoading}
                        className="px-3 py-1.5 text-xs rounded-md bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition text-white"
                      >
                        Apagar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {(!isAdmin || adoptedDevices.length > 0) && (
          <section className="bg-slate-900/70 border border-slate-700 rounded-2xl p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-white">✅ Dispositivos Adoptados</h2>
              <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-3">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <span className="hidden sm:inline">Por página:</span>
                  <select
                    value={adoptedPageSize}
                    onChange={(e) => {
                      const value = Number.parseInt(e.target.value, 10);
                      setAdoptedPageSize(Number.isNaN(value) ? ADOPTED_PAGE_SIZE : value);
                    }}
                    className="px-2 py-1 rounded-md border border-slate-600 bg-slate-800 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  {adoptedTotalPages > 1 && (
                    <div className="flex items-center gap-2 text-xs text-slate-300">
                      <button
                        type="button"
                        onClick={() =>
                          setCurrentAdoptedPage((prev: number) => Math.max(1, prev - 1))
                        }
                        disabled={currentAdoptedPage === 1}
                        className="px-2 py-1 rounded-md border border-slate-600 bg-slate-800 hover:bg-slate-700 disabled:opacity-50"
                      >
                        Anterior
                      </button>
                      <span>
                        Página {currentAdoptedPage} de {adoptedTotalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setCurrentAdoptedPage((prev: number) =>
                            Math.min(adoptedTotalPages, prev + 1),
                          )
                        }
                        disabled={currentAdoptedPage === adoptedTotalPages}
                        className="px-2 py-1 rounded-md border border-slate-600 bg-slate-800 hover:bg-slate-700 disabled:opacity-50"
                      >
                        Próxima
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleRefreshStatus}
                    disabled={refreshing}
                    className="px-3 py-1.5 text-xs rounded-md border border-slate-600 bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-slate-100 flex items-center gap-1"
                  >
                    {refreshing ? (
                      <>
                        <span className="h-3 w-3 rounded-full border-2 border-slate-600 border-t-transparent animate-spin" />
                        <span>A sincronizar…</span>
                      </>
                    ) : (
                      <>🔄 Atualizar estado</>
                    )}
                  </button>
                  {loading && (
                    <span className="text-xs text-slate-400">A carregar…</span>
                  )}
                </div>
              </div>
            </div>

            {errorMsg && (
              <p className="text-sm text-amber-400 mb-3">{errorMsg}</p>
            )}

            {adoptedDevices.length === 0 && !loading && !errorMsg && (
              <p className="text-sm text-slate-400">
                Sem dispositivos adoptados.
              </p>
            )}

            {grouped.groups.length > 0 && (
              <div className="space-y-4 mt-2">
                {grouped.groups.map((groupBucket) => {
                  const groupName = groupBucket.name ?? "";
                  const groupKey = groupName || "__semgrupo__";
                  const isGroupExpanded = expandedGroups[groupKey] ?? true;

                  return (
                    <div
                      key={groupKey}
                      className="border border-slate-700 rounded-xl overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedGroups((prev) => ({
                            ...prev,
                            [groupKey]: !isGroupExpanded,
                          }))
                        }
                        className="w-full flex items-center justify-between px-4 py-2 bg-slate-800/70 hover:bg-slate-800 text-left"
                      >
                        <span className="font-medium text-sm text-white">
                          {groupName}
                        </span>
                        <span className="text-xs text-slate-400">
                          {isGroupExpanded ? "▼" : "►"}
                        </span>
                      </button>

                      {isGroupExpanded && (
                        <div className="px-4 py-3 space-y-3">
                          {groupBucket.subgroups.map((subBucket) => {
                            const subgroupName = subBucket.name ?? "";
                            const groupLabel = groupBucket.name ?? "Sem grupo";
                            const subgroupLabel = subgroupName || "Sem subgrupo";
                            const subKey = `${groupKey}::${subgroupName || "__nosub__"}`;
                            const isSubExpanded =
                              expandedSubgroups[subKey] ?? false;

                            return (
                              <div key={subKey} className="flex flex-col gap-1">
                                {subgroupName ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedSubgroups((prev) => ({
                                        ...prev,
                                        [subKey]: !isSubExpanded,
                                      }))
                                    }
                                    className="flex items-center justify-between text-xs text-muted-foreground hover:text-slate-300 transition-colors text-left"
                                  >
                                    <span>{groupLabel} · {subgroupLabel}</span>
                                    <span className="ml-2">{isSubExpanded ? "▼" : "►"}</span>
                                  </button>
                                ) : (
                                  <div className="text-xs text-muted-foreground">
                                    {groupLabel} · {subgroupLabel}
                                  </div>
                                )}
                                {(isSubExpanded || !subgroupName) && (
                                  <div className="grid gap-3 md:grid-cols-2">
                                    {subBucket.devices.map((d: GroupableDevice) => {
                                      const fromProvisioningCode =
                                        !!d.from_provisioning_code;
                                      const tagLabel = fromProvisioningCode ? "PM" : "QR";
                                      const tagClassName = fromProvisioningCode
                                        ? "bg-white text-black border border-slate-300"
                                        : "bg-sky-600/80 text-white border border-sky-500";

                                      const notesParts = (d.notes ?? "")
                                        .split("|")
                                        .map((p: string) => p.trim())
                                        .filter((p: string) => p.length > 0);

                                      const groupLabelDevice =
                                        d.group_name || notesParts[0] || "";
                                      const subgroupLabelDevice =
                                        d.subgroup_name || notesParts[1] || "";

                                      const observations =
                                        notesParts.length > 2
                                          ? notesParts.slice(2).join(" | ")
                                          : "";

                                      const groupLine =
                                        groupLabelDevice || subgroupLabelDevice
                                          ? `${groupLabelDevice}${
                                              groupLabelDevice && subgroupLabelDevice
                                                ? " | "
                                                : ""
                                            }${subgroupLabelDevice}`
                                          : "";

                                      return (
                                        <div
                                          key={d.id}
                                          className="border border-slate-700 rounded-lg px-3 py-2 bg-slate-950/50 text-xs"
                                        >
                                          <div className="flex justify-between items-start mb-1">
                                            <div>
                                              <div className="flex items-center gap-2">
                                                <span className="font-semibold text-white">
                                                  {d.friendly_name || d.device_id}
                                                </span>
                                                {d.mesh_username && (
                                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                                                    {d.mesh_username}
                                                  </span>
                                                )}
                                                {fromProvisioningCode && (
                                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white text-black border border-slate-300">
                                                    PM
                                                  </span>
                                                )}
                                                <span
                                                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${tagClassName}`}
                                                >
                                                  {tagLabel}
                                                </span>
                                              </div>
                                              <p className="text-[11px] text-slate-400 mt-0.5">
                                                ID: {d.device_id}
                                              </p>
                                              {groupLine && (
                                                <p className="text-[11px] text-slate-400 mt-0.5">
                                                  {groupLine}
                                                </p>
                                              )}
                                              {observations && (
                                                <p className="text-[11px] text-slate-500 mt-0.5">
                                                  Obs: {observations}
                                                </p>
                                              )}
                                              <p className="text-[11px] text-slate-500 mt-0.5">
                                                Visto:{" "}
                                                {new Date(
                                                  d.last_seen_at ||
                                                    d.created_at ||
                                                    "",
                                                ).toLocaleString("pt-PT")}
                                              </p>
                                            </div>
                                            <div className="flex items-stretch gap-2 ml-2">
                                              <div className="flex flex-col gap-1">
                                                {!isAdmin && (
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      openAdoptModal(d)
                                                    }
                                                    className="px-2 py-1 rounded-md bg-slate-700 hover:bg-slate-600 text-[10px] text-white"
                                                  >
                                                    Editar
                                                  </button>
                                                )}
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    handleDeleteDevice(d)
                                                  }
                                                  className="px-2 py-1 rounded-md bg-red-600 hover:bg-red-500 text-[10px] text-white"
                                                >
                                                  Apagar
                                                </button>
                                              </div>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const url = buildRustdeskUrl(d);
                                                  if (typeof window !== "undefined") {
                                                    window.location.href = url;
                                                  }
                                                }}
                                                className="w-9 h-9 flex items-center justify-center rounded-md bg-sky-600 hover:bg-sky-500 text-white shadow-sm"
                                                aria-label="Abrir no RustDesk"
                                              >
                                                <Image
                                                  src="/rustdesk-logo.svg"
                                                  alt="RustDesk"
                                                  width={18}
                                                  height={18}
                                                />
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

      </div>

      {showRegistrationModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            {registrationStatus === "awaiting" && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">Escanear QR Code</h3>
                  <button
                    onClick={closeRegistrationModal}
                    className="text-slate-400 hover:text-white transition"
                    disabled={qrLoading || hybridSubmitLoading}
                  >
                    ✕
                  </button>
                </div>

                <div className="flex flex-col items-center mb-4">
                  {qrLoading ? (
                    <div className="w-64 h-64 rounded-lg bg-slate-800 flex items-center justify-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-4 border-slate-600 border-t-emerald-500"></div>
                    </div>
                  ) : qrError && !qrImageUrl ? (
                    <div className="w-64 h-64 rounded-lg bg-slate-800 flex items-center justify-center text-center p-4">
                      <div>
                        <p className="text-red-400 font-semibold mb-2">Erro</p>
                        <p className="text-xs text-slate-400">{qrError}</p>
                      </div>
                    </div>
                  ) : (
                    <img
                      src={qrImageUrl}
                      alt="RustDesk QR"
                      width={256}
                      height={256}
                      className="rounded-lg bg-white p-3"
                    />
                  )}
                </div>

                <div className="bg-slate-800/50 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-slate-400">Tempo restante:</span>
                    <span className="text-2xl font-bold text-emerald-400 font-mono">
                      {formatTime(timeRemaining)}
                    </span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full transition-all duration-1000"
                      style={{ width: `${(timeRemaining / 300) * 100}%` }}
                    ></div>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <label className="block text-sm font-medium text-slate-700">
                    ID RustDesk do dispositivo
                  </label>
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleHybridSubmit();
                    }}
                  >
                    <input
                      type="text"
                      inputMode="numeric"
                      className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                      placeholder="Ex.: 123 456 789"
                      value={hybridDeviceIdInput}
                      onChange={(e) => setHybridDeviceIdInput(e.target.value)}
                      disabled={qrLoading || hybridSubmitLoading}
                    />
                    <button
                      type="submit"
                      className="inline-flex items-center justify-center rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={qrLoading || hybridSubmitLoading}
                    >
                      {hybridSubmitLoading ? "A enviar..." : "ENVIAR"}
                    </button>
                  </form>
                  <p className="text-xs text-slate-500">
                    Podes escrever o ID com ou sem espaços, mas apenas dígitos são aceites.
                  </p>
                </div>

                {hybridSubmitError && (
                  <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {hybridSubmitError}
                  </div>
                )}

                {hybridSubmitSuccess && (
                  <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                    {hybridSubmitSuccess}
                  </div>
                )}

                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    onClick={handleRestartRegistration}
                    disabled={qrLoading || hybridSubmitLoading}
                  >
                    Tentar novamente
                  </button>
                  <button
                    type="button"
                    className="rounded-md bg-slate-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    onClick={closeRegistrationModal}
                    disabled={qrLoading || hybridSubmitLoading}
                  >
                    Fechar
                  </button>
                </div>
              </>
            )}

            {registrationStatus === "completed" && matchedDevice && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-emerald-400">✅ Dispositivo Detectado!</h3>
                  <button
                    onClick={closeRegistrationModal}
                    className="text-slate-400 hover:text-white transition"
                  >
                    ✕
                  </button>
                </div>

                <div className="bg-emerald-950/30 border border-emerald-800/50 rounded-lg p-4 mb-4">
                  <p className="text-sm text-slate-300">
                    <span className="font-semibold">ID:</span> {matchedDevice.device_id}
                  </p>
                  {matchedDevice.friendly_name && (
                    <p className="text-sm text-slate-300">
                      <span className="font-semibold">Nome:</span> {matchedDevice.friendly_name}
                    </p>
                  )}
                  <p className="text-xs text-amber-400 mt-2">
                    ⚠️ O dispositivo aparecerá em &quot;Dispositivos por adoptar&quot;. Clica em &quot;Adoptar&quot; para adicionar informações adicionais.
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
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
                    }}
                    className="flex-1 px-4 py-2 text-sm font-medium rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition text-white"
                  >
                    Tentar Novamente
                  </button>
                  <button
                    onClick={() => {
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
                    }}
                    className="flex-1 px-4 py-2 text-sm rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition text-white"
                  >
                    Fechar
                  </button>
                </div>
              </>
            )}

            {registrationStatus === "expired" && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-amber-400">⏱️ Tempo Esgotado</h3>
                  <button
                    onClick={closeRegistrationModal}
                    className="text-slate-400 hover:text-white transition"
                  >
                    ✕
                  </button>
                </div>

                <div className="bg-amber-950/30 border border-amber-800/50 rounded-lg p-4 mb-4">
                  <p className="text-sm text-slate-300">
                    A sessão de registro expirou. Por favor, tente novamente.
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
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
                    }}
                    className="flex-1 px-4 py-2 text-sm font-medium rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition text-white"
                  >
                    Tentar Novamente
                  </button>
                  <button
                    onClick={() => {
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
                    }}
                    className="flex-1 px-4 py-2 text-sm rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition text-white"
                  >
                    Fechar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showAdoptModal && adoptingDevice && !isAdmin && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">
                {isEditingDevice ? "Editar Dispositivo" : "Adoptar Dispositivo"}
              </h3>
              <button
                onClick={closeAdoptModal}
                className="text-slate-400 hover:text-white transition"
                disabled={adoptLoading}
              >
                ✕
              </button>
            </div>

            <div className="mb-4 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
              <p className="text-xs text-slate-400 mb-1">Device ID:</p>
              <p className="text-sm font-mono text-white">{adoptingDevice.device_id}</p>
            </div>

            <form onSubmit={handleAdoptSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">
                  Nome do Dispositivo <span className="text-slate-500">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={adoptFormData.friendly_name}
                  onChange={(e) =>
                    setAdoptFormData({ ...adoptFormData, friendly_name: e.target.value })
                  }
                  placeholder="Ex: Tablet Sala, Samsung A54, etc."
                  className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={adoptLoading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">
                  Grupo <span className="text-red-400">*</span>
                </label>
                <select
                  value={adoptFormData.group_id}
                  onChange={(e) =>
                    setAdoptFormData({ ...adoptFormData, group_id: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={adoptLoading}
                  required
                >
                  {groupsLoading && (
                    <option value="">A carregar lista de grupos...</option>
                  )}
                  {!groupsLoading && canonicalGroups.length === 0 && (
                    <option value="">Nenhum grupo encontrado</option>
                  )}
                  {!groupsLoading && canonicalGroups.length > 0 && (
                    <>
                      <option value="">Selecione um grupo...</option>
                      {canonicalGroups
                        .filter(g => !g.parent_group_id)
                        .map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.name}
                          </option>
                        ))}
                    </>
                  )}
                </select>
                <p className="text-xs text-slate-500 mt-1">Campo obrigatório</p>
              </div>

              {availableSubgroups.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1">
                    Subgrupo <span className="text-slate-500">(opcional)</span>
                  </label>
                  <select
                    value={adoptFormData.subgroup_id || ""}
                    onChange={(e) =>
                      setAdoptFormData({ ...adoptFormData, subgroup_id: e.target.value || undefined })
                    }
                    className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    disabled={adoptLoading}
                  >
                    <option value="">Nenhum subgrupo</option>
                    {availableSubgroups.map((subgroup) => (
                      <option key={subgroup.id} value={subgroup.id}>
                        {subgroup.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500 mt-1">
                    Seleccione um subgrupo dentro de {selectedGroup?.name}
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">
                  Observações <span className="text-slate-500">(opcional)</span>
                </label>
                <textarea
                  value={adoptFormData.observations}
                  onChange={(e) =>
                    setAdoptFormData({ ...adoptFormData, observations: e.target.value })
                  }
                  placeholder="Notas adicionais sobre o equipamento, localização, etc."
                  className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[72px]"
                  disabled={adoptLoading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">
                  Password RustDesk <span className="text-slate-500">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={adoptFormData.rustdesk_password}
                  onChange={(e) =>
                    setAdoptFormData({ ...adoptFormData, rustdesk_password: e.target.value })
                  }
                  placeholder="Se preenchido, o link abre com ?password=..."
                  className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={adoptLoading}
                />
              </div>

              {adoptError && (
                <div className="p-3 bg-red-950/40 border border-red-900 rounded-md">
                  <p className="text-sm text-red-400">{adoptError}</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={adoptLoading}
                  className="flex-1 px-4 py-2 text-sm font-medium rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition text-white"
                >
                  {adoptLoading
                    ? "A processar..."
                    : isEditingDevice
                      ? "Guardar Alterações"
                      : "✓ Adoptar Dispositivo"}
                </button>
                <button
                  type="button"
                  onClick={closeAdoptModal}
                  disabled={adoptLoading}
                  className="flex-1 px-4 py-2 text-sm rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition text-white"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAdminReassignModal && adminDeviceToManage && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">
                Reatribuir Dispositivo
              </h3>
              <button
                onClick={closeAdminReassignModal}
                className="text-slate-400 hover:text-white transition"
                disabled={adminActionLoading}
              >
                ✕
              </button>
            </div>

            <div className="mb-4 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
              <p className="text-xs text-slate-400 mb-1">Device ID:</p>
              <p className="text-sm font-mono text-white">
                {adminDeviceToManage.device_id}
              </p>
            </div>

            <form onSubmit={handleAdminReassignSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">
                  Utilizador de destino (mesh_username) <span className="text-red-400">*</span>
                </label>
                <select
                  value={adminReassignForm.mesh_username}
                  onChange={(e) =>
                    setAdminReassignForm({
                      ...adminReassignForm,
                      mesh_username: e.target.value,
                    })}
                  className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={adminActionLoading || meshUsersLoading}
                  required
                >
                  {meshUsersLoading && (
                    <option value="">A carregar lista de utilizadores...</option>
                  )}
                  {!meshUsersLoading && meshUsers.length === 0 && (
                    <option value="">Nenhum utilizador encontrado em mesh_users</option>
                  )}
                  {!meshUsersLoading && meshUsers.length > 0 && (
                    <>
                      <option value="">Selecione um utilizador...</option>
                      {meshUsers.map((user) => (
                        <option key={user.id} value={user.mesh_username ?? ""}>
                          {user.display_name
                            ? `${user.display_name} (${user.mesh_username ?? "sem username"})`
                            : user.mesh_username ?? user.id}
                        </option>
                      ))}
                    </>
                  )}
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  O utilizador destino deve existir na tabela mesh_users.
                </p>
              </div>

              {adminActionError && (
                <div className="p-3 bg-red-950/40 border border-red-900 rounded-md">
                  <p className="text-sm text-red-400">{adminActionError}</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={adminActionLoading}
                  className="flex-1 px-4 py-2 text-sm font-medium rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition text-white"
                >
                  {adminActionLoading ? "A processar..." : "Reatribuir"}
                </button>
                <button
                  type="button"
                  onClick={closeAdminReassignModal}
                  disabled={adminActionLoading}
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