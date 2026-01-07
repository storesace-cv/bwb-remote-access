"use client";

import Image from "next/image";
import { GroupableDevice } from "@/lib/grouping";

interface GroupBucket {
  name: string | null;
  subgroups: SubgroupBucket[];
}

interface SubgroupBucket {
  name: string | null;
  devices: GroupableDevice[];
}

interface GroupedDevices {
  groups: GroupBucket[];
}

interface AdoptedDevicesListProps {
  devices: GroupableDevice[];
  grouped: GroupedDevices;
  loading: boolean;
  refreshing: boolean;
  errorMsg: string | null;
  isAdmin: boolean;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onRefresh: () => void;
  onEdit: (device: GroupableDevice) => void;
  onDelete: (device: GroupableDevice) => void;
  onConnect: (device: GroupableDevice) => void;
  expandedGroups: Record<string, boolean>;
  expandedSubgroups: Record<string, boolean>;
  onToggleGroup: (groupKey: string) => void;
  onToggleSubgroup: (subKey: string) => void;
}

export function AdoptedDevicesList({
  devices,
  grouped,
  loading,
  refreshing,
  errorMsg,
  isAdmin,
  currentPage,
  totalPages,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onRefresh,
  onEdit,
  onDelete,
  onConnect,
  expandedGroups,
  expandedSubgroups,
  onToggleGroup,
  onToggleSubgroup,
}: AdoptedDevicesListProps) {
  if (isAdmin && devices.length === 0) {
    return null;
  }

  return (
    <section className="bg-slate-900/70 border border-slate-700 rounded-2xl p-6 backdrop-blur-sm" data-testid="adopted-devices-section">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-white">✅ Dispositivos Adoptados</h2>
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <span className="hidden sm:inline">Por página:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                const value = Number.parseInt(e.target.value, 10);
                onPageSizeChange(Number.isNaN(value) ? 20 : value);
              }}
              className="px-2 py-1 rounded-md border border-slate-600 bg-slate-800 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
              data-testid="page-size-select"
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
                  onClick={() => onPageChange(Math.max(1, currentPage - 1))}
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
                  onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
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
              data-testid="refresh-status-btn"
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
        <p className="text-sm text-slate-400">Sem dispositivos adoptados.</p>
      )}

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
                  onClick={() => onToggleGroup(groupKey)}
                  className="w-full flex items-center justify-between px-4 py-2 bg-slate-800/70 hover:bg-slate-800 text-left"
                >
                  <span className="font-medium text-sm text-white">{groupName || "Sem grupo"}</span>
                  <span className="text-xs text-slate-400">{isGroupExpanded ? "▼" : "►"}</span>
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
                          {subgroupName ? (
                            <button
                              type="button"
                              onClick={() => onToggleSubgroup(subKey)}
                              className="flex items-center justify-between text-xs text-slate-400 hover:text-slate-300 transition-colors text-left"
                            >
                              <span>
                                {groupLabel} · {subgroupLabel}
                              </span>
                              <span className="ml-2">{isSubExpanded ? "▼" : "►"}</span>
                            </button>
                          ) : (
                            <div className="text-xs text-slate-400">
                              {groupLabel} · {subgroupLabel}
                            </div>
                          )}
                          {(isSubExpanded || !subgroupName) && (
                            <div className="grid gap-3 md:grid-cols-2">
                              {subBucket.devices.map((d: GroupableDevice) => (
                                <DeviceListItem
                                  key={d.id}
                                  device={d}
                                  isAdmin={isAdmin}
                                  onEdit={onEdit}
                                  onDelete={onDelete}
                                  onConnect={onConnect}
                                />
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

// Sub-component for individual device items
interface DeviceListItemProps {
  device: GroupableDevice;
  isAdmin: boolean;
  onEdit: (device: GroupableDevice) => void;
  onDelete: (device: GroupableDevice) => void;
  onConnect: (device: GroupableDevice) => void;
}

function DeviceListItem({ device, isAdmin, onEdit, onDelete, onConnect }: DeviceListItemProps) {
  const d = device;
  const fromProvisioningCode = !!d.from_provisioning_code;
  const tagLabel = fromProvisioningCode ? "PM" : "QR";
  const tagClassName = fromProvisioningCode
    ? "bg-white text-black border border-slate-300"
    : "bg-sky-600/80 text-white border border-sky-500";

  const notesParts = (d.notes ?? "")
    .split("|")
    .map((p: string) => p.trim())
    .filter((p: string) => p.length > 0);

  const groupLabelDevice = d.group_name || notesParts[0] || "";
  const subgroupLabelDevice = d.subgroup_name || notesParts[1] || "";

  const observations = notesParts.length > 2 ? notesParts.slice(2).join(" | ") : "";

  const groupLine =
    groupLabelDevice || subgroupLabelDevice
      ? `${groupLabelDevice}${groupLabelDevice && subgroupLabelDevice ? " | " : ""}${subgroupLabelDevice}`
      : "";

  return (
    <div
      className="border border-slate-700 rounded-lg px-3 py-2 bg-slate-950/50 text-xs"
      data-testid={`adopted-device-${d.device_id}`}
    >
      <div className="flex justify-between items-start mb-1">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-white">{d.friendly_name || d.device_id}</span>
            {d.mesh_username && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                {d.mesh_username}
              </span>
            )}
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${tagClassName}`}>
              {tagLabel}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">ID: {d.device_id}</p>
          {groupLine && <p className="text-[11px] text-slate-400 mt-0.5">{groupLine}</p>}
          {observations && <p className="text-[11px] text-slate-500 mt-0.5">Obs: {observations}</p>}
          <p className="text-[11px] text-slate-500 mt-0.5">
            Visto: {new Date(d.last_seen_at || d.created_at || "").toLocaleString("pt-PT")}
          </p>
        </div>
        <div className="flex items-stretch gap-2 ml-2">
          <div className="flex flex-col gap-1">
            {!isAdmin && (
              <button
                type="button"
                onClick={() => onEdit(d)}
                className="px-2 py-1 rounded-md bg-slate-700 hover:bg-slate-600 text-[10px] text-white"
              >
                Editar
              </button>
            )}
            <button
              type="button"
              onClick={() => onDelete(d)}
              className="px-2 py-1 rounded-md bg-red-600 hover:bg-red-500 text-[10px] text-white"
            >
              Apagar
            </button>
          </div>
          <button
            type="button"
            onClick={() => onConnect(d)}
            className="w-9 h-9 flex items-center justify-center rounded-md bg-sky-600 hover:bg-sky-500 text-white shadow-sm"
            aria-label="Abrir no RustDesk"
          >
            <Image src="/rustdesk-logo.svg" alt="RustDesk" width={18} height={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

export type { GroupedDevices, GroupBucket, SubgroupBucket };
