"use client";

import type { GroupableDevice } from "@/lib/grouping";

interface DeviceCardProps {
  device: GroupableDevice;
  onAdopt?: (device: GroupableDevice) => void;
  onEdit?: (device: GroupableDevice) => void;
  onDelete?: (device: GroupableDevice) => void;
  onConnect?: (device: GroupableDevice) => void;
  isAdmin?: boolean;
  isAdopted?: boolean;
  showOriginTag?: boolean;
}

export function DeviceCard({
  device,
  onAdopt,
  onEdit,
  onDelete,
  onConnect,
  isAdmin: _isAdmin = false,
  isAdopted = false,
  showOriginTag = true,
}: DeviceCardProps) {
  // isAdmin prop reserved for future admin-specific actions (e.g., force delete)
  void _isAdmin;
  const fromProvisioningCode = !!device.from_provisioning_code;
  const tagLabel = fromProvisioningCode ? "PM" : "QR";
  const tagClassName = fromProvisioningCode
    ? "bg-white text-black border border-slate-300"
    : "bg-sky-600/80 text-white border border-sky-500";

  // Parse notes for display
  const notesParts = (device.notes ?? "")
    .split("|")
    .map((p: string) => p.trim())
    .filter((p: string) => p.length > 0);

  const groupLabel = device.group_name || notesParts[0] || "";
  const subgroupLabel = device.subgroup_name || notesParts[1] || "";
  const observations = notesParts.length > 2 ? notesParts.slice(2).join(" | ") : "";

  const buildRustdeskUrl = (dev: GroupableDevice): string => {
    const base = `rustdesk://connection/new/${encodeURIComponent(dev.device_id)}`;
    const password = dev.rustdesk_password?.trim();
    if (password && password.length > 0) {
      return `${base}?password=${encodeURIComponent(password)}`;
    }
    return base;
  };

  return (
    <div className="border border-slate-700/50 rounded-lg px-4 py-3 bg-slate-950/50">
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-slate-100 text-sm">
              {device.device_id}
            </span>
            {device.friendly_name && (
              <span className="text-xs text-slate-400">({device.friendly_name})</span>
            )}
            {showOriginTag && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${tagClassName}`}
              >
                {tagLabel}
              </span>
            )}
          </div>

          {(groupLabel || subgroupLabel) && (
            <p className="text-xs text-slate-400">
              {groupLabel}
              {groupLabel && subgroupLabel ? " | " : ""}
              {subgroupLabel}
            </p>
          )}

          {observations && (
            <p className="text-xs text-slate-500 mt-0.5">Obs: {observations}</p>
          )}

          <p className="text-xs text-slate-500 mt-1">
            Visto:{" "}
            {new Date(device.last_seen_at || device.created_at || "").toLocaleString(
              "pt-PT"
            )}
          </p>

          {device.owner && !isAdopted && (
            <p className="text-xs text-emerald-400 mt-1">✓ Associado ao utilizador</p>
          )}
        </div>

        <div className="flex flex-col gap-2 ml-2">
          {!isAdopted && onAdopt && (
            <button
              onClick={() => onAdopt(device)}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-600 hover:bg-emerald-500 transition text-white"
            >
              ✓ Adoptar
            </button>
          )}

          {isAdopted && (
            <>
              {onConnect && (
                <a
                  href={buildRustdeskUrl(device)}
                  className="px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-600 hover:bg-emerald-500 transition text-white text-center"
                >
                  🔗 Conectar
                </a>
              )}
              {onEdit && (
                <button
                  onClick={() => onEdit(device)}
                  className="px-3 py-1.5 text-xs rounded-md bg-slate-700 hover:bg-slate-600 transition text-white"
                >
                  ✏️ Editar
                </button>
              )}
              {onDelete && (
                <button
                  onClick={() => onDelete(device)}
                  className="px-3 py-1.5 text-xs rounded-md bg-red-600/80 hover:bg-red-500 transition text-white"
                >
                  🗑️ Apagar
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
