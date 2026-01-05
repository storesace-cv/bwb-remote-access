"use client";

/**
 * Dashboard Client Component
 * 
 * This is the original dashboard code adapted to receive auth data as props
 * instead of reading from localStorage. All UI and functionality is preserved.
 */

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import QRCode from "react-qr-code";

import { GroupableDevice, groupDevices } from "@/lib/grouping";
import { logError } from "@/lib/debugLogger";

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

interface DashboardClientProps {
  meshUserId: string | null;
  authUserId: string | null;
  userEmail: string;
  isAgent: boolean;
  isMinisiteadmin: boolean;
  isSiteadmin: boolean;
  userDomain: string;
  userDisplayName: string;
}

const ADOPTED_PAGE_SIZE = 20;

export default function DashboardClient({
  meshUserId,
  authUserId,
  userEmail,
  isAgent: isAgentProp,
  isMinisiteadmin: isMinisiteadminProp,
  isSiteadmin: isSiteadminProp,
  userDomain: userDomainProp,
  userDisplayName: userDisplayNameProp,
}: DashboardClientProps) {
  const router = useRouter();
  
  // Auth state from props
  const isAgent = isAgentProp;
  const isMinisiteadmin = isMinisiteadminProp;
  const isSiteadmin = isSiteadminProp;
  const userDomain = userDomainProp;
  const userDisplayName = userDisplayNameProp;
  const isAdmin = isAgent || isMinisiteadmin || isSiteadmin;

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

  // Canonical groups state
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

  // Fetch devices using internal API (session-based auth)
  const fetchDevices = useCallback(async (): Promise<void> => {
    setLoading(true);
    setErrorMsg(null);
    
    try {
      // Use internal API that uses session auth
      const res = await fetch("/api/mesh/devices");
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `Erro ${res.status} ao carregar dispositivos`);
      }
      
      const data = await res.json();
      const fetchedDevices: GroupableDevice[] = (data.devices || []).map((d: Record<string, unknown>) => ({
        id: String(d.id ?? ""),
        device_id: String(d.device_id ?? ""),
        friendly_name: d.friendly_name as string | null ?? null,
        group_name: d.group_name as string | null ?? null,
        subgroup_name: d.subgroup_name as string | null ?? null,
        notes: d.notes as string | null ?? null,
        last_seen_at: d.last_seen_at as string | null ?? null,
        rustdesk_password: d.rustdesk_password as string | null ?? null,
        owner_email: d.owner_email as string | null ?? null,
        owner: d.owner as string | null ?? null,
        mesh_username: d.mesh_username as string | null ?? null,
        group_id: d.group_id as string | null ?? null,
        subgroup_id: d.subgroup_id as string | null ?? null,
        created_at: d.created_at as string | null ?? null,
        updated_at: d.updated_at as string | null ?? null,
        from_provisioning_code: Boolean(d.from_provisioning_code),
      }));
      
      setDevices(fetchedDevices);
    } catch (error) {
      console.error("Erro ao carregar dispositivos:", error);
      setErrorMsg(error instanceof Error ? error.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load devices on mount
  useEffect(() => {
    void fetchDevices();
  }, [fetchDevices]);

  // Fetch mesh users for admin reassign (siteadmin only)
  const fetchMeshUsers = useCallback(async (): Promise<void> => {
    if (!isSiteadmin || meshUsersLoading || meshUsers.length > 0) return;
    
    setMeshUsersLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        const users: MeshUserOption[] = (data.users || []).map((u: Record<string, unknown>) => ({
          id: String(u.id ?? ""),
          mesh_username: u.meshUsername as string | null ?? null,
          display_name: u.displayName as string | null ?? null,
        }));
        setMeshUsers(users);
      }
    } catch (error) {
      console.error("Erro ao carregar utilizadores mesh:", error);
    } finally {
      setMeshUsersLoading(false);
    }
  }, [isSiteadmin, meshUsersLoading, meshUsers.length]);

  useEffect(() => {
    if (isSiteadmin) {
      void fetchMeshUsers();
    }
  }, [isSiteadmin, fetchMeshUsers]);

  // Logout handler
  const handleLogout = useCallback(() => {
    // Clear any legacy tokens
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem("rustdesk_jwt");
      } catch {
        // Ignore localStorage errors
      }
    }
    router.push("/api/auth/logout");
  }, [router]);

  // Refresh devices
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      await fetchDevices();
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : "Erro ao atualizar");
    } finally {
      setRefreshing(false);
    }
  }, [fetchDevices]);

  // Start registration session
  const startRegistrationSession = useCallback(async () => {
    if (!meshUserId) {
      setQrError("Utilizador não configurado para provisioning");
      return;
    }

    setShowRegistrationModal(true);
    setQrLoading(true);
    setQrError("");
    setQrImageUrl("");
    setRegistrationStatus("awaiting");
    setMatchedDevice(null);
    setHybridDeviceIdInput("");
    setHybridSubmitError(null);
    setHybridSubmitSuccess(null);

    try {
      const res = await fetch("/api/provision/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: authUserId,
          mesh_user_id: meshUserId,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Falha ao iniciar sessão de registo");
      }

      const data = await res.json();
      setRegistrationSession({
        session_id: data.session_id || data.code,
        expires_at: data.expires_at || "",
        expires_in_seconds: data.expires_in_seconds || 300,
      });
      setTimeRemaining(data.expires_in_seconds || 300);

      // Generate QR if available
      if (data.qr_url) {
        setQrImageUrl(data.qr_url);
      } else if (data.config_url) {
        setQrImageUrl(data.config_url);
      }
    } catch (error) {
      console.error("Erro ao iniciar sessão de registo:", error);
      setQrError(error instanceof Error ? error.message : "Erro desconhecido");
    } finally {
      setQrLoading(false);
    }
  }, [meshUserId, authUserId]);

  // Countdown timer
  useEffect(() => {
    if (showRegistrationModal && timeRemaining > 0 && registrationStatus === "awaiting") {
      countdownIntervalRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            setRegistrationStatus("expired");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [showRegistrationModal, timeRemaining, registrationStatus]);

  // Close registration modal
  const closeRegistrationModal = useCallback(() => {
    setShowRegistrationModal(false);
    setRegistrationSession(null);
    setQrImageUrl("");
    setTimeRemaining(0);
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    if (registrationStatus === "completed") {
      void fetchDevices();
    }
  }, [registrationStatus, fetchDevices]);

  // Hybrid submit (manual RustDesk ID entry)
  const handleHybridSubmit = useCallback(async () => {
    if (!hybridDeviceIdInput.trim() || !registrationSession) return;

    setHybridSubmitLoading(true);
    setHybridSubmitError(null);
    setHybridSubmitSuccess(null);

    try {
      const res = await fetch("/api/provision/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: registrationSession.session_id,
          rustdesk_id: hybridDeviceIdInput.trim(),
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Falha ao registar dispositivo");
      }

      const data = await res.json();
      setHybridSubmitSuccess(`Dispositivo ${data.device_id || hybridDeviceIdInput} registado com sucesso!`);
      setMatchedDevice({ device_id: data.device_id || hybridDeviceIdInput });
      setRegistrationStatus("completed");
    } catch (error) {
      logError("dashboard", "Hybrid RustDesk ID submission failed", { error });
      console.error("Erro no registo híbrido:", error);
      setHybridSubmitError(error instanceof Error ? error.message : "Erro ao registar");
    } finally {
      setHybridSubmitLoading(false);
    }
  }, [hybridDeviceIdInput, registrationSession]);

  // Fetch canonical groups for adopt modal
  const fetchCanonicalGroups = useCallback(async () => {
    setGroupsLoading(true);
    try {
      const res = await fetch("/api/groups");
      if (!res.ok) {
        console.error("Failed to fetch canonical groups:", res.status);
        return;
      }
      const data = (await res.json()) as { groups?: CanonicalGroup[] };
      setCanonicalGroups(Array.isArray(data.groups) ? data.groups : []);
    } catch (err) {
      logError("dashboard", "Error fetching canonical groups", { error: err });
      console.error("Error fetching canonical groups:", err);
    } finally {
      setGroupsLoading(false);
    }
  }, []);

  // Load canonical groups on mount
  useEffect(() => {
    void fetchCanonicalGroups();
  }, [fetchCanonicalGroups]);

  // Check registration status periodically while awaiting
  useEffect(() => {
    if (!showRegistrationModal || !registrationSession || registrationStatus !== "awaiting" || checkingDevice) {
      return;
    }

    const checkInterval = setInterval(async () => {
      setCheckingDevice(true);
      try {
        const res = await fetch(`/api/provision/status?session_id=${registrationSession.session_id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === "completed" && data.device_id) {
            setMatchedDevice({ device_id: data.device_id, friendly_name: data.friendly_name });
            setRegistrationStatus("completed");
            setCheckingDevice(false);
          }
        }
      } catch (err) {
        console.error("Error checking registration status:", err);
      } finally {
        setCheckingDevice(false);
      }
    }, 5000);

    return () => clearInterval(checkInterval);
  }, [showRegistrationModal, registrationSession, registrationStatus, checkingDevice]);

  // Filter and sort devices
  const filteredDevices = useMemo(() => {
    let result = [...devices];

    // Apply status filter
    if (filterStatus === "adopted") {
      result = result.filter((d) => d.owner);
    } else if (filterStatus === "unadopted") {
      result = result.filter((d) => !d.owner);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (d) =>
          d.device_id.toLowerCase().includes(query) ||
          (d.friendly_name?.toLowerCase().includes(query) ?? false) ||
          (d.notes?.toLowerCase().includes(query) ?? false)
      );
    }

    // Apply sorting
    result.sort((a, b) => {
      switch (sortBy) {
        case "date_desc":
          return new Date(b.last_seen_at || b.created_at || 0).getTime() - new Date(a.last_seen_at || a.created_at || 0).getTime();
        case "date_asc":
          return new Date(a.last_seen_at || a.created_at || 0).getTime() - new Date(b.last_seen_at || b.created_at || 0).getTime();
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

    return result;
  }, [devices, filterStatus, searchQuery, sortBy]);

  // Separate adopted and unadopted devices
  const adoptedDevices = useMemo(() => filteredDevices.filter((d) => d.owner), [filteredDevices]);
  const unadoptedDevices = useMemo(() => filteredDevices.filter((d) => !d.owner), [filteredDevices]);

  const isDeviceAdopted = (device: GroupableDevice) => Boolean(device.owner);

  // Pagination for adopted devices
  const totalAdopted = adoptedDevices.length;
  const adoptedTotalPages = Math.max(1, Math.ceil(totalAdopted / adoptedPageSize));

  useEffect(() => {
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
    ? canonicalGroups.find((g) => g.id === adoptFormData.group_id)
    : null;
  const availableSubgroups = selectedGroup
    ? canonicalGroups.filter((g) => g.parent_group_id === selectedGroup.id)
    : [];

  // Open adopt modal
  const openAdoptModal = useCallback((device: GroupableDevice) => {
    setAdoptingDevice(device);
    setAdoptFormData({
      friendly_name: device.friendly_name || "",
      group_id: device.group_id || "",
      subgroup_id: device.subgroup_id || undefined,
      rustdesk_password: device.rustdesk_password || "",
      observations: device.notes || "",
    });
    setAdoptError(null);
    setShowAdoptModal(true);
  }, []);

  // Close adopt modal
  const closeAdoptModal = useCallback(() => {
    setShowAdoptModal(false);
    setAdoptingDevice(null);
    setAdoptFormData({
      friendly_name: "",
      group_id: "",
      rustdesk_password: "",
      observations: "",
    });
    setAdoptError(null);
  }, []);

  // Handle adopt form change
  const handleAdoptFormChange = useCallback((field: keyof AdoptFormData, value: string) => {
    setAdoptFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  // Submit adopt
  const handleAdoptSubmit = useCallback(async () => {
    if (!adoptingDevice) return;

    setAdoptLoading(true);
    setAdoptError(null);

    try {
      const res = await fetch(`/api/provision/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_id: adoptingDevice.device_id,
          friendly_name: adoptFormData.friendly_name || null,
          group_id: adoptFormData.group_id || null,
          subgroup_id: adoptFormData.subgroup_id || null,
          rustdesk_password: adoptFormData.rustdesk_password || null,
          notes: adoptFormData.observations || null,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Falha ao adoptar dispositivo");
      }

      closeAdoptModal();
      await fetchDevices();
    } catch (error) {
      console.error("Erro ao adoptar:", error);
      setAdoptError(error instanceof Error ? error.message : "Erro desconhecido");
    } finally {
      setAdoptLoading(false);
    }
  }, [adoptingDevice, adoptFormData, closeAdoptModal, fetchDevices]);

  // Admin reassign modal
  const openAdminReassignModal = useCallback((device: GroupableDevice) => {
    setAdminDeviceToManage(device);
    setAdminReassignForm({ mesh_username: device.mesh_username || "" });
    setAdminActionError(null);
    setShowAdminReassignModal(true);
  }, []);

  const closeAdminReassignModal = useCallback(() => {
    setShowAdminReassignModal(false);
    setAdminDeviceToManage(null);
    setAdminReassignForm({ mesh_username: "" });
    setAdminActionError(null);
  }, []);

  // Handle clipboard paste
  const handlePasteFromClipboard = useCallback(async () => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        return;
      }
      const text = await navigator.clipboard.readText();
      const cleanedText = text.replace(/\s+/g, "").replace(/\D/g, "");
      if (cleanedText) {
        setHybridDeviceIdInput(cleanedText);
      }
    } catch (err) {
      console.warn("Failed to read clipboard:", err);
    }
  }, []);

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
            {isAdmin && (
              <Link
                href="/admin/users"
                className="px-3 py-1.5 text-sm rounded-md bg-slate-700 hover:bg-slate-600 transition text-white"
              >
                Gestão de Utilizadores
              </Link>
            )}
            <Link
              href="/dashboard/profile"
              className="px-3 py-1.5 text-sm rounded-md bg-slate-700 hover:bg-slate-600 transition text-white"
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

        {/* Agent Panel - shown for agent, minisiteadmin, siteadmin */}
        {isAgent && (
          <section className="bg-gradient-to-br from-emerald-900/20 to-slate-900/40 border border-emerald-700/40 rounded-2xl p-6 mb-6 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-emerald-400">
                  🎯 Painel de Gestão (Agent){userDomain && ` | ${userDomain}`}
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Como Agent, podes criar colaboradores e gerir permissões de acesso aos teus dispositivos
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            </div>
          </section>
        )}

        {/* Add Device Panel - shown for everyone */}
        <section className="bg-gradient-to-br from-sky-900/20 to-slate-900/40 border border-sky-700/40 rounded-2xl p-6 mb-6 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-sky-400">📱 Adicionar Dispositivo</h2>
              <p className="text-xs text-slate-400 mt-1">
                Escolhe o método de provisionamento que melhor se adapta ao teu dispositivo
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={startRegistrationSession}
              className="group bg-slate-900/70 border border-slate-700 hover:border-sky-600 rounded-xl p-4 transition-all hover:shadow-lg hover:shadow-sky-900/20 text-left"
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

          {/* APK Download Section */}
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
                armeabi‑v7a (32‑bit)
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
                x86_64 (Android TV)
              </button>
            </div>

            {selectedRustdeskAbi && (
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
            )}
          </div>
        </section>

        {/* Search and Filter Bar */}
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
                  Adoptados ({adoptedDevices.length})
                </button>
                <button
                  onClick={() => setFilterStatus("unadopted")}
                  className={`px-3 py-1.5 text-xs rounded-md transition ${
                    filterStatus === "unadopted"
                      ? "bg-amber-600 text-white"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  Por adoptar ({unadoptedDevices.length})
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Adopted Devices List */}
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
                    setCurrentAdoptedPage(1);
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
                      onClick={() => setCurrentAdoptedPage((prev) => Math.max(1, prev - 1))}
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
                      onClick={() => setCurrentAdoptedPage((prev) => Math.min(adoptedTotalPages, prev + 1))}
                      disabled={currentAdoptedPage === adoptedTotalPages}
                      className="px-2 py-1 rounded-md border border-slate-600 bg-slate-800 hover:bg-slate-700 disabled:opacity-50"
                    >
                      Próxima
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleRefresh}
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
                {loading && <span className="text-xs text-slate-400">A carregar…</span>}
              </div>
            </div>
          </div>

          {errorMsg && <p className="text-sm text-amber-400 mb-3">{errorMsg}</p>}

          {adoptedDevices.length === 0 && !loading && !errorMsg && (
            <div className="text-center py-12">
              <p className="text-slate-400">Sem dispositivos adoptados.</p>
              <p className="text-xs text-slate-500 mt-1">
                Adopta um dispositivo da lista "Por adoptar" ou regista um novo.
              </p>
            </div>
          )}

          {/* Grouped devices */}
          {grouped.groups.length > 0 && (
            <div className="space-y-4 mt-2">
              {grouped.groups.map((groupBucket) => {
                const groupName = groupBucket.name ?? "";
                const groupKey = groupName || "__semgrupo__";
                const isGroupExpanded = expandedGroups[groupKey] ?? true;

                return (
                  <div key={groupKey} className="border border-slate-700 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedGroups((prev) => ({ ...prev, [groupKey]: !isGroupExpanded }))}
                      className="w-full flex items-center justify-between px-4 py-2 bg-slate-800/70 hover:bg-slate-800 text-left"
                    >
                      <span className="font-medium text-sm text-white">{groupName || "Sem grupo"}</span>
                      <span className="text-xs text-slate-400">{isGroupExpanded ? "▼" : "▶"}</span>
                    </button>

                    {isGroupExpanded && (
                      <div className="px-4 py-3 space-y-3">
                        {groupBucket.subgroups.map((subBucket) => {
                          const subgroupName = subBucket.name ?? "";
                          const groupLabel = groupBucket.name ?? "Sem grupo";
                          const subgroupLabel = subgroupName || "Sem subgrupo";
                          const subKey = `${groupKey}::${subgroupName || "__nosub__"}`;
                          const isSubExpanded = expandedSubgroups[subKey] ?? false;

                          return (
                            <div key={subKey} className="flex flex-col gap-1">
                              <div className="text-xs text-slate-500">
                                {groupLabel} / {subgroupLabel}
                              </div>
                              <button
                                type="button"
                                onClick={() => setExpandedSubgroups((prev) => ({ ...prev, [subKey]: !isSubExpanded }))}
                                className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg bg-slate-800/50 hover:bg-slate-800 text-left"
                              >
                                <span className="text-xs text-slate-300">
                                  {subgroupName || "Sem subgrupo"}
                                  <span className="ml-2 text-slate-500">({subBucket.devices.length} dispositivos)</span>
                                </span>
                                <span className="text-xs text-slate-500">{isSubExpanded ? "▼" : "▶"}</span>
                              </button>

                              {isSubExpanded && (
                                <div className="mt-2 grid gap-2 md:grid-cols-2">
                                  {subBucket.devices.map((device) => (
                                    <div
                                      key={device.id}
                                      className="border border-slate-700/30 rounded-lg px-3 py-2 bg-slate-900/50"
                                    >
                                      <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                          <div className="flex items-center gap-2 mb-1">
                                            <span className="font-semibold text-slate-100 text-sm">{device.device_id}</span>
                                            {device.friendly_name && (
                                              <span className="text-xs text-slate-400">({device.friendly_name})</span>
                                            )}
                                          </div>
                                          <p className="text-xs text-slate-500">
                                            Visto: {new Date(device.last_seen_at || device.created_at || "").toLocaleString("pt-PT")}
                                          </p>
                                        </div>
                                        <div className="flex gap-1 ml-2">
                                          <a
                                            href={buildRustdeskUrl(device)}
                                            className="px-2 py-1 text-xs rounded-md bg-emerald-600 hover:bg-emerald-500 transition text-white"
                                          >
                                            🔗 Conectar
                                          </a>
                                          <button
                                            onClick={() => openAdoptModal(device)}
                                            className="px-2 py-1 text-xs rounded-md bg-slate-700 hover:bg-slate-600 transition text-white"
                                          >
                                            ✏️
                                          </button>
                                          {isSiteadmin && (
                                            <button
                                              onClick={() => openAdminReassignModal(device)}
                                              className="px-2 py-1 text-xs rounded-md bg-amber-600/80 hover:bg-amber-500 transition text-white"
                                            >
                                              👤
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
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

        {/* Unadopted Devices Section */}
        {unadoptedDevices.length > 0 && (
          <section className="mt-6 bg-slate-900/70 border border-amber-700/40 rounded-2xl p-6 backdrop-blur-sm">
            <h2 className="text-lg font-medium text-amber-400 mb-4">⏳ Dispositivos por Adoptar</h2>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {unadoptedDevices.map((device) => (
                <div
                  key={device.id}
                  className="border border-slate-700/50 rounded-lg p-3 bg-slate-900/50 hover:border-amber-600/50 transition"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="font-mono text-sm text-slate-200">{device.device_id}</p>
                      {device.friendly_name && (
                        <p className="text-xs text-slate-400 mt-0.5">{device.friendly_name}</p>
                      )}
                      <p className="text-xs text-slate-500 mt-1">
                        Visto: {new Date(device.last_seen_at || device.created_at || "").toLocaleString("pt-PT")}
                      </p>
                    </div>
                    <button
                      onClick={() => openAdoptModal(device)}
                      className="px-3 py-1.5 text-xs rounded-md bg-amber-600 hover:bg-amber-500 transition text-white ml-2"
                    >
                      Adoptar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Registration Modal */}
      {showRegistrationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 w-full max-w-md mx-4 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">📱 Registar Dispositivo</h2>
              <button
                onClick={closeRegistrationModal}
                className="text-slate-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            {registrationStatus === "completed" ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-4">✅</div>
                <h3 className="text-lg font-medium text-emerald-400 mb-2">Dispositivo Registado!</h3>
                <p className="text-sm text-slate-400">
                  {matchedDevice?.device_id || "O dispositivo foi associado com sucesso."}
                </p>
                <button
                  onClick={closeRegistrationModal}
                  className="mt-6 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white transition"
                >
                  Fechar
                </button>
              </div>
            ) : registrationStatus === "expired" ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-4">⏰</div>
                <h3 className="text-lg font-medium text-amber-400 mb-2">Sessão Expirada</h3>
                <p className="text-sm text-slate-400 mb-4">
                  O tempo para registar o dispositivo expirou.
                </p>
                <button
                  onClick={startRegistrationSession}
                  className="px-6 py-2 bg-sky-600 hover:bg-sky-500 rounded-lg text-white transition"
                >
                  Tentar Novamente
                </button>
              </div>
            ) : (
              <>
                {/* QR Code Section */}
                <div className="flex flex-col items-center">
                  {qrLoading ? (
                    <div className="w-48 h-48 flex items-center justify-center bg-slate-800 rounded-lg">
                      <div className="h-8 w-8 rounded-full border-2 border-slate-600 border-t-emerald-500 animate-spin" />
                    </div>
                  ) : qrError && !hybridSubmitSuccess ? (
                    <div className="w-48 h-48 flex items-center justify-center bg-red-950/30 rounded-lg border border-red-800">
                      <p className="text-xs text-red-400 text-center px-4">{qrError}</p>
                    </div>
                  ) : qrImageUrl ? (
                    <div className="bg-white p-3 rounded-lg">
                      <Image
                        src={qrImageUrl}
                        alt="QR Code"
                        width={192}
                        height={192}
                        className="w-48 h-48"
                        unoptimized
                      />
                    </div>
                  ) : (
                    <div className="w-48 h-48 flex items-center justify-center bg-slate-800 rounded-lg">
                      <p className="text-xs text-slate-400 text-center px-4">Use o método manual abaixo</p>
                    </div>
                  )}

                  <div className="mt-4 text-center">
                    <p className="text-sm text-slate-400">Tempo restante:</p>
                    <p className={`text-2xl font-mono font-bold ${timeRemaining < 60 ? "text-amber-400" : "text-emerald-400"}`}>
                      {formatTime(timeRemaining)}
                    </p>
                  </div>

                  <p className="text-xs text-slate-500 text-center mt-4">
                    Abra a app RustDesk no dispositivo e escaneie este QR code para configurar automaticamente.
                  </p>
                </div>

                {/* Hybrid Manual Entry Section */}
                <div className="mt-6 pt-6 border-t border-slate-700">
                  <div className="mb-4">
                    <p className="text-sm text-slate-300 text-center font-medium mb-1">
                      📋 Introduza o RustDesk ID do dispositivo:
                    </p>
                    <p className="text-xs text-slate-500 text-center">
                      O ID aparece no canto superior esquerdo da app RustDesk (ex: 123456789)
                    </p>
                  </div>

                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      value={hybridDeviceIdInput}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, "");
                        setHybridDeviceIdInput(value);
                      }}
                      placeholder="RustDesk ID (ex: 123456789)"
                      maxLength={12}
                      className="flex-1 px-3 py-2.5 text-sm rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={handlePasteFromClipboard}
                      className="px-3 py-2.5 text-xs font-semibold bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-white transition whitespace-nowrap"
                      title="Colar RustDesk ID da área de transferência"
                    >
                      📋 PASTE
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleHybridSubmit}
                    disabled={hybridSubmitLoading || !hybridDeviceIdInput.trim()}
                    className="w-full px-4 py-3 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white transition flex items-center justify-center gap-2"
                  >
                    {hybridSubmitLoading ? (
                      <>
                        <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        A REGISTAR...
                      </>
                    ) : (
                      <>📤 ENVIAR RUSTDESK ID</>
                    )}
                  </button>

                  {hybridSubmitError && (
                    <div className="mt-3 p-2 bg-red-950/40 border border-red-800 rounded-lg">
                      <p className="text-xs text-red-400 text-center">{hybridSubmitError}</p>
                    </div>
                  )}
                  {hybridSubmitSuccess && (
                    <div className="mt-3 p-2 bg-emerald-950/40 border border-emerald-800 rounded-lg">
                      <p className="text-xs text-emerald-400 text-center">{hybridSubmitSuccess}</p>
                    </div>
                  )}

                  {hybridDeviceIdInput && (
                    <p className="text-xs text-slate-500 text-center mt-2">
                      {hybridDeviceIdInput.length < 6 ? (
                        <span className="text-amber-400">⚠️ O ID deve ter pelo menos 6 dígitos</span>
                      ) : hybridDeviceIdInput.length > 12 ? (
                        <span className="text-amber-400">⚠️ O ID deve ter no máximo 12 dígitos</span>
                      ) : (
                        <span className="text-emerald-400">✓ Formato válido ({hybridDeviceIdInput.length} dígitos)</span>
                      )}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Adopt/Edit Modal */}
      {showAdoptModal && adoptingDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 w-full max-w-md mx-4 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">
                {isEditingDevice ? "✏️ Editar Dispositivo" : "📱 Adoptar Dispositivo"}
              </h2>
              <button onClick={closeAdoptModal} className="text-slate-400 hover:text-white transition">
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">RustDesk ID</label>
                <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-white font-mono">
                  {adoptingDevice.device_id}
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Nome amigável</label>
                <input
                  type="text"
                  value={adoptFormData.friendly_name}
                  onChange={(e) => handleAdoptFormChange("friendly_name", e.target.value)}
                  placeholder="Ex: Tablet Loja 1"
                  className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Password RustDesk (opcional)</label>
                <input
                  type="text"
                  value={adoptFormData.rustdesk_password}
                  onChange={(e) => handleAdoptFormChange("rustdesk_password", e.target.value)}
                  placeholder="Password para conexão automática"
                  className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Observações</label>
                <textarea
                  value={adoptFormData.observations}
                  onChange={(e) => handleAdoptFormChange("observations", e.target.value)}
                  placeholder="Notas adicionais..."
                  rows={3}
                  className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                />
              </div>

              {adoptError && (
                <div className="p-2 bg-red-950/40 border border-red-800 rounded-lg">
                  <p className="text-xs text-red-400">{adoptError}</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={closeAdoptModal}
                  className="flex-1 px-4 py-2 text-sm rounded-md bg-slate-700 hover:bg-slate-600 text-white transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAdoptSubmit}
                  disabled={adoptLoading}
                  className="flex-1 px-4 py-2 text-sm rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition flex items-center justify-center gap-2"
                >
                  {adoptLoading ? (
                    <>
                      <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      A guardar...
                    </>
                  ) : (
                    <>{isEditingDevice ? "Guardar" : "Adoptar"}</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Admin Reassign Modal */}
      {showAdminReassignModal && adminDeviceToManage && isSiteadmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 w-full max-w-md mx-4 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">👤 Reatribuir Dispositivo</h2>
              <button onClick={closeAdminReassignModal} className="text-slate-400 hover:text-white transition">
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Dispositivo</label>
                <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-white font-mono">
                  {adminDeviceToManage.device_id}
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Proprietário actual</label>
                <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-slate-300">
                  {adminDeviceToManage.mesh_username || "Nenhum"}
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Novo proprietário</label>
                <select
                  value={adminReassignForm.mesh_username}
                  onChange={(e) => setAdminReassignForm({ mesh_username: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">Selecione um utilizador...</option>
                  {meshUsers.map((u) => (
                    <option key={u.id} value={u.mesh_username || ""}>
                      {u.display_name || u.mesh_username || u.id}
                    </option>
                  ))}
                </select>
              </div>

              {adminActionError && (
                <div className="p-2 bg-red-950/40 border border-red-800 rounded-lg">
                  <p className="text-xs text-red-400">{adminActionError}</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={closeAdminReassignModal}
                  className="flex-1 px-4 py-2 text-sm rounded-md bg-slate-700 hover:bg-slate-600 text-white transition"
                >
                  Cancelar
                </button>
                <button
                  disabled={adminActionLoading || !adminReassignForm.mesh_username}
                  className="flex-1 px-4 py-2 text-sm rounded-md bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white transition"
                >
                  Reatribuir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
