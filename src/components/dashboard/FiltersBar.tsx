"use client";

import type { FilterStatus, SortOption } from "@/types/DeviceDTO";

interface FiltersBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sortBy: SortOption;
  onSortChange: (option: SortOption) => void;
  filterStatus: FilterStatus;
  onFilterChange: (status: FilterStatus) => void;
  showFilters: boolean;
  onToggleFilters: () => void;
  deviceCount: number;
  adoptedCount: number;
  unadoptedCount: number;
  isAdmin: boolean;
}

export function FiltersBar({
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
  filterStatus,
  onFilterChange,
  showFilters,
  onToggleFilters,
  deviceCount,
  adoptedCount,
  unadoptedCount,
  isAdmin,
}: FiltersBarProps) {
  return (
    <section className="bg-slate-900/70 border border-slate-700 rounded-2xl p-4 mb-6 backdrop-blur-sm">
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder="🔍 Procurar por ID, nome ou notas..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full px-4 py-2 text-sm rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as SortOption)}
          className="px-4 py-2 text-sm rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="date_desc">📅 Mais recentes</option>
          <option value="date_asc">📅 Mais antigos</option>
          <option value="name_asc">🔤 Nome A-Z</option>
          <option value="name_desc">🔤 Nome Z-A</option>
          <option value="id_asc">🔢 ID crescente</option>
          <option value="id_desc">🔢 ID decrescente</option>
        </select>

        <button
          onClick={onToggleFilters}
          className={`px-4 py-2 text-sm rounded-lg transition ${
            showFilters
              ? "bg-emerald-600 text-white"
              : "bg-slate-800 border border-slate-600 text-slate-300 hover:bg-slate-700"
          }`}
        >
          🔧 Filtros
        </button>
      </div>

      {showFilters && (
        <div className="mt-4 pt-4 border-t border-slate-700/50">
          <div className="flex gap-2">
            <button
              onClick={() => onFilterChange("all")}
              className={`px-3 py-1.5 text-xs rounded-md transition ${
                filterStatus === "all"
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              Todos ({deviceCount})
            </button>
            <button
              onClick={() => onFilterChange("adopted")}
              className={`px-3 py-1.5 text-xs rounded-md transition ${
                filterStatus === "adopted"
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              Adoptados ({adoptedCount})
            </button>
            {!isAdmin && (
              <button
                onClick={() => onFilterChange("unadopted")}
                className={`px-3 py-1.5 text-xs rounded-md transition ${
                  filterStatus === "unadopted"
                    ? "bg-amber-600 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                Por adoptar ({unadoptedCount})
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
