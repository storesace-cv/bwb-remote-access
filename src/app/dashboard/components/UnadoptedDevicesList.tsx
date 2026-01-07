"use client";

import { GroupableDevice } from "@/lib/grouping";
import { RolePermissions } from "@/lib/permissions-service";

interface UnadoptedDevicesListProps {
  devices: GroupableDevice[];
  onAdopt: (device: GroupableDevice) => void;
  userPermissions?: RolePermissions | null;
}

export function UnadoptedDevicesList({ devices, onAdopt, userPermissions }: UnadoptedDevicesListProps) {
  // Verificar permissão de adoptar dispositivos
  const canAdoptDevices = userPermissions?.can_adopt_devices ?? false;

  if (devices.length === 0) {
    return null;
  }

  return (
    <section className="bg-amber-950/30 border border-amber-800/50 rounded-2xl p-6 mb-6 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-medium text-amber-400">
            ⚠️ Dispositivos por adoptar
          </h2>
          <p className="text-sm text-amber-300/70 mt-1">
            Estes dispositivos conectaram mas ainda precisam de informações
            adicionais (grupo, nome, etc.)
          </p>
        </div>
        <span className="px-3 py-1 text-xs font-semibold rounded-full bg-amber-600 text-white">
          {devices.length}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {devices.map((device: GroupableDevice) => {
          const fromProvisioningCode = !!device.from_provisioning_code;
          const tagLabel = fromProvisioningCode ? "PM" : "QR";
          const tagClassName = fromProvisioningCode
            ? "bg-white text-black border border-slate-300"
            : "bg-sky-600/80 text-white border border-sky-500";
          const notesParts = (device.notes ?? "")
            .split("|")
            .map((p: string) => p.trim())
            .filter((p: string) => p.length > 0);

          const groupLabel = device.group_name || notesParts[0] || "";
          const subgroupLabel = device.subgroup_name || notesParts[1] || "";
          const observations =
            notesParts.length > 2 ? notesParts.slice(2).join(" | ") : "";

          return (
            <div
              key={device.id}
              className="border border-amber-700/50 rounded-lg px-4 py-3 bg-slate-950/50"
              data-testid={`unadopted-device-${device.device_id}`}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-amber-100 text-sm">
                      {device.device_id}
                    </span>
                    {device.friendly_name && (
                      <span className="text-xs text-amber-300/70">
                        ({device.friendly_name})
                      </span>
                    )}
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${tagClassName}`}
                    >
                      {tagLabel}
                    </span>
                  </div>
                  {(groupLabel || subgroupLabel) && (
                    <p className="text-xs text-slate-400">
                      {groupLabel}
                      {groupLabel && subgroupLabel ? " | " : ""}
                      {subgroupLabel}
                    </p>
                  )}
                  {observations && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      Obs: {observations}
                    </p>
                  )}
                  <p className="text-xs text-slate-500 mt-1">
                    Visto:{" "}
                    {new Date(
                      device.last_seen_at || device.created_at || ""
                    ).toLocaleString("pt-PT")}
                  </p>
                  {device.owner && (
                    <p className="text-xs text-emerald-400 mt-1">
                      ✓ Associado ao utilizador
                    </p>
                  )}
                </div>
                {/* Botão Adoptar - requer can_adopt_devices */}
                {canAdoptDevices && (
                  <button
                    onClick={() => onAdopt(device)}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-600 hover:bg-emerald-500 transition text-white"
                    data-testid={`adopt-btn-${device.device_id}`}
                  >
                    ✓ Adoptar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
