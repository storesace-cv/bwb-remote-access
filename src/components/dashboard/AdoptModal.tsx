"use client";

import type { GroupableDevice } from "@/lib/grouping";
import type { DeviceGroupDTO } from "@/types/DeviceDTO";
import { useMemo } from "react";

interface AdoptFormData {
  friendly_name: string;
  group_id: string;
  subgroup_id?: string;
  rustdesk_password: string;
  observations: string;
}

interface AdoptModalProps {
  showModal: boolean;
  device: GroupableDevice | null;
  formData: AdoptFormData;
  groups: DeviceGroupDTO[];
  groupsLoading: boolean;
  adoptLoading: boolean;
  adoptError: string | null;
  isEditing: boolean;
  onFormChange: (data: Partial<AdoptFormData>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export function AdoptModal({
  showModal,
  device,
  formData,
  groups,
  groupsLoading,
  adoptLoading,
  adoptError,
  isEditing,
  onFormChange,
  onSubmit,
  onClose,
}: AdoptModalProps) {
  if (!showModal || !device) return null;

  // Compute root groups and subgroups
  const rootGroups = useMemo(
    () => groups.filter((g) => !g.parentGroupId),
    [groups]
  );

  const selectedGroup = formData.group_id
    ? groups.find((g) => g.id === formData.group_id)
    : null;

  const availableSubgroups = selectedGroup
    ? groups.filter((g) => g.parentGroupId === selectedGroup.id)
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 w-full max-w-md mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">
            {isEditing ? "✏️ Editar Dispositivo" : "✓ Adoptar Dispositivo"}
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
        </div>

        {adoptError && (
          <div className="mb-4 p-3 bg-red-950/40 border border-red-900 rounded-md">
            <p className="text-sm text-red-400">{adoptError}</p>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          {/* Friendly Name */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Nome amigável
            </label>
            <input
              type="text"
              value={formData.friendly_name}
              onChange={(e) => onFormChange({ friendly_name: e.target.value })}
              placeholder="Ex: Tablet Loja Principal"
              className="w-full px-3 py-2 text-sm rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Group Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Grupo <span className="text-red-400">*</span>
            </label>
            {groupsLoading ? (
              <div className="flex items-center gap-2 text-slate-500 text-sm">
                <span className="h-4 w-4 rounded-full border-2 border-slate-600 border-t-emerald-500 animate-spin" />
                A carregar grupos...
              </div>
            ) : (
              <select
                value={formData.group_id}
                onChange={(e) =>
                  onFormChange({
                    group_id: e.target.value,
                    subgroup_id: undefined, // Reset subgroup when group changes
                  })
                }
                required
                className="w-full px-3 py-2 text-sm rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Selecionar grupo...</option>
                {rootGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Subgroup Selection (only if group has subgroups) */}
          {availableSubgroups.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Subgrupo
              </label>
              <select
                value={formData.subgroup_id || ""}
                onChange={(e) =>
                  onFormChange({
                    subgroup_id: e.target.value || undefined,
                  })
                }
                className="w-full px-3 py-2 text-sm rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Sem subgrupo</option>
                {availableSubgroups.map((subgroup) => (
                  <option key={subgroup.id} value={subgroup.id}>
                    {subgroup.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* RustDesk Password */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Password RustDesk
            </label>
            <input
              type="text"
              value={formData.rustdesk_password}
              onChange={(e) =>
                onFormChange({ rustdesk_password: e.target.value })
              }
              placeholder="Password de acesso rápido"
              className="w-full px-3 py-2 text-sm rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <p className="text-xs text-slate-500 mt-1">
              Opcional. Permite ligação directa sem pedir password.
            </p>
          </div>

          {/* Observations */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Observações
            </label>
            <textarea
              value={formData.observations}
              onChange={(e) => onFormChange({ observations: e.target.value })}
              placeholder="Notas adicionais sobre este dispositivo..."
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>

          {/* Actions */}
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
              disabled={adoptLoading || !formData.group_id}
              className="flex-1 px-4 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition flex items-center justify-center gap-2"
            >
              {adoptLoading && (
                <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              )}
              {isEditing ? "Guardar" : "Adoptar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
