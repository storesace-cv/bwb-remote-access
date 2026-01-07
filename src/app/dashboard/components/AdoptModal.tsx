"use client";

import { GroupableDevice } from "@/lib/grouping";

interface CanonicalGroup {
  id: string;
  name: string;
  parent_group_id?: string | null;
}

interface AdoptFormData {
  friendly_name: string;
  group_id: string;
  subgroup_id?: string;
  observations: string;
  rustdesk_password: string;
}

interface AdoptModalProps {
  isOpen: boolean;
  device: GroupableDevice | null;
  isEditing: boolean;
  formData: AdoptFormData;
  onFormChange: (data: AdoptFormData) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  loading: boolean;
  error: string | null;
  groupsLoading: boolean;
  groups: CanonicalGroup[];
  availableSubgroups: CanonicalGroup[];
  selectedGroup: CanonicalGroup | undefined;
}

export function AdoptModal({
  isOpen,
  device,
  isEditing,
  formData,
  onFormChange,
  onSubmit,
  onClose,
  loading,
  error,
  groupsLoading,
  groups,
  availableSubgroups,
  selectedGroup,
}: AdoptModalProps) {
  if (!isOpen || !device) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">
            {isEditing ? "Editar Dispositivo" : "Adoptar Dispositivo"}
          </h3>
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
              Nome do Dispositivo <span className="text-slate-500">(opcional)</span>
            </label>
            <input
              type="text"
              value={formData.friendly_name}
              onChange={(e) => onFormChange({ ...formData, friendly_name: e.target.value })}
              placeholder="Ex: Tablet Sala, Samsung A54, etc."
              className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              disabled={loading}
              data-testid="adopt-friendly-name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">
              Grupo <span className="text-red-400">*</span>
            </label>
            <select
              value={formData.group_id}
              onChange={(e) => onFormChange({ ...formData, group_id: e.target.value, subgroup_id: undefined })}
              className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              disabled={loading}
              required
              data-testid="adopt-group"
            >
              {groupsLoading && <option value="">A carregar lista de grupos...</option>}
              {!groupsLoading && groups.length === 0 && <option value="">Nenhum grupo encontrado</option>}
              {!groupsLoading && groups.length > 0 && (
                <>
                  <option value="">Selecione um grupo...</option>
                  {groups
                    .filter((g) => !g.parent_group_id)
                    .map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                </>
              )}
            </select>
            <p className="text-xs text-slate-500 mt-1">Campo obrigatório</p>
          </div>

          {availableSubgroups.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-200 mb-1">
                Subgrupo <span className="text-slate-500">(opcional)</span>
              </label>
              <select
                value={formData.subgroup_id || ""}
                onChange={(e) => onFormChange({ ...formData, subgroup_id: e.target.value || undefined })}
                className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                disabled={loading}
                data-testid="adopt-subgroup"
              >
                <option value="">Nenhum subgrupo</option>
                {availableSubgroups.map((subgroup) => (
                  <option key={subgroup.id} value={subgroup.id}>
                    {subgroup.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">
                Seleccione um subgrupo dentro de {selectedGroup?.name}
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">
              Observações <span className="text-slate-500">(opcional)</span>
            </label>
            <textarea
              value={formData.observations}
              onChange={(e) => onFormChange({ ...formData, observations: e.target.value })}
              placeholder="Notas adicionais sobre o equipamento, localização, etc."
              className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[72px]"
              disabled={loading}
              data-testid="adopt-observations"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">
              Password RustDesk <span className="text-slate-500">(opcional)</span>
            </label>
            <input
              type="text"
              value={formData.rustdesk_password}
              onChange={(e) => onFormChange({ ...formData, rustdesk_password: e.target.value })}
              placeholder="Se preenchido, o link abre com ?password=..."
              className="w-full px-3 py-2 text-sm rounded-md bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              disabled={loading}
              data-testid="adopt-password"
            />
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
              data-testid="adopt-submit"
            >
              {loading ? "A processar..." : isEditing ? "Guardar Alterações" : "✓ Adoptar Dispositivo"}
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

export type { AdoptFormData, CanonicalGroup };
