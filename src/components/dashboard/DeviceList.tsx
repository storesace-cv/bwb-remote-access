"use client";

import { useMemo, useState } from "react";
import type { GroupableDevice } from "@/lib/grouping";
import { groupDevices } from "@/lib/grouping";
import { DeviceCard } from "./DeviceCard";
import { EmptyState } from "./EmptyState";

const DEFAULT_PAGE_SIZE = 20;

interface DeviceListProps {
  devices: GroupableDevice[];
  loading: boolean;
  errorMsg: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  onAdopt?: (device: GroupableDevice) => void;
  onEdit?: (device: GroupableDevice) => void;
  onDelete?: (device: GroupableDevice) => void;
  isAdmin?: boolean;
}

export function DeviceList({
  devices,
  loading,
  errorMsg,
  refreshing,
  onRefresh,
  onAdopt,
  onEdit,
  onDelete,
  isAdmin = false,
}: DeviceListProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedSubgroups, setExpandedSubgroups] = useState<Record<string, boolean>>({});

  const totalDevices = devices.length;
  const totalPages = Math.max(1, Math.ceil(totalDevices / pageSize));

  const paginatedDevices = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return devices.slice(start, start + pageSize);
  }, [devices, currentPage, pageSize]);

  const grouped = useMemo(() => groupDevices(paginatedDevices), [paginatedDevices]);

  const buildRustdeskUrl = (device: GroupableDevice): string => {
    const base = `rustdesk://connection/new/${encodeURIComponent(device.device_id)}`;
    const password = device.rustdesk_password?.trim();
    if (password && password.length > 0) {
      return `${base}?password=${encodeURIComponent(password)}`;
    }
    return base;
  };

  return (
    <section className="bg-slate-900/70 border border-slate-700 rounded-2xl p-6 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-white">✅ Dispositivos Adoptados</h2>
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <span className="hidden sm:inline">Por página:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                const value = Number.parseInt(e.target.value, 10);
                setPageSize(Number.isNaN(value) ? DEFAULT_PAGE_SIZE : value);
                setCurrentPage(1);
              }}
              className="px-2 py-1 rounded-md border border-slate-600 bg-slate-800 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            {totalPages > 1 && (
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-2 py-1 rounded-md border border-slate-600 bg-slate-800 hover:bg-slate-700 disabled:opacity-50"
                >
                  Anterior
                </button>
                <span>
                  Página {currentPage} de {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                  }
                  disabled={currentPage === totalPages}
                  className="px-2 py-1 rounded-md border border-slate-600 bg-slate-800 hover:bg-slate-700 disabled:opacity-50"
                >
                  Próxima
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={onRefresh}
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

      {devices.length === 0 && !loading && !errorMsg && (
        <EmptyState message="Sem dispositivos adoptados." />
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
                  <span className="font-medium text-sm text-white">{groupName}</span>
                  <span className="text-xs text-slate-400">
                    {isGroupExpanded ? "▼" : "▶"}
                  </span>
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
                          <div className="text-xs text-muted-foreground">
                            {groupLabel} / {subgroupLabel}
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedSubgroups((prev) => ({
                                ...prev,
                                [subKey]: !isSubExpanded,
                              }))
                            }
                            className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg bg-slate-800/50 hover:bg-slate-800 text-left"
                          >
                            <span className="text-xs text-slate-300">
                              {subgroupName || "Sem subgrupo"}
                              <span className="ml-2 text-slate-500">
                                ({subBucket.devices.length} dispositivos)
                              </span>
                            </span>
                            <span className="text-xs text-slate-500">
                              {isSubExpanded ? "▼" : "▶"}
                            </span>
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
                                        <span className="font-semibold text-slate-100 text-sm">
                                          {device.device_id}
                                        </span>
                                        {device.friendly_name && (
                                          <span className="text-xs text-slate-400">
                                            ({device.friendly_name})
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-xs text-slate-500">
                                        Visto:{" "}
                                        {new Date(
                                          device.last_seen_at || device.created_at || ""
                                        ).toLocaleString("pt-PT")}
                                      </p>
                                    </div>
                                    <div className="flex gap-1 ml-2">
                                      <a
                                        href={buildRustdeskUrl(device)}
                                        className="px-2 py-1 text-xs rounded-md bg-emerald-600 hover:bg-emerald-500 transition text-white"
                                      >
                                        🔗 Conectar
                                      </a>
                                      {onEdit && (
                                        <button
                                          onClick={() => onEdit(device)}
                                          className="px-2 py-1 text-xs rounded-md bg-slate-700 hover:bg-slate-600 transition text-white"
                                        >
                                          ✏️
                                        </button>
                                      )}
                                      {onDelete && (
                                        <button
                                          onClick={() => onDelete(device)}
                                          className="px-2 py-1 text-xs rounded-md bg-red-600/80 hover:bg-red-500 transition text-white"
                                        >
                                          🗑️
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
  );
}
