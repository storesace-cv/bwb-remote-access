"use client";

import { GroupableDevice } from "@/lib/grouping";
import { RolePermissions } from "@/lib/permissions-service";

interface AdminUnassignedDevicesListProps {
  devices: GroupableDevice[];
  onReassign: (device: GroupableDevice) => void;
  onDelete: (device: GroupableDevice) => void;
  loading: boolean;
  error: string | null;
  userPermissions?: RolePermissions | null;
}

export function AdminUnassignedDevicesList({
  devices,
  onReassign,
  onDelete,
  loading,
  error,
  userPermissions,
}: AdminUnassignedDevicesListProps) {
  // Verificar permissões
  const canEditDevices = userPermissions?.can_edit_devices ?? false;
  const canDeleteDevices = userPermissions?.can_delete_devices ?? false;

  if (devices.length === 0) {
    return null;
  }

  return (
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
          {devices.length}
        </span>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-950/40 border border-red-900 rounded-md">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {devices.map((device: GroupableDevice) => (
          <div
            key={device.id}
            className="border border-purple-800/60 rounded-lg px-4 py-3 bg-slate-950/60"
            data-testid={`admin-device-${device.device_id}`}
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
                {/* Reatribuir - requer can_edit_devices */}
                {canEditDevices && (
                  <button
                    type="button"
                    onClick={() => onReassign(device)}
                    disabled={loading}
                    className="px-3 py-1.5 text-xs rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition text-white"
                    data-testid={`reassign-btn-${device.device_id}`}
                  >
                    Reatribuir
                  </button>
                )}
                {/* Apagar - requer can_delete_devices */}
                {canDeleteDevices && (
                  <button
                    type="button"
                    onClick={() => onDelete(device)}
                    disabled={loading}
                    className="px-3 py-1.5 text-xs rounded-md bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition text-white"
                    data-testid={`delete-btn-${device.device_id}`}
                  >
                    Apagar
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
