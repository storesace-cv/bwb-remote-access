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
      console.error("Erro no registo híbrido:", error);
      setHybridSubmitError(error instanceof Error ? error.message : "Erro ao registar");
    } finally {
      setHybridSubmitLoading(false);
    }
  }, [hybridDeviceIdInput, registrationSession]);

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
