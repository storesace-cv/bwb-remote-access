"use client";

import { GroupableDevice } from "@/lib/grouping";

interface MeshUser {
  id: string;
  mesh_username: string | null;
  display_name: string | null;
}

interface AdminReassignFormData {
  mesh_username: string;
}

interface AdminReassignModalProps {
  isOpen: boolean;
  device: GroupableDevice | null;
  formData: AdminReassignFormData;
  onFormChange: (data: AdminReassignFormData) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  loading: boolean;
  error: string | null;
  meshUsersLoading: boolean;
  meshUsers: MeshUser[];
}

export function AdminReassignModal({
  isOpen,
  device,
  formData,
  onFormChange,
  onSubmit,
  onClose,
  loading,
  error,
  meshUsersLoading,
  meshUsers,
}: AdminReassignModalProps) {
  if (!isOpen || !device) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Reatribuir Dispositivo</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition"
            disabled={loading}
          >
            ✕
          </button>
        </div>

        <div className="mb-4 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
          <p className="text-xs text-slate-400 mb-1">Device ID:</p>
          <p className="text-sm font-mono text-white">{device.device_id}</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">
              Utilizador de destino (mesh_username) <span className="text-red-400">*</span>
            </label>
            <select
              value={formData.mesh_username}
              onChange={(e) => onFormChange({ ...formData, mesh_username: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              disabled={loading || meshUsersLoading}
              required
              data-testid="reassign-user-select"
            >
              {meshUsersLoading && <option value="">A carregar lista de utilizadores...</option>}
              {!meshUsersLoading && meshUsers.length === 0 && (
                <option value="">Nenhum utilizador encontrado em mesh_users</option>
              )}
              {!meshUsersLoading && meshUsers.length > 0 && (
                <>
                  <option value="">Selecione um utilizador...</option>
                  {meshUsers.map((user) => (
                    <option key={user.id} value={user.mesh_username ?? ""}>
                      {user.display_name
                        ? `${user.display_name} (${user.mesh_username ?? "sem username"})`
                        : user.mesh_username ?? user.id}
                    </option>
                  ))}
                </>
              )}
            </select>
            <p className="text-xs text-slate-500 mt-1">
              O utilizador destino deve existir na tabela mesh_users.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-950/40 border border-red-900 rounded-md">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 text-sm font-medium rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition text-white"
              data-testid="reassign-submit"
            >
              {loading ? "A processar..." : "Reatribuir"}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2 text-sm rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition text-white"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export type { AdminReassignFormData, MeshUser };
