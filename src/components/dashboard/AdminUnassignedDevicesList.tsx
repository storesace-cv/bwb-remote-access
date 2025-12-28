"use client";

import type { GroupableDevice } from "@/lib/grouping";
import type { MeshUserDTO } from "@/types/MeshUserDTO";

interface AdminUnassignedDevicesListProps {
  devices: GroupableDevice[];
  meshUsers: MeshUserDTO[];
  meshUsersLoading: boolean;
  adminActionLoading: boolean;
  adminActionError: string | null;
  onReassign: (device: GroupableDevice) => void;
  onDelete: (device: GroupableDevice) => void;
}

export function AdminUnassignedDevicesList({
  devices,
  meshUsers,
  meshUsersLoading,
  adminActionLoading,
  adminActionError,
  onReassign,
  onDelete,
}: AdminUnassignedDevicesListProps) {
  if (devices.length === 0) return null;

  return (
    <section className="bg-purple-950/30 border border-purple-800/60 rounded-2xl p-6 mb-6 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-medium text-purple-200">
            🧩 Dispositivos sem Utilizador Atribuido
          </h2>
          <p className="text-sm text-purple-200/70 mt-1">
            Dispositivos que não foi possível associar com segurança a nenhum
            utilizador. Pode reatribuir manualmente ou apagar.
          </p>
        </div>
        <span className="px-3 py-1 text-xs font-semibold rounded-full bg-purple-600 text-white">
          {devices.length}
        </span>
      </div>

      {adminActionError && (
        <div className="mb-4 p-3 bg-red-950/40 border border-red-900 rounded-md">
          <p className="text-sm text-red-400">{adminActionError}</p>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {devices.map((device) => (
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
                    device.last_seen_at || device.created_at || ""
                  ).toLocaleString("pt-PT")}
                </p>
              </div>
              <div className="flex flex-col gap-2 ml-2">
                <button
                  type="button"
                  onClick={() => onReassign(device)}
                  disabled={adminActionLoading}
                  className="px-3 py-1.5 text-xs rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition text-white"
                >
                  Reatribuir
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(device)}
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
  );
}
