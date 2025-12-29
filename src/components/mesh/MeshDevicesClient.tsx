"use client";

/**
 * MeshCentral Devices Client Component - STEP 6.1 & 6.2
 * 
 * Handles client-side interactions for the devices list:
 * - Group filter
 * - Refresh
 * - Sync trigger (admin only)
 * - Open Remote Session (STEP 6.2)
 */

import { useState, useCallback } from "react";

type ValidDomain = "mesh" | "zonetech" | "zsangola";

interface Group {
  id: string;
  meshId: string;
  domain: string;
  name: string | null;
}

interface Device {
  id: string;
  nodeId: string;
  domain: string;
  meshId: string | null;
  hostname: string | null;
  osDescription: string | null;
  agentVersion: string | null;
  ipLocal: string | null;
  ipPublic: string | null;
  lastConnect: string | null;
  groupName: string | null;
}

interface MeshDevicesClientProps {
  initialGroups: Group[];
  initialDevices: Device[];
  initialTotal: number;
  filterDomain: ValidDomain | null;
  isSuperAdmin: boolean;
}

interface SessionState {
  deviceId: string;
  status: "idle" | "loading" | "success" | "error";
  error?: string;
}

export default function MeshDevicesClient({
  initialGroups,
  initialDevices,
  initialTotal,
  filterDomain,
  isSuperAdmin,
}: MeshDevicesClientProps) {
  const [groups] = useState<Group[]>(initialGroups);
  const [devices, setDevices] = useState<Device[]>(initialDevices);
  const [total, setTotal] = useState(initialTotal);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const refreshDevices = useCallback(async (groupFilter?: string | null) => {
    setIsRefreshing(true);
    try {
      const params = new URLSearchParams();
      if (filterDomain) params.set("domain", filterDomain);
      if (groupFilter) params.set("meshId", groupFilter);
      params.set("limit", "100");
      
      const response = await fetch(`/api/mesh/devices?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setDevices(data.devices);
        setTotal(data.total);
      }
    } catch (error) {
      console.error("Failed to refresh devices:", error);
    } finally {
      setIsRefreshing(false);
    }
  }, [filterDomain]);

  const handleGroupChange = (meshId: string | null) => {
    setSelectedGroup(meshId);
    refreshDevices(meshId);
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      const response = await fetch("/api/admin/mesh/sync", { method: "POST" });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || data.details || "Sync failed");
      }

      setSyncMessage({
        type: "success",
        text: `Sync completo: ${data.counters.upsertedGroups} grupos, ${data.counters.upsertedDevices} dispositivos`,
      });
      refreshDevices(selectedGroup);
    } catch (error) {
      setSyncMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Erro ao sincronizar",
      });
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 5) return "Agora";
    if (diffMins < 60) return `${diffMins}m atrás`;
    if (diffHours < 24) return `${diffHours}h atrás`;
    if (diffDays < 7) return `${diffDays}d atrás`;
    return date.toLocaleDateString("pt-PT", { day: "2-digit", month: "short" });
  };

  const isOnline = (lastConnect: string | null) => {
    if (!lastConnect) return false;
    const date = new Date(lastConnect);
    const diffMs = Date.now() - date.getTime();
    return diffMs < 5 * 60 * 1000; // 5 minutes
  };

  return (
    <div className="space-y-6">
      {/* Sync Message */}
      {syncMessage && (
        <div
          className={`p-4 rounded-lg text-sm ${
            syncMessage.type === "success"
              ? "bg-emerald-900/50 text-emerald-300 border border-emerald-800"
              : "bg-red-900/50 text-red-300 border border-red-800"
          }`}
        >
          {syncMessage.text}
        </div>
      )}

      {/* Controls */}
      <section className="bg-slate-900/70 border border-slate-700 rounded-xl p-4 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Group Filter */}
          <div className="flex items-center gap-3">
            <label className="text-sm text-slate-400">Grupo:</label>
            <select
              value={selectedGroup || ""}
              onChange={(e) => handleGroupChange(e.target.value || null)}
              className="px-3 py-1.5 text-sm bg-slate-800 border border-slate-700 rounded-md text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
            >
              <option value="">Todos os grupos</option>
              {groups.map((g) => (
                <option key={g.id} value={g.meshId}>
                  {g.name || g.meshId}
                </option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => refreshDevices(selectedGroup)}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-800 border border-slate-700 rounded-md text-white hover:bg-slate-700 transition disabled:opacity-50"
            >
              <svg
                className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Atualizar
            </button>

            {isSuperAdmin && (
              <button
                onClick={handleSync}
                disabled={isSyncing}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-cyan-700 border border-cyan-600 rounded-md text-white hover:bg-cyan-600 transition disabled:opacity-50"
              >
                <svg
                  className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                  />
                </svg>
                {isSyncing ? "A sincronizar..." : "Sync MeshCentral"}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Devices Table */}
      <section className="bg-slate-900/70 border border-slate-700 rounded-2xl backdrop-blur-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700">
          <h2 className="text-lg font-medium text-white">
            Dispositivos ({total})
          </h2>
        </div>

        {devices.length === 0 ? (
          <div className="p-8 text-center">
            <svg
              className="w-12 h-12 mx-auto mb-4 text-slate-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
              />
            </svg>
            <h3 className="text-lg font-medium text-slate-400 mb-2">
              Nenhum dispositivo encontrado
            </h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              {isSuperAdmin
                ? "Clica em 'Sync MeshCentral' para importar dispositivos."
                : "Os dispositivos aparecem aqui após sincronização com o MeshCentral."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-slate-400 uppercase tracking-wider">
                  <th className="px-6 py-3 font-medium">Estado</th>
                  <th className="px-6 py-3 font-medium">Hostname</th>
                  <th className="px-6 py-3 font-medium">Sistema Operativo</th>
                  <th className="px-6 py-3 font-medium">Grupo</th>
                  <th className="px-6 py-3 font-medium">IP</th>
                  <th className="px-6 py-3 font-medium">Última Ligação</th>
                  <th className="px-6 py-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {devices.map((device) => {
                  const online = isOnline(device.lastConnect);
                  return (
                    <tr key={device.id} className="hover:bg-slate-800/50 transition">
                      {/* Status */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2.5 h-2.5 rounded-full ${
                              online ? "bg-green-500 animate-pulse" : "bg-slate-500"
                            }`}
                          />
                          <span className={`text-xs ${online ? "text-green-400" : "text-slate-500"}`}>
                            {online ? "Online" : "Offline"}
                          </span>
                        </div>
                      </td>

                      {/* Hostname */}
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm text-white font-medium">
                            {device.hostname || "—"}
                          </span>
                          <span className="text-xs text-slate-500 font-mono">
                            {device.nodeId.split("/").pop()?.substring(0, 12)}...
                          </span>
                        </div>
                      </td>

                      {/* OS */}
                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-300">
                          {device.osDescription || "—"}
                        </span>
                        {device.agentVersion && (
                          <span className="block text-xs text-slate-500">
                            Agent v{device.agentVersion}
                          </span>
                        )}
                      </td>

                      {/* Group */}
                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-300">
                          {device.groupName || "—"}
                        </span>
                      </td>

                      {/* IP */}
                      <td className="px-6 py-4">
                        <div className="flex flex-col text-xs font-mono">
                          {device.ipLocal && (
                            <span className="text-slate-400">{device.ipLocal}</span>
                          )}
                          {device.ipPublic && (
                            <span className="text-slate-500">{device.ipPublic}</span>
                          )}
                          {!device.ipLocal && !device.ipPublic && (
                            <span className="text-slate-600">—</span>
                          )}
                        </div>
                      </td>

                      {/* Last Connect */}
                      <td className="px-6 py-4">
                        <span className={`text-sm ${online ? "text-green-400" : "text-slate-400"}`}>
                          {formatDate(device.lastConnect)}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4">
                        <button
                          disabled
                          className="px-3 py-1.5 text-xs rounded-md bg-slate-700 text-slate-500 cursor-not-allowed"
                          title="STEP 6.2 irá implementar sessões remotas"
                        >
                          Remote (STEP 6.2)
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
