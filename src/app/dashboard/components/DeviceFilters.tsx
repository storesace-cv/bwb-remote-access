"use client";

import { useState } from "react";

type SortOption = "date_desc" | "date_asc" | "name_asc" | "name_desc" | "id_asc" | "id_desc";
type FilterStatus = "all" | "adopted" | "unadopted";

interface DeviceFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filterStatus: FilterStatus;
  onFilterStatusChange: (status: FilterStatus) => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  totalDevices: number;
  adoptedCount: number;
  unadoptedCount: number;
  onRefresh: () => void;
  refreshing: boolean;
}

export function DeviceFilters({
  searchQuery,
  onSearchChange,
  filterStatus,
  onFilterStatusChange,
  sortBy,
  onSortChange,
  totalDevices,
  adoptedCount,
  unadoptedCount,
  onRefresh,
  refreshing,
}: DeviceFiltersProps) {
  const [showFilters, setShowFilters] = useState(false);

  return (
    <section className="bg-slate-900/70 border border-slate-700 rounded-2xl p-4 mb-6 backdrop-blur-sm">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {/* Search */}
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="Pesquisar por ID, nome ou IP..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full px-4 py-2 pl-10 text-sm rounded-lg bg-slate-800 border border-slate-600 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            data-testid="device-search-input"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        {/* Filter toggle */}
        <button
          type="button"
          onClick={() => setShowFilters(!showFilters)}
          className={`px-3 py-2 text-sm rounded-lg border transition ${
            showFilters
              ? "bg-emerald-600/20 border-emerald-600 text-emerald-400"
              : "bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700"
          }`}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
              />
            </svg>
            Filtros
          </span>
        </button>

        {/* Refresh */}
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="px-3 py-2 text-sm rounded-lg bg-slate-800 border border-slate-600 text-slate-300 hover:bg-slate-700 transition disabled:opacity-50"
          data-testid="refresh-devices-btn"
        >
          <span className="flex items-center gap-2">
            <svg
              className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            {refreshing ? "A actualizar..." : "Actualizar"}
          </span>
        </button>
      </div>

      {/* Expanded filters */}
      {showFilters && (
        <div className="mt-4 pt-4 border-t border-slate-700 flex flex-wrap items-center gap-4">
          {/* Status filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Estado:</span>
            <select
              value={filterStatus}
              onChange={(e) => onFilterStatusChange(e.target.value as FilterStatus)}
              className="px-2 py-1 text-xs rounded bg-slate-800 border border-slate-600 text-white"
              data-testid="filter-status-select"
            >
              <option value="all">Todos ({totalDevices})</option>
              <option value="adopted">Adoptados ({adoptedCount})</option>
              <option value="unadopted">Não adoptados ({unadoptedCount})</option>
            </select>
          </div>

          {/* Sort */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Ordenar:</span>
            <select
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value as SortOption)}
              className="px-2 py-1 text-xs rounded bg-slate-800 border border-slate-600 text-white"
              data-testid="sort-select"
            >
              <option value="date_desc">Mais recente</option>
              <option value="date_asc">Mais antigo</option>
              <option value="name_asc">Nome A-Z</option>
              <option value="name_desc">Nome Z-A</option>
              <option value="id_asc">ID A-Z</option>
              <option value="id_desc">ID Z-A</option>
            </select>
          </div>

          {/* Stats */}
          <div className="ml-auto flex items-center gap-3 text-xs">
            <span className="text-slate-500">
              Total: <span className="text-white font-medium">{totalDevices}</span>
            </span>
            <span className="text-emerald-500">
              Adoptados: <span className="font-medium">{adoptedCount}</span>
            </span>
            <span className="text-amber-500">
              Pendentes: <span className="font-medium">{unadoptedCount}</span>
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

export type { SortOption, FilterStatus };
