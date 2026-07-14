"use client";

import type { FormEvent } from "react";
import Link from "next/link";
import { CheckSquare, Download, LayoutGrid, List, Square, Upload, Users } from "lucide-react";

import { athleteStatusOptions } from "@/lib/athletes/constants";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { AlertBadge } from "@/components/shared/AlertBadge";
import { TooltipOnboarding } from "@/components/tooltips/TooltipOnboarding";
import type { SportConfigOption } from "@/components/groups/types";
import type { AthleteListItem, GroupOption } from "@/types";

export interface AthleteTerms {
  athlete: string;
  athletes: string;
  group: string;
}

export interface AthleteCommonText {
  search: string;
  cancel: string;
  delete: string;
}

export interface AgeRange {
  min?: number;
  max?: number;
}

type SortBy = "name" | "age" | "createdAt";
type SortOrder = "asc" | "desc";
type ViewMode = "table" | "kanban";

export function AthletesToolbar({
  query,
  statusFilter,
  levelFilter,
  groupFilter,
  sportConfigFilter,
  ageRange,
  levels,
  groups,
  sportConfigs,
  terms,
  text,
  viewMode,
  isPending,
  selectedCount,
  onSubmit,
  onQueryChange,
  onStatusChange,
  onLevelChange,
  onGroupChange,
  onSportConfigChange,
  onAgeRangeChange,
  onClearFilters,
  onViewModeChange,
  onExportCSV,
  onClearSelection,
  onBatchAction,
  onCreate,
  onImportClick,
}: {
  query: string;
  statusFilter: string;
  levelFilter: string;
  groupFilter: string;
  sportConfigFilter: string;
  ageRange: AgeRange;
  levels: string[];
  groups: GroupOption[];
  sportConfigs: SportConfigOption[];
  terms: AthleteTerms;
  text: AthleteCommonText;
  viewMode: ViewMode;
  isPending: boolean;
  selectedCount: number;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onQueryChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onLevelChange: (value: string) => void;
  onGroupChange: (value: string) => void;
  onSportConfigChange: (value: string) => void;
  onAgeRangeChange: (range: AgeRange) => void;
  onClearFilters: () => void;
  onViewModeChange: (mode: ViewMode) => void;
  onExportCSV: () => void;
  onClearSelection: () => void;
  onBatchAction: (action: string) => void;
  onCreate: () => void;
  onImportClick: () => void;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-zaltyko-mist bg-white p-5 shadow-soft lg:flex-row lg:items-center lg:justify-between">
      <form className="flex flex-1 flex-wrap items-center gap-3" onSubmit={onSubmit}>
        <label htmlFor="athletes-search" className="sr-only">
          Buscar {terms.athletes.toLowerCase()} por nombre
        </label>
        <input
          id="athletes-search"
          type="search"
          placeholder={`${text.search} por nombre`}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          className="min-h-11 min-w-[200px] flex-1 rounded-card border border-zaltyko-mist bg-white px-3 py-2 text-sm focus:border-zaltyko-teal focus:outline-none focus:ring-4 focus:ring-zaltyko-teal/15"
        />
        <label htmlFor="athletes-status-filter" className="sr-only">
          Filtrar por estado
        </label>
        <select
          id="athletes-status-filter"
          value={statusFilter}
          onChange={(event) => onStatusChange(event.target.value)}
          className="min-h-11 min-w-[160px] rounded-card border border-zaltyko-mist bg-white px-3 py-2 text-sm focus:border-zaltyko-teal focus:outline-none focus:ring-4 focus:ring-zaltyko-teal/15"
        >
          <option value="">Estado</option>
          {athleteStatusOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <label htmlFor="athletes-level-filter" className="sr-only">
          Filtrar por nivel
        </label>
        <select
          id="athletes-level-filter"
          value={levelFilter}
          onChange={(event) => onLevelChange(event.target.value)}
          className="min-h-11 min-w-[160px] rounded-card border border-zaltyko-mist bg-white px-3 py-2 text-sm focus:border-zaltyko-teal focus:outline-none focus:ring-4 focus:ring-zaltyko-teal/15"
        >
          <option value="">Nivel</option>
          {levels.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
        <label htmlFor="athletes-group-filter" className="sr-only">
          Filtrar por {terms.group.toLowerCase()}
        </label>
        <select
          id="athletes-group-filter"
          value={groupFilter}
          onChange={(event) => onGroupChange(event.target.value)}
          className="min-h-11 min-w-[180px] rounded-card border border-zaltyko-mist bg-white px-3 py-2 text-sm focus:border-zaltyko-teal focus:outline-none focus:ring-4 focus:ring-zaltyko-teal/15"
        >
          <option value="">{terms.group} principal</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
        <label htmlFor="athletes-sport-config-filter" className="sr-only">
          Filtrar por rama deportiva
        </label>
        <select
          id="athletes-sport-config-filter"
          value={sportConfigFilter}
          onChange={(event) => onSportConfigChange(event.target.value)}
          className="min-h-11 min-w-[210px] rounded-card border border-zaltyko-mist bg-white px-3 py-2 text-sm focus:border-zaltyko-teal focus:outline-none focus:ring-4 focus:ring-zaltyko-teal/15"
        >
          <option value="">Todas las ramas</option>
          {sportConfigs.map((config) => (
            <option key={config.id} value={config.id}>
              {config.branchName} · {config.disciplineName}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          <label htmlFor="athletes-age-min" className="sr-only">
            Edad minima
          </label>
          <input
            id="athletes-age-min"
            type="number"
            placeholder="Edad min"
            min="1"
            max="99"
            value={ageRange.min ?? ""}
            onChange={(event) =>
              onAgeRangeChange({ ...ageRange, min: event.target.value ? parseInt(event.target.value) : undefined })
            }
            className="min-h-11 w-20 rounded-card border border-zaltyko-mist bg-white px-2 py-2 text-sm focus:border-zaltyko-teal focus:outline-none focus:ring-4 focus:ring-zaltyko-teal/15"
          />
          <span className="text-muted-foreground">-</span>
          <label htmlFor="athletes-age-max" className="sr-only">
            Edad maxima
          </label>
          <input
            id="athletes-age-max"
            type="number"
            placeholder="Edad max"
            min="1"
            max="99"
            value={ageRange.max ?? ""}
            onChange={(event) =>
              onAgeRangeChange({ ...ageRange, max: event.target.value ? parseInt(event.target.value) : undefined })
            }
            className="min-h-11 w-20 rounded-card border border-zaltyko-mist bg-white px-2 py-2 text-sm focus:border-zaltyko-teal focus:outline-none focus:ring-4 focus:ring-zaltyko-teal/15"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="min-h-10 rounded-full bg-zaltyko-teal px-4 py-2 text-xs font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
        >
          Filtrar
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onStatusChange("active")}
            className="min-h-10 rounded-full border border-zaltyko-teal/40 bg-zaltyko-teal/10 px-3 py-2 text-xs font-medium text-zaltyko-teal hover:bg-zaltyko-teal/15"
          >
            Activos
          </button>
          <button
            type="button"
            onClick={() => onStatusChange("trial")}
            className="min-h-10 rounded-full border border-zaltyko-indigo/30 bg-zaltyko-indigo/10 px-3 py-2 text-xs font-medium text-zaltyko-indigo hover:bg-zaltyko-indigo/15"
          >
            Prueba
          </button>
          <button
            type="button"
            onClick={onClearFilters}
            className="min-h-10 rounded-full border border-zaltyko-mist bg-white px-3 py-2 text-xs text-zaltyko-text-secondary hover:bg-zaltyko-white"
          >
            Limpiar
          </button>
        </div>
      </form>

      <div className="flex items-center gap-3">
        <div className="flex items-center rounded-xl border border-zaltyko-mist bg-white p-1 shadow-soft">
          <button
            type="button"
            onClick={() => onViewModeChange("table")}
            className={`rounded-lg p-2 ${viewMode === "table" ? "bg-zaltyko-teal text-white" : "text-slate-500 hover:bg-zaltyko-white"}`}
            title="Vista de tabla"
          >
            <List className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange("kanban")}
            className={`rounded-lg p-2 ${viewMode === "kanban" ? "bg-zaltyko-teal text-white" : "text-slate-500 hover:bg-zaltyko-white"}`}
            title="Vista Kanban"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={onImportClick}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-zaltyko-indigo bg-white px-3 py-2 text-sm font-medium text-zaltyko-indigo hover:bg-zaltyko-indigo/5"
        >
          <Upload className="mr-2 h-4 w-4" />
          Importar CSV
        </button>

        <button
          type="button"
          onClick={onExportCSV}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-zaltyko-indigo bg-white px-3 py-2 text-sm font-medium text-zaltyko-indigo hover:bg-zaltyko-indigo/5"
        >
          <Download className="mr-2 h-4 w-4" />
          Exportar
        </button>

        {selectedCount > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-zaltyko-teal/40 bg-zaltyko-teal/10 px-3 py-2">
            <span className="text-sm font-medium">{selectedCount} seleccionados</span>
            <select
              aria-label="Accion por lote"
              className="rounded-lg border border-zaltyko-mist bg-white px-2 py-1 text-xs"
              defaultValue=""
              onChange={(event) => {
                onBatchAction(event.target.value);
                event.target.value = "";
              }}
            >
              <option value="">Acciones...</option>
              <option value="delete">{text.delete}</option>
              <option value="export">Exportar seleccionados</option>
              <option value="message">Enviar mensaje</option>
            </select>
            <button
              type="button"
              onClick={onClearSelection}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {text.cancel}
            </button>
          </div>
        )}

        <TooltipOnboarding
          tooltipId="tooltip_add_athlete"
          message={`Añade al menos 5 ${terms.athletes.toLowerCase()} clave para ver todo el valor del sistema.`}
        >
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-zaltyko-teal px-4 py-2 text-sm font-semibold text-white shadow-soft hover:bg-primary-dark"
          >
            Nuevo {terms.athlete.toLowerCase()}
          </button>
        </TooltipOnboarding>
      </div>
    </section>
  );
}

export function AthletesEmptyState({
  hasActiveFilters,
  terms,
  onCreate,
  onImportClick,
}: {
  hasActiveFilters: boolean;
  terms: AthleteTerms;
  onCreate: () => void;
  onImportClick: () => void;
}) {
  return (
    <EmptyState
      icon={Users}
      title={
        hasActiveFilters
          ? `No hay ${terms.athletes.toLowerCase()} que coincidan con los filtros`
          : `Trae a tus ${terms.athletes.toLowerCase()}`
      }
      description={
        hasActiveFilters
          ? "Intenta ajustar los filtros de búsqueda"
          : `Importa tu Excel en un minuto o crea la primera ficha a mano.`
      }
      action={
        !hasActiveFilters ? (
          <button
            type="button"
            onClick={onImportClick}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-zaltyko-indigo bg-white px-4 py-2 text-sm font-semibold text-zaltyko-indigo shadow-soft transition-all hover:bg-zaltyko-indigo/5"
          >
            Importar CSV
          </button>
        ) : undefined
      }
      secondaryAction={
        !hasActiveFilters ? (
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-zaltyko-teal px-4 py-2 text-sm font-semibold text-white shadow-soft transition-all hover:bg-primary-dark"
          >
            Crear primer {terms.athlete.toLowerCase()}
          </button>
        ) : undefined
      }
    />
  );
}

export function AthletesDataTable({
  academyId,
  athletes,
  allAthletesCount,
  filteredCount,
  currentPage,
  totalPages,
  itemsPerPage,
  selectedAthletes,
  athletesWithAlerts,
  sportConfigNameById,
  terms,
  sortBy,
  sortOrder,
  onToggleSelectAll,
  onToggleSelectAthlete,
  onSortChange,
  onEdit,
  onPageChange,
}: {
  academyId: string;
  athletes: AthleteListItem[];
  allAthletesCount: number;
  filteredCount: number;
  currentPage: number;
  totalPages: number;
  itemsPerPage: number;
  selectedAthletes: Set<string>;
  athletesWithAlerts: Set<string>;
  sportConfigNameById: Map<string, string>;
  terms: AthleteTerms;
  sortBy: SortBy;
  sortOrder: SortOrder;
  onToggleSelectAll: () => void;
  onToggleSelectAthlete: (id: string) => void;
  onSortChange: (sortBy: SortBy) => void;
  onEdit: (athlete: AthleteListItem) => void;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-zaltyko-mist bg-white shadow-soft">
      <table className="min-w-full divide-y divide-slate-100 text-sm">
        <thead className="bg-zaltyko-white">
          <tr className="text-left text-xs uppercase tracking-[0.05em] text-slate-600">
            <th className="w-8 px-2 py-3 font-medium">
              <button
                type="button"
                onClick={onToggleSelectAll}
                className="p-1 hover:text-zaltyko-teal"
                aria-label={`Seleccionar todos los ${terms.athletes.toLowerCase()}`}
              >
                {selectedAthletes.size === allAthletesCount && allAthletesCount > 0 ? (
                  <CheckSquare className="h-4 w-4" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
              </button>
            </th>
            <th className="px-4 py-3 font-medium">
              <SortableHeader active={sortBy === "name"} order={sortOrder} onClick={() => onSortChange("name")}>
                Nombre
              </SortableHeader>
            </th>
            <th className="px-4 py-3 font-medium">Nivel</th>
            <th className="px-4 py-3 font-medium">Estado</th>
            <th className="px-4 py-3 text-right font-medium">
              <SortableHeader active={sortBy === "age"} order={sortOrder} alignRight onClick={() => onSortChange("age")}>
                Edad
              </SortableHeader>
            </th>
            <th className="px-4 py-3 text-right font-medium">Familia</th>
            <th className="px-4 py-3 font-medium">{terms.group} principal</th>
            <th className="px-4 py-3 text-right font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white text-zaltyko-navy">
          {athletes.map((athlete) => (
            <AthletesTableRow
              key={athlete.id}
              academyId={academyId}
              athlete={athlete}
              selected={selectedAthletes.has(athlete.id)}
              hasAlert={athletesWithAlerts.has(athlete.id)}
              sportConfigName={athlete.primarySportConfigId ? sportConfigNameById.get(athlete.primarySportConfigId) : undefined}
              terms={terms}
              onToggleSelect={() => onToggleSelectAthlete(athlete.id)}
              onEdit={() => onEdit(athlete)}
            />
          ))}
        </tbody>
      </table>
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-zaltyko-mist px-4 py-3">
          <p className="text-sm text-muted-foreground">
            Mostrando {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredCount)} de{" "}
            {filteredCount} {terms.athletes.toLowerCase()}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
            >
              Anterior
            </Button>
            <span className="text-sm">
              {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SortableHeader({
  active,
  order,
  alignRight = false,
  onClick,
  children,
}: {
  active: boolean;
  order: SortOrder;
  alignRight?: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${alignRight ? "ml-auto" : ""} flex items-center gap-1 hover:text-zaltyko-teal`}
    >
      {children}
      {active && (order === "asc" ? " ↑" : " ↓")}
    </button>
  );
}

function AthletesTableRow({
  academyId,
  athlete,
  selected,
  hasAlert,
  sportConfigName,
  terms,
  onToggleSelect,
  onEdit,
}: {
  academyId: string;
  athlete: AthleteListItem;
  selected: boolean;
  hasAlert: boolean;
  sportConfigName?: string;
  terms: AthleteTerms;
  onToggleSelect: () => void;
  onEdit: () => void;
}) {
  return (
    <tr className="odd:bg-white even:bg-zaltyko-white/40 transition-colors hover:bg-zaltyko-teal/[0.05]">
      <td className="px-2 py-3">
        <button
          type="button"
          onClick={onToggleSelect}
          className="p-1 hover:text-zaltyko-teal"
          aria-label={`${selected ? "Deseleccionar" : "Seleccionar"} ${athlete.name}`}
        >
          {selected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
        </button>
      </td>
      <td className="px-4 py-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Link
              href={`/app/${academyId}/athletes/${athlete.id}`}
              className="font-semibold text-zaltyko-teal transition hover:underline"
            >
              {athlete.name}
            </Link>
            {hasAlert && <AlertBadge type="attendance" severity="medium" className="text-[10px]" />}
          </div>
          {athlete.dob && (
            <p className="text-xs text-muted-foreground">
              Nacido el {athlete.dob.slice(0, 10)}
            </p>
          )}
          {athlete.primarySportConfigId && (
            <span className="inline-flex w-fit rounded-full border border-zaltyko-mist bg-zaltyko-white px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              {sportConfigName ?? "Configuración deportiva"}
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">{athlete.level ?? "—"}</td>
      <td className="px-4 py-3 capitalize">{athlete.status}</td>
      <td className="px-4 py-3 text-right tabular-nums">{athlete.age ?? "—"}</td>
      <td className="px-4 py-3 text-right tabular-nums">{Number(athlete.guardianCount ?? 0)}</td>
      <td className="px-4 py-3">
        {athlete.groupName ? (
          <span
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold"
            style={athlete.groupColor ? { borderColor: athlete.groupColor, color: athlete.groupColor } : undefined}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor: athlete.groupColor ?? "currentColor",
              }}
            />
            {athlete.groupName}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Sin {terms.group.toLowerCase()}</span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <button type="button" onClick={onEdit} className="text-xs font-semibold text-zaltyko-teal hover:underline">
          Editar
        </button>
      </td>
    </tr>
  );
}
