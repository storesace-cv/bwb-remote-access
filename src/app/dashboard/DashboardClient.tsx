"use client";

/**
 * Dashboard Client Component
 * 
 * Main dashboard with:
 * - Painel de Gestão (for siteadmin/minisiteadmin/agent)
 * - Adicionar Dispositivo (for all users)
 * - Dispositivos Adoptados (device list)
 */

import { useCallback, useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { AgentPanel } from "@/components/dashboard/AgentPanel";
import { AddDevicePanel } from "@/components/dashboard/AddDevicePanel";
import { DeviceList } from "@/components/dashboard/DeviceList";
import { FiltersBar } from "@/components/dashboard/FiltersBar";
import { RegistrationModal } from "@/components/dashboard/RegistrationModal";

import type { GroupableDevice } from "@/lib/grouping";
import type { FilterStatus, SortOption } from "@/types/DeviceDTO";

interface DashboardClientProps {
  userEmail: string;
  userDisplayName: string;
  userDomain: string | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isAgent: boolean;
  isDomainAdmin: boolean;
  roleLabel: string | null;
  userType: string;
}

interface RegistrationSession {
  session_id: string;
  expires_at: string;
  expires_in_seconds: number;
}

export default function DashboardClient({
  userEmail,
  userDisplayName,
  userDomain,
  isAdmin,
  isSuperAdmin,
  isAgent,
  isDomainAdmin,
  roleLabel,
  userType,
}: DashboardClientProps) {
  const router = useRouter();
  
  // Device state
  const [devices, setDevices] = useState<GroupableDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  
  // Filter state
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("date_desc");
  const [showFilters, setShowFilters] = useState(false);
  
  // Registration modal state
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [registrationSession, setRegistrationSession] = useState<RegistrationSession | null>(null);
  const [qrImageUrl, setQrImageUrl] = useState<string>("");
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string>("");
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [registrationStatus, setRegistrationStatus] = useState<"awaiting" | "completed" | "expired">("awaiting");
  const [matchedDevice, setMatchedDevice] = useState<{ device_id: string; friendly_name?: string } | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Hybrid registration
  const [hybridDeviceIdInput, setHybridDeviceIdInput] = useState<string>("");
  const [hybridSubmitLoading, setHybridSubmitLoading] = useState<boolean>(false);
  const [hybridSubmitError, setHybridSubmitError] = useState<string | null>(null);
  const [hybridSubmitSuccess, setHybridSubmitSuccess] = useState<string | null>(null);

  // Show agent panel for agent, minisiteadmin, or siteadmin
  const showAgentPanel = isAgent || isDomainAdmin;
  
  // Show add device panel for everyone
  const showAddDevice = true;

  const handleLogout = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("rustdesk_jwt");
    }
    router.push("/api/auth/logout");
  }, [router]);

  // Fetch devices
  const fetchDevices = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const response = await fetch("/api/devices/refresh");
      if (!response.ok) {
        throw new Error("Falha ao carregar dispositivos");
      }
      const data = await response.json();
      setDevices(data.devices || []);
    } catch (err) {
      console.error("Error fetching devices:", err);
      setErrorMsg(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh devices
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const response = await fetch("/api/devices/refresh", { method: "POST" });
      if (!response.ok) {
        throw new Error("Falha ao atualizar dispositivos");
      }
      const data = await response.json();
      setDevices(data.devices || []);
    } catch (err) {
      console.error("Error refreshing devices:", err);
      setRefreshError(err instanceof Error ? err.message : "Erro ao atualizar");
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  // Filter and sort devices
  const filteredDevices = devices
    .filter((device) => {
      // Status filter
      if (filterStatus === "adopted" && !device.owner) return false;
      if (filterStatus === "unadopted" && device.owner) return false;
      
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          device.device_id.toLowerCase().includes(query) ||
          (device.friendly_name?.toLowerCase().includes(query) ?? false) ||
          (device.notes?.toLowerCase().includes(query) ?? false)
        );
      }
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "date_desc":
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        case "date_asc":
          return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
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

  const adoptedCount = devices.filter((d) => d.owner).length;
  const unadoptedCount = devices.filter((d) => !d.owner).length;

  // Registration session management
  const startRegistrationSession = useCallback(async () => {
    setShowRegistrationModal(true);
    setQrLoading(true);
    setQrError("");
    setRegistrationStatus("awaiting");
    setMatchedDevice(null);
    setHybridDeviceIdInput("");
    setHybridSubmitError(null);
    setHybridSubmitSuccess(null);

    try {
      const response = await fetch("/api/provision/start", { method: "POST" });
      if (!response.ok) {
        throw new Error("Falha ao iniciar sessão de registo");
      }
      const data = await response.json();
      setRegistrationSession(data);
      setTimeRemaining(data.expires_in_seconds || 300);
      
      // Generate QR code URL
      const qrResponse = await fetch(`/api/provision/bundle?session_id=${data.session_id}`);
      if (qrResponse.ok) {
        const qrData = await qrResponse.json();
        setQrImageUrl(qrData.qr_url || "");
      }
    } catch (err) {
      console.error("Error starting registration:", err);
      setQrError(err instanceof Error ? err.message : "Erro ao iniciar registo");
    } finally {
      setQrLoading(false);
    }
  }, []);

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

  const handleCloseModal = useCallback(() => {
    setShowRegistrationModal(false);
    setRegistrationSession(null);
    setQrImageUrl("");
    setTimeRemaining(0);
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    // Refresh devices if registration was successful
    if (registrationStatus === "completed") {
      fetchDevices();
    }
  }, [registrationStatus, fetchDevices]);

  const handleRestartRegistration = useCallback(() => {
    startRegistrationSession();
  }, [startRegistrationSession]);

  // Hybrid submission
  const handleHybridSubmit = useCallback(async () => {
    if (!hybridDeviceIdInput.trim() || !registrationSession) return;
    
    setHybridSubmitLoading(true);
    setHybridSubmitError(null);
    setHybridSubmitSuccess(null);
    
    try {
      const response = await fetch("/api/provision/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: registrationSession.session_id,
          rustdesk_id: hybridDeviceIdInput.trim(),
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Falha ao registar dispositivo");
      }
      
      const data = await response.json();
      setHybridSubmitSuccess(`Dispositivo ${data.device_id || hybridDeviceIdInput} registado com sucesso!`);
      setMatchedDevice({ device_id: data.device_id || hybridDeviceIdInput });
      setRegistrationStatus("completed");
    } catch (err) {
      console.error("Error in hybrid submit:", err);
      setHybridSubmitError(err instanceof Error ? err.message : "Erro ao registar");
    } finally {
      setHybridSubmitLoading(false);
    }
  }, [hybridDeviceIdInput, registrationSession]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <DashboardHeader
          userDisplayName={userDisplayName}
          isAdmin={isAdmin}
          onLogout={handleLogout}
        />

        {/* Refresh Error */}
        {refreshError && (
          <div className="mb-4 p-3 bg-amber-950/40 border border-amber-900 rounded-md">
            <p className="text-sm text-amber-400">⚠️ {refreshError}</p>
          </div>
        )}

        {/* Agent Panel - shown for siteadmin, minisiteadmin, agent */}
        {showAgentPanel && (
          <AgentPanel userDomain={userDomain || ""} />
        )}

        {/* Add Device Panel - shown for everyone */}
        {showAddDevice && (
          <AddDevicePanel onStartRegistration={startRegistrationSession} />
        )}

        {/* Filters Bar */}
        <FiltersBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          sortBy={sortBy}
          onSortChange={setSortBy}
          filterStatus={filterStatus}
          onFilterChange={setFilterStatus}
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters(!showFilters)}
          deviceCount={devices.length}
          adoptedCount={adoptedCount}
          unadoptedCount={unadoptedCount}
          isAdmin={isAdmin}
        />

        {/* Device List */}
        <DeviceList
          devices={filteredDevices}
          loading={loading}
          errorMsg={errorMsg}
          refreshing={refreshing}
          onRefresh={handleRefresh}
        />

        {/* Registration Modal */}
        <RegistrationModal
          showModal={showRegistrationModal}
          qrLoading={qrLoading}
          qrError={qrError}
          qrImageUrl={qrImageUrl}
          timeRemaining={timeRemaining}
          status={registrationStatus}
          matchedDevice={matchedDevice}
          hybridDeviceIdInput={hybridDeviceIdInput}
          hybridSubmitLoading={hybridSubmitLoading}
          hybridSubmitError={hybridSubmitError}
          hybridSubmitSuccess={hybridSubmitSuccess}
          onClose={handleCloseModal}
          onRestart={handleRestartRegistration}
          onHybridInputChange={setHybridDeviceIdInput}
          onHybridSubmit={handleHybridSubmit}
        />
      </div>
    </main>
  );
}
