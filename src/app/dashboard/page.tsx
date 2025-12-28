"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import QRCode from "react-qr-code";

import { useDevices, useDeviceRegistration, useMeshUsers } from "@/hooks";
import {
  FiltersBar,
  RegistrationModal,
  DeviceList,
  UnadoptedDevicesList,
  AdminUnassignedDevicesList,
  AdoptModal,
  AdminReassignModal,
} from "@/components/dashboard";
import { getStoredToken, decodeJwtSubject, clearToken, callEdgeFunction } from "@/lib/apiClient";
import type { GroupableDevice } from "@/lib/grouping";
import type { DeviceGroupDTO } from "@/types/DeviceDTO";
import type { MeshUserDTO } from "@/types/MeshUserDTO";

interface AdoptFormData {
  friendly_name: string;
  group_id: string;
  subgroup_id?: string;
  rustdesk_password: string;
  observations: string;
}

const RUSTDESK_APK_URLS = {
  arm64: "https://rustdesk.bwb.pt/apk/rustdesk/latest?abi=arm64-v8a",
  armeabi: "https://rustdesk.bwb.pt/apk/rustdesk/latest?abi=armeabi-v7a",
  x86_64: "https://rustdesk.bwb.pt/apk/rustdesk/latest?abi=x86_64",
};

