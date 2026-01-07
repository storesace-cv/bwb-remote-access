"use client";

import { GroupableDevice } from "@/lib/grouping";

interface DeviceCardProps {
  device: GroupableDevice;
  onAdopt?: (device: GroupableDevice) => void;
  onReassign?: (device: GroupableDevice) => void;
  showAdoptButton?: boolean;
  showConnectButton?: boolean;
  showReassignButton?: boolean;
  isAdmin?: boolean;
}

export function DeviceCard({
  device,
  onAdopt,
  onReassign,
  showAdoptButton = false,
  showConnectButton = false,
  showReassignButton = false,
  isAdmin = false,
}: DeviceCardProps) {
  const isOnline = device.is_online;
  const hasPassword = device.rustdesk_password && device.rustdesk_password.trim().length > 0;

  const buildRustdeskUrl = (d: GroupableDevice): string => {
    const base = `rustdesk://connection/new/${encodeURIComponent(d.device_id)}`;
    const password = d.rustdesk_password?.trim();
    if (password && password.length > 0) {
      return `${base}?password=${encodeURIComponent(password)}`;
    }
    return base;
  };

  return (
    <div
      className={`bg-slate-800/50 border rounded-xl p-4 transition-all hover:shadow-lg ${
        isOnline
          ? "border-emerald-600/30 hover:border-emerald-500/50"
          : "border-slate-700 hover:border-slate-600"
      }`}
      data-testid={`device-card-${device.device_id}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isOnline ? "bg-emerald-500 animate-pulse" : "bg-slate-500"
            }`}
          />
          <span className="text-xs text-slate-400">
            {isOnline ? "Online" : "Offline"}
          </span>
        </div>
        {device.adopted && (
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-600/20 text-emerald-400">
            Adoptado
          </span>
        )}
      </div>

      {/* Device Info */}
      <div className="space-y-2 mb-4">
        <h3 className="font-medium text-white truncate" title={device.friendly_name || device.device_id}>
          {device.friendly_name || device.device_id}
        </h3>
        <p className="text-xs text-slate-400 font-mono truncate" title={device.device_id}>
          ID: {device.device_id}
        </p>
        {device.device_info?.ip && (
          <p className="text-xs text-slate-500">
            IP: {device.device_info.ip}
          </p>
        )}
        {device.device_info?.os && (
          <p className="text-xs text-slate-500 truncate">
            {device.device_info.os}
          </p>
        )}
        {device.observations && (
          <p className="text-xs text-slate-400 italic truncate" title={device.observations}>
            {device.observations}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {showConnectButton && (
          <a
            href={buildRustdeskUrl(device)}
            className={`flex-1 px-3 py-1.5 text-xs rounded-lg text-center transition ${
              hasPassword
                ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                : "bg-slate-700 hover:bg-slate-600 text-slate-300"
            }`}
            data-testid={`connect-device-${device.device_id}`}
          >
            {hasPassword ? "Ligar" : "Ligar (sem password)"}
          </a>
        )}

        {showAdoptButton && onAdopt && (
          <button
            type="button"
            onClick={() => onAdopt(device)}
            className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-amber-600 hover:bg-amber-500 text-white transition"
            data-testid={`adopt-device-${device.device_id}`}
          >
            Adoptar
          </button>
        )}

        {showReassignButton && onReassign && isAdmin && (
          <button
            type="button"
            onClick={() => onReassign(device)}
            className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition"
            data-testid={`reassign-device-${device.device_id}`}
          >
            Reatribuir
          </button>
        )}
      </div>
    </div>
  );
}
