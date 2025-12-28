"use client";

import type { GroupableDevice } from "@/lib/grouping";
import type { MeshUserDTO } from "@/types/MeshUserDTO";

interface AdminReassignModalProps {
  showModal: boolean;
  device: GroupableDevice | null;
  meshUsername: string;
  meshUsers: MeshUserDTO[];
  meshUsersLoading: boolean;
  actionLoading: boolean;
  actionError: string | null;
  onMeshUsernameChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export function AdminReassignModal({
  showModal,
  device,
  meshUsername,
  meshUsers,
  meshUsersLoading,
  actionLoading,
  actionError,
  onMeshUsernameChange,
  onSubmit,
  onClose,
}: AdminReassignModalProps) {
  if (!showModal || !device) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 w-full max-w-md mx-4 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">
            🔄 Reatribuir Dispositivo
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        <div className="mb-4 p-3 bg-slate-800/50 rounded-lg">
          <p className="text-sm text-slate-300">
            <span className="text-slate-500">ID:</span>{" "}
            <span className="font-mono">{device.device_id}</span>
          </p>
          {device.friendly_name && (
            <p className="text-sm text-slate-300 mt-1">
              <span className="text-slate-500">Nome:</span> {device.friendly_name}
            </p>
          )}
        </div>

        {actionError && (
          <div className="mb-4 p-3 bg-red-950/40 border border-red-900 rounded-md">
            <p className="text-sm text-red-400">{actionError}</p>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Utilizador destino <span className="text-red-400">*</span>
            </label>
            {meshUsersLoading ? (
              <div className="flex items-center gap-2 text-slate-500 text-sm">
                <span className="h-4 w-4 rounded-full border-2 border-slate-600 border-t-emerald-500 animate-spin" />
                A carregar utilizadores...
              </div>
            ) : (
              <select
                value={meshUsername}
                onChange={(e) => onMeshUsernameChange(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Selecionar utilizador...</option>
                {meshUsers.map((user) => (
                  <option key={user.id} value={user.meshUsername || ""}>
                    {user.displayName || user.meshUsername || user.id}
                    {user.meshUsername && ` (${user.meshUsername})`}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm rounded-lg bg-slate-700 hover:bg-slate-600 text-white transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={actionLoading || !meshUsername.trim()}
              className="flex-1 px-4 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition flex items-center justify-center gap-2"
            >
              {actionLoading && (
                <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              )}
              Reatribuir
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