export default function DashboardPage() {
  const router = useRouter();

  // Auth state
  const [jwt, setJwt] = useState<string | null>(null);

  // Initialize from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = getStoredToken();
    if (!stored) {
      router.replace("/");
      return;
    }
    setJwt(stored);
  }, [router]);

  // Hooks
  const {
    authUserId,
    isAdmin,
    isAgent,
    isMinisiteadmin,
    isSiteadmin,
    userDomain,
    userDisplayName,
    meshUsers,
    meshUsersLoading,
    loadMeshUsers,
    checkUserType,
    reassignDevice,
  } = useMeshUsers();

  const {
    devices,
    groups,
    loading,
    groupsLoading,
    refreshing,
    errorMsg,
    refreshError,
    fetchDevices,
    fetchGroups,
    refreshStatus,
    deleteDevice,
    adminDeleteDevice,
    filterStatus,
    setFilterStatus,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    filteredDevices,
    adoptedDevices,
    unadoptedDevices,
  } = useDevices();

  const registration = useDeviceRegistration(() => {
    void fetchDevices();
  });

  // Adopt modal state
  const [showAdoptModal, setShowAdoptModal] = useState(false);
  const [adoptingDevice, setAdoptingDevice] = useState<GroupableDevice | null>(null);
  const [adoptFormData, setAdoptFormData] = useState<AdoptFormData>({
    friendly_name: "",
    group_id: "",
    subgroup_id: undefined,
    rustdesk_password: "",
    observations: "",
  });
  const [adoptLoading, setAdoptLoading] = useState(false);
  const [adoptError, setAdoptError] = useState<string | null>(null);

  // Admin reassign modal state
  const [showAdminReassignModal, setShowAdminReassignModal] = useState(false);
  const [adminDeviceToManage, setAdminDeviceToManage] = useState<GroupableDevice | null>(null);
  const [adminReassignUsername, setAdminReassignUsername] = useState("");
  const [adminActionLoading, setAdminActionLoading] = useState(false);
  const [adminActionError, setAdminActionError] = useState<string | null>(null);

  // APK download selection
  const [selectedRustdeskAbi, setSelectedRustdeskAbi] = useState<"arm64" | "armeabi" | "x86_64" | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Load data when JWT is available
  useEffect(() => {
    if (!jwt) return;
    void fetchDevices();
    void fetchGroups();
    void checkUserType();
    if (isAdmin) void loadMeshUsers();
  }, [jwt, fetchDevices, fetchGroups, checkUserType, isAdmin, loadMeshUsers]);

  // Handlers
  const handleLogout = useCallback(() => {
    clearToken();
    router.push("/");
  }, [router]);

  const isDeviceAdopted = useCallback((device: GroupableDevice): boolean => {
    return device.owner !== null && device.notes !== null && device.notes.trim().length > 0;
  }, []);

  const openAdoptModal = useCallback((device: GroupableDevice) => {
    setAdoptingDevice(device);
    setAdoptFormData({
      friendly_name: device.friendly_name || "",
      group_id: device.group_id || "",
      subgroup_id: device.subgroup_id || undefined,
      rustdesk_password: device.rustdesk_password || "",
      observations: "",
    });
    setAdoptError(null);
    setShowAdoptModal(true);
  }, []);

  const closeAdoptModal = useCallback(() => {
    setShowAdoptModal(false);
    setAdoptingDevice(null);
    setAdoptError(null);
  }, []);

  const handleAdoptSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jwt || !adoptingDevice || !adoptFormData.group_id.trim()) {
      setAdoptError("Grupo é obrigatório");
      return;
    }

    setAdoptLoading(true);
    setAdoptError(null);

    const result = await callEdgeFunction("register-device", {
      method: "POST",
      body: {
        device_id: adoptingDevice.device_id,
        friendly_name: adoptFormData.friendly_name.trim() || null,
        group_id: adoptFormData.group_id,
        subgroup_id: adoptFormData.subgroup_id?.trim() || null,
        observations: adoptFormData.observations.trim() || null,
        rustdesk_password: adoptFormData.rustdesk_password.trim() || null,
      },
    });

    setAdoptLoading(false);

    if (!result.ok) {
      setAdoptError(result.error?.message || "Erro ao guardar dispositivo");
      return;
    }

    await fetchDevices();
    closeAdoptModal();
  }, [jwt, adoptingDevice, adoptFormData, fetchDevices, closeAdoptModal]);

  const openAdminReassignModal = useCallback((device: GroupableDevice) => {
    setAdminDeviceToManage(device);
    setAdminReassignUsername("");
    setAdminActionError(null);
    setShowAdminReassignModal(true);
  }, []);

  const closeAdminReassignModal = useCallback(() => {
    setShowAdminReassignModal(false);
    setAdminDeviceToManage(null);
    setAdminReassignUsername("");
    setAdminActionError(null);
  }, []);

  const handleAdminReassignSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminDeviceToManage || !adminReassignUsername.trim()) return;

    setAdminActionLoading(true);
    setAdminActionError(null);

    const result = await reassignDevice(adminDeviceToManage.device_id, adminReassignUsername.trim());

    setAdminActionLoading(false);

    if (!result.success) {
      setAdminActionError(result.error || "Erro ao reatribuir dispositivo");
      return;
    }

    await fetchDevices();
    closeAdminReassignModal();
  }, [adminDeviceToManage, adminReassignUsername, reassignDevice, fetchDevices, closeAdminReassignModal]);

  const handleAdminDeleteDevice = useCallback(async (device: GroupableDevice) => {
    setAdminActionLoading(true);
    setAdminActionError(null);
    const success = await adminDeleteDevice(device);
    setAdminActionLoading(false);
    if (!success) {
      setAdminActionError("Erro ao apagar dispositivo");
    }
  }, [adminDeleteDevice]);

  // Computed values
  const adminUnassignedDevices = isAdmin ? unadoptedDevices : [];
  const isEditingDevice = adoptingDevice ? isDeviceAdopted(adoptingDevice) : false;
  const canonicalGroupDTOs: DeviceGroupDTO[] = groups;
  const meshUserDTOs: MeshUserDTO[] = meshUsers.map(u => ({
    id: u.id,
    meshUsername: u.meshUsername,
    displayName: u.displayName,
    email: null,
    userType: null,
    domain: null,
    authUserId: null,
  }));

  return (
    <main className="min-h-screen flex flex-col bg-slate-950">
      <div className="w-full max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-white">BWB | Suporte Android</h1>
            <div className="flex flex-col">
              <p className="text-sm text-slate-400">© jorge peixinho - Business with Brains</p>
              {userDisplayName && <p className="text-xs text-slate-500">{userDisplayName}</p>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <Link href="/dashboard/users" className="px-3 py-1.5 text-sm rounded-md bg-slate-700 hover:bg-slate-600 transition text-white">
                Gestão de Utilizadores
              </Link>
            )}
            <Link href="/dashboard/profile" className="px-3 py-1.5 text-sm rounded-md bg-slate-700 hover:bg-slate-600 transition text-white">
              Perfil
            </Link>
            <button onClick={handleLogout} className="px-3 py-1.5 text-sm rounded-md bg-red-600 hover:bg-red-500 transition text-white">
              Sair
            </button>
          </div>
        </header>

        {refreshError && (
          <div className="mb-4 p-3 bg-amber-950/40 border border-amber-900 rounded-md">
            <p className="text-sm text-amber-400">⚠️ {refreshError}</p>
          </div>
        )}

        {/* Agent Panel */}
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
              <Link href="/dashboard/collaborators" className="group bg-slate-900/70 border border-slate-700 hover:border-emerald-600 rounded-xl p-4 transition-all">
                <div className="w-10 h-10 rounded-lg bg-emerald-600/20 flex items-center justify-center text-xl mb-3">👥</div>
                <h3 className="font-medium text-white mb-1">Colaboradores</h3>
                <p className="text-xs text-slate-400">Criar e gerir colaboradores</p>
              </Link>
              <Link href="/dashboard/groups" className="group bg-slate-900/70 border border-slate-700 hover:border-emerald-600 rounded-xl p-4 transition-all">
                <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center text-xl mb-3">📦</div>
                <h3 className="font-medium text-white mb-1">Grupos e Permissões</h3>
                <p className="text-xs text-slate-400">Organizar dispositivos e permissões</p>
              </Link>
            </div>
          </section>
        )}

        {/* Add Device Section (non-admin) */}
        {!isAdmin && (
          <section className="bg-gradient-to-br from-sky-900/20 to-slate-900/40 border border-sky-700/40 rounded-2xl p-6 mb-6 backdrop-blur-sm">
            <h2 className="text-lg font-semibold text-sky-400 mb-4">📱 Adicionar Dispositivo</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button type="button" onClick={registration.startRegistration} className="group bg-slate-900/70 border border-slate-700 hover:border-sky-600 rounded-xl p-4 text-left">
                <div className="w-10 h-10 rounded-lg bg-sky-600/20 flex items-center justify-center text-xl mb-3">📷</div>
                <h3 className="font-medium text-white mb-1">Escanear QR Code</h3>
                <p className="text-xs text-slate-400">Para dispositivos com câmara</p>
              </button>
              <Link href="/provisioning" className="group bg-slate-900/70 border border-slate-700 hover:border-sky-600 rounded-xl p-4">
                <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center text-xl mb-3">🔢</div>
                <h3 className="font-medium text-white mb-1">Provisionamento sem QR</h3>
                <p className="text-xs text-slate-400">Para Android TV e boxes</p>
              </Link>
            </div>

            {/* APK Download Section */}
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap gap-2 justify-center">
                {(["arm64", "armeabi", "x86_64"] as const).map((abi) => (
                  <button key={abi} type="button" onClick={() => setSelectedRustdeskAbi(abi)}
                    className={`px-3 py-2 text-xs rounded-md border transition ${selectedRustdeskAbi === abi ? "bg-emerald-600 border-emerald-500 text-white" : "bg-slate-800 border-slate-600 text-slate-100 hover:bg-slate-700"}`}>
                    {abi === "arm64" ? "arm64‑v8a (recomendado)" : abi === "armeabi" ? "armeabi‑v7a (32‑bit)" : "x86_64 (Android TV)"}
                  </button>
                ))}
              </div>
              {selectedRustdeskAbi && (
                <div className="flex flex-col items-center space-y-2">
                  <div className="bg-white p-3 rounded-md"><QRCode value={RUSTDESK_APK_URLS[selectedRustdeskAbi]} size={128} /></div>
                  <p className="text-xs text-slate-400 text-center">Aponta a câmara para descarregar o APK</p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Filters */}
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
          adoptedCount={adoptedDevices.length}
          unadoptedCount={unadoptedDevices.length}
          isAdmin={isAdmin}
        />

        {/* Unadopted Devices (non-admin) */}
        {!isAdmin && <UnadoptedDevicesList devices={unadoptedDevices} onAdopt={openAdoptModal} />}

        {/* Admin Unassigned Devices */}
        {isAdmin && (
          <AdminUnassignedDevicesList
            devices={adminUnassignedDevices}
            meshUsers={meshUserDTOs}
            meshUsersLoading={meshUsersLoading}
            adminActionLoading={adminActionLoading}
            adminActionError={adminActionError}
            onReassign={openAdminReassignModal}
            onDelete={handleAdminDeleteDevice}
          />
        )}

        {/* Adopted Devices */}
        {(!isAdmin || adoptedDevices.length > 0) && (
          <DeviceList
            devices={adoptedDevices}
            loading={loading}
            errorMsg={errorMsg}
            refreshing={refreshing}
            onRefresh={refreshStatus}
            onEdit={openAdoptModal}
            onDelete={deleteDevice}
          />
        )}

        {/* Modals */}
        <RegistrationModal
          showModal={registration.showModal}
          qrLoading={registration.qrLoading}
          qrError={registration.qrError}
          qrImageUrl={registration.qrImageUrl}
          timeRemaining={registration.timeRemaining}
          status={registration.status}
          matchedDevice={registration.matchedDevice}
          hybridDeviceIdInput={registration.hybridDeviceIdInput}
          hybridSubmitLoading={registration.hybridSubmitLoading}
          hybridSubmitError={registration.hybridSubmitError}
          hybridSubmitSuccess={registration.hybridSubmitSuccess}
          onClose={registration.closeModal}
          onRestart={registration.restartRegistration}
          onHybridInputChange={registration.setHybridDeviceIdInput}
          onHybridSubmit={registration.submitHybridDeviceId}
        />

        <AdoptModal
          showModal={showAdoptModal}
          device={adoptingDevice}
          formData={adoptFormData}
          groups={canonicalGroupDTOs}
          groupsLoading={groupsLoading}
          adoptLoading={adoptLoading}
          adoptError={adoptError}
          isEditing={isEditingDevice}
          onFormChange={(data) => setAdoptFormData((prev) => ({ ...prev, ...data }))}
          onSubmit={handleAdoptSubmit}
          onClose={closeAdoptModal}
        />

        <AdminReassignModal
          showModal={showAdminReassignModal}
          device={adminDeviceToManage}
          meshUsername={adminReassignUsername}
          meshUsers={meshUserDTOs}
          meshUsersLoading={meshUsersLoading}
          actionLoading={adminActionLoading}
          actionError={adminActionError}
          onMeshUsernameChange={setAdminReassignUsername}
          onSubmit={handleAdminReassignSubmit}
          onClose={closeAdminReassignModal}
        />
      </div>
    </main>
  );
}
