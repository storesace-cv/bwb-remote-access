"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

import { useDevices, useDeviceRegistration, useMeshUsers } from "@/hooks";
import {
  FiltersBar,
  RegistrationModal,
  DeviceList,
  UnadoptedDevicesList,
  AdminUnassignedDevicesList,
  AdoptModal,
  AdminReassignModal,
  DashboardHeader,
  AgentPanel,
  AddDevicePanel,
} from "@/components/dashboard";
import { getStoredToken, clearToken, callEdgeFunction } from "@/lib/apiClient";
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

export default function DashboardPage() {
  const router = useRouter();
  const [jwt, setJwt] = useState<string | null>(null);

  // Initialize from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = getStoredToken();
    if (!stored) { router.replace("/"); return; }
    setJwt(stored);
  }, [router]);

  // Hooks
  const { isAdmin, isAgent, userDomain, userDisplayName, meshUsers, meshUsersLoading, loadMeshUsers, checkUserType, reassignDevice } = useMeshUsers();
  const { devices, groups, loading, groupsLoading, refreshing, errorMsg, refreshError, fetchDevices, fetchGroups, refreshStatus, deleteDevice, adminDeleteDevice, filterStatus, setFilterStatus, searchQuery, setSearchQuery, sortBy, setSortBy, adoptedDevices, unadoptedDevices } = useDevices();
  const registration = useDeviceRegistration(() => { void fetchDevices(); });

  // Adopt modal state
  const [showAdoptModal, setShowAdoptModal] = useState(false);
  const [adoptingDevice, setAdoptingDevice] = useState<GroupableDevice | null>(null);
  const [adoptFormData, setAdoptFormData] = useState<AdoptFormData>({ friendly_name: "", group_id: "", subgroup_id: undefined, rustdesk_password: "", observations: "" });
  const [adoptLoading, setAdoptLoading] = useState(false);
  const [adoptError, setAdoptError] = useState<string | null>(null);

  // Admin reassign modal state
  const [showAdminReassignModal, setShowAdminReassignModal] = useState(false);
  const [adminDeviceToManage, setAdminDeviceToManage] = useState<GroupableDevice | null>(null);
  const [adminReassignUsername, setAdminReassignUsername] = useState("");
  const [adminActionLoading, setAdminActionLoading] = useState(false);
  const [adminActionError, setAdminActionError] = useState<string | null>(null);
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
  const handleLogout = useCallback(() => { clearToken(); router.push("/"); }, [router]);

  /**
   * A device is "adopted" when it has both an owner AND a group assigned.
   * Newly registered devices (QR/hybrid) have owner but no group yet.
   */
  const isDeviceAdopted = useCallback((device: GroupableDevice): boolean => {
    return device.owner !== null && device.group_id !== null;
  }, []);

  const openAdoptModal = useCallback((device: GroupableDevice) => {
    setAdoptingDevice(device);
    setAdoptFormData({ friendly_name: device.friendly_name || "", group_id: device.group_id || "", subgroup_id: device.subgroup_id || undefined, rustdesk_password: device.rustdesk_password || "", observations: "" });
    setAdoptError(null);
    setShowAdoptModal(true);
  }, []);

  const closeAdoptModal = useCallback(() => { setShowAdoptModal(false); setAdoptingDevice(null); setAdoptError(null); }, []);

  const handleAdoptSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jwt || !adoptingDevice || !adoptFormData.group_id.trim()) { setAdoptError("Grupo é obrigatório"); return; }
    setAdoptLoading(true); setAdoptError(null);
    const result = await callEdgeFunction("register-device", {
      method: "POST",
      body: { device_id: adoptingDevice.device_id, friendly_name: adoptFormData.friendly_name.trim() || null, group_id: adoptFormData.group_id, subgroup_id: adoptFormData.subgroup_id?.trim() || null, observations: adoptFormData.observations.trim() || null, rustdesk_password: adoptFormData.rustdesk_password.trim() || null },
    });
    setAdoptLoading(false);
    if (!result.ok) { setAdoptError(result.error?.message || "Erro ao guardar dispositivo"); return; }
    await fetchDevices(); closeAdoptModal();
  }, [jwt, adoptingDevice, adoptFormData, fetchDevices, closeAdoptModal]);

  const openAdminReassignModal = useCallback((device: GroupableDevice) => {
    setAdminDeviceToManage(device); setAdminReassignUsername(""); setAdminActionError(null); setShowAdminReassignModal(true);
  }, []);

  const closeAdminReassignModal = useCallback(() => {
    setShowAdminReassignModal(false); setAdminDeviceToManage(null); setAdminReassignUsername(""); setAdminActionError(null);
  }, []);

  const handleAdminReassignSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminDeviceToManage || !adminReassignUsername.trim()) return;
    setAdminActionLoading(true); setAdminActionError(null);
    const result = await reassignDevice(adminDeviceToManage.device_id, adminReassignUsername.trim());
    setAdminActionLoading(false);
    if (!result.success) { setAdminActionError(result.error || "Erro ao reatribuir dispositivo"); return; }
    await fetchDevices(); closeAdminReassignModal();
  }, [adminDeviceToManage, adminReassignUsername, reassignDevice, fetchDevices, closeAdminReassignModal]);

  const handleAdminDeleteDevice = useCallback(async (device: GroupableDevice) => {
    setAdminActionLoading(true); setAdminActionError(null);
    const success = await adminDeleteDevice(device);
    setAdminActionLoading(false);
    if (!success) { setAdminActionError("Erro ao apagar dispositivo"); }
  }, [adminDeleteDevice]);

  // Computed
  const adminUnassignedDevices = isAdmin ? unadoptedDevices : [];
  const isEditingDevice = adoptingDevice ? isDeviceAdopted(adoptingDevice) : false;
  const canonicalGroupDTOs: DeviceGroupDTO[] = groups;
  const meshUserDTOs: MeshUserDTO[] = meshUsers.map(u => ({ id: u.id, meshUsername: u.meshUsername, displayName: u.displayName, email: null, userType: null, domain: null, authUserId: null }));

  return (
    <main className="min-h-screen flex flex-col bg-slate-950">
      <div className="w-full max-w-5xl mx-auto px-4 py-8">
        <DashboardHeader userDisplayName={userDisplayName} isAdmin={isAdmin} onLogout={handleLogout} />

        {refreshError && (
          <div className="mb-4 p-3 bg-amber-950/40 border border-amber-900 rounded-md">
            <p className="text-sm text-amber-400">⚠️ {refreshError}</p>
          </div>
        )}

        {isAgent && <AgentPanel userDomain={userDomain} />}
        {!isAdmin && <AddDevicePanel onStartRegistration={registration.startRegistration} />}

        <FiltersBar searchQuery={searchQuery} onSearchChange={setSearchQuery} sortBy={sortBy} onSortChange={setSortBy} filterStatus={filterStatus} onFilterChange={setFilterStatus} showFilters={showFilters} onToggleFilters={() => setShowFilters(!showFilters)} deviceCount={devices.length} adoptedCount={adoptedDevices.length} unadoptedCount={unadoptedDevices.length} isAdmin={isAdmin} />

        {!isAdmin && <UnadoptedDevicesList devices={unadoptedDevices} onAdopt={openAdoptModal} />}

        {isAdmin && <AdminUnassignedDevicesList devices={adminUnassignedDevices} adminActionLoading={adminActionLoading} adminActionError={adminActionError} onReassign={openAdminReassignModal} onDelete={handleAdminDeleteDevice} />}

        {(!isAdmin || adoptedDevices.length > 0) && (
          <DeviceList devices={adoptedDevices} loading={loading} errorMsg={errorMsg} refreshing={refreshing} onRefresh={refreshStatus} onEdit={openAdoptModal} onDelete={deleteDevice} />
        )}

        <RegistrationModal showModal={registration.showModal} qrLoading={registration.qrLoading} qrError={registration.qrError} qrImageUrl={registration.qrImageUrl} timeRemaining={registration.timeRemaining} status={registration.status} matchedDevice={registration.matchedDevice} hybridDeviceIdInput={registration.hybridDeviceIdInput} hybridSubmitLoading={registration.hybridSubmitLoading} hybridSubmitError={registration.hybridSubmitError} hybridSubmitSuccess={registration.hybridSubmitSuccess} onClose={registration.closeModal} onRestart={registration.restartRegistration} onHybridInputChange={registration.setHybridDeviceIdInput} onHybridSubmit={registration.submitHybridDeviceId} />

        <AdoptModal showModal={showAdoptModal} device={adoptingDevice} formData={adoptFormData} groups={canonicalGroupDTOs} groupsLoading={groupsLoading} adoptLoading={adoptLoading} adoptError={adoptError} isEditing={isEditingDevice} onFormChange={(data) => setAdoptFormData((prev) => ({ ...prev, ...data }))} onSubmit={handleAdoptSubmit} onClose={closeAdoptModal} />

        <AdminReassignModal showModal={showAdminReassignModal} device={adminDeviceToManage} meshUsername={adminReassignUsername} meshUsers={meshUserDTOs} meshUsersLoading={meshUsersLoading} actionLoading={adminActionLoading} actionError={adminActionError} onMeshUsernameChange={setAdminReassignUsername} onSubmit={handleAdminReassignSubmit} onClose={closeAdminReassignModal} />
      </div>
    </main>
  );
}
