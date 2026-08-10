"use client";

import * as React from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { CheckSquare, Download, LayoutGrid, List, Square, Upload, Users } from "lucide-react";

import { athleteStatusOptions } from "@/lib/athletes/constants";
import { EmptyState } from "@/components/ui/empty-state";
import { AlertBadge } from "@/components/shared/AlertBadge";
import { TooltipOnboarding } from "@/components/tooltips/TooltipOnboarding";
import {
  DataTable,
  type DataTableColumn,
  type DataTableSelection,
  type DataTableSortState,
} from "@/components/ui/data-table";
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
  onToggleSelectAthlete,
  onSortChange,
  onEdit,
  onPageChange,
}: {
  academyId: string;
  athletes: AthleteListItem[];
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
  onToggleSelectAthlete: (id: string) => void;
  onSortChange: (sortBy: SortBy) => void;
  onEdit: (athlete: AthleteListItem) => void;
  onPageChange: (page: number) => void;
}) {
  // El `onSortChange` externo alterna asc/desc; el DataTable maneja el toggle
  // cuando recibe onChange. Si el usuario cambia de columna, resetea a asc.
  const handleSortChange = React.useCallback(
    (column: string) => {
      // El DataTable emite el column id; solo permitimos valores válidos de
      // SortBy (los ids de columna están restringidos a esos tres valores).
      if (column !== "name" && column !== "age" && column !== "createdAt") {
        return;
      }
      if (sortBy === column && sortOrder === "asc") {
        onSortChange(column); // toggle a desc
      } else if (sortBy !== column) {
        onSortChange(column); // nueva columna → asc
      }
    },
    [sortBy, sortOrder, onSortChange]
  );

  const sortState: DataTableSortState = {
    column: sortBy,
    direction: sortOrder,
  };

  // allSelected: comportamiento histórico. Se conserva la semántica del
  // botón "seleccionar todos" de la implementación previa: solo marca
  // checked cuando TODAS las filas visibles (paginadas) están seleccionadas.
  const allVisibleSelected =
    athletes.length > 0 && athletes.every((a) => selectedAthletes.has(a.id));
  const someVisibleSelected =
    !allVisibleSelected && athletes.some((a) => selectedAthletes.has(a.id));

  const selectionConfig: DataTableSelection<AthleteListItem> = {
    selected: selectedAthletes,
    getKey: (row) => row.id,
    onToggle: onToggleSelectAthlete,
    onToggleAll: () => {
      if (allVisibleSelected) {
        athletes.forEach((a) => onToggleSelectAthlete(a.id));
      } else {
        athletes.forEach((a) => {
          if (!selectedAthletes.has(a.id)) onToggleSelectAthlete(a.id);
        });
      }
    },
    allSelected: allVisibleSelected,
    someSelected: someVisibleSelected,
    rowLabel: (row) => row.name,
  };

  const columns: DataTableColumn<AthleteListItem>[] = React.useMemo(
    () => [
      {
        id: "name",
        header: "Nombre",
        sortable: true,
        sortValue: (row) => row.name,
        cell: (row) => (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-zaltyko-teal">{row.name}</span>
              {athletesWithAlerts.has(row.id) && (
                <AlertBadge type="attendance" severity="medium" className="text-[10px]" />
              )}
            </div>
            {row.dob && (
              <p className="text-xs text-muted-foreground">
                Nacido el {row.dob.slice(0, 10)}
              </p>
            )}
            {row.primarySportConfigId && (
              <span className="inline-flex w-fit rounded-full border border-zaltyko-mist bg-zaltyko-white px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                {sportConfigNameById.get(row.primarySportConfigId) ??
                  "Configuración deportiva"}
              </span>
            )}
          </div>
        ),
      },
      {
        id: "level",
        header: "Nivel",
        cell: (row) => row.level ?? "—",
      },
      {
        id: "status",
        header: "Estado",
        cell: (row) => <span className="capitalize">{row.status}</span>,
      },
      {
        id: "age",
        header: "Edad",
        sortable: true,
        sortValue: (row) => row.age,
        align: "right",
        className: "tabular-nums",
        cell: (row) => row.age ?? "—",
      },
      {
        id: "guardianCount",
        header: "Familia",
        align: "right",
        className: "tabular-nums",
        cell: (row) => Number(row.guardianCount ?? 0),
      },
      {
        id: "group",
        header: `${terms.group} principal`,
        cell: (row) =>
          row.groupName ? (
            <span
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold"
              style={
                row.groupColor
                  ? { borderColor: row.groupColor, color: row.groupColor }
                  : undefined
              }
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: row.groupColor ?? "currentColor" }}
              />
              {row.groupName}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              Sin {terms.group.toLowerCase()}
            </span>
          ),
      },
      {
        id: "actions",
        header: <span className="sr-only">Acciones</span>,
        align: "right",
        cell: (row) => (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onEdit(row);
            }}
            className="text-xs font-semibold text-zaltyko-teal hover:underline"
          >
            Editar
          </button>
        ),
      },
    ],
    [athletesWithAlerts, sportConfigNameById, terms.group, onEdit]
  );

  const totalPagesSafe = Math.max(1, totalPages);

  return (
    <div className="overflow-hidden rounded-[22px] border border-slate-200/80 bg-white shadow-[0_18px_50px_-32px_rgba(15,23,42,0.45)]">
      <DataTable<AthleteListItem>
        data={athletes}
        columns={columns}
        getRowKey={(row) => row.id}
        ariaLabel={`Listado de ${terms.athletes.toLowerCase()}`}
        itemLabel={terms.athletes.toLowerCase()}
        sort={sortState}
        onSortChange={handleSortChange}
        selection={selectionConfig}
        pagination={
          totalPagesSafe > 1
            ? {
                page: currentPage,
                pageSize: itemsPerPage,
              }
            : undefined
        }
        onPaginationChange={(next) => onPageChange(next.page)}
        pageCount={totalPagesSafe}
        totalCount={filteredCount}
        rowHref={(row) => `/app/${academyId}/athletes/${row.id}`}
        rowClassName={(row) =>
          athletesWithAlerts.has(row.id)
            ? "[&_td]:bg-amber-50/30"
            : undefined
        }
        mobileCard={(row) => (
          <AthleteMobileCard
            academyId={academyId}
            athlete={row}
            selected={selectedAthletes.has(row.id)}
            hasAlert={athletesWithAlerts.has(row.id)}
            sportConfigName={
              row.primarySportConfigId
                ? sportConfigNameById.get(row.primarySportConfigId)
                : undefined
            }
            terms={terms}
            onToggleSelect={() => onToggleSelectAthlete(row.id)}
            onEdit={() => onEdit(row)}
          />
        )}
      />
    </div>
  );
}

function AthleteMobileCard({
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
    <article className="p-4">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onToggleSelect}
          className="mt-0.5 shrink-0 rounded-lg p-1 text-slate-400 hover:text-zaltyko-teal"
          aria-label={`${selected ? "Deseleccionar" : "Seleccionar"} ${athlete.name}`}
        >
          {selected ? <CheckSquare className="h-5 w-5 text-zaltyko-teal" /> : <Square className="h-5 w-5" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link href={`/app/${academyId}/athletes/${athlete.id}`} className="truncate font-display text-base font-bold text-slate-950 hover:text-zaltyko-teal">
                {athlete.name}
              </Link>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>{athlete.level ?? "Sin nivel"}</span>
                <span aria-hidden="true">·</span>
                <span className="capitalize">{athlete.status}</span>
                {athlete.age !== null && <><span aria-hidden="true">·</span><span>{athlete.age} años</span></>}
              </div>
            </div>
            {hasAlert && <AlertBadge type="attendance" severity="medium" className="shrink-0 text-[10px]" />}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            {athlete.groupName ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: athlete.groupColor ?? "#94a3b8" }} />
                {athlete.groupName}
              </span>
            ) : <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">Sin {terms.group.toLowerCase()}</span>}
            <span className="rounded-full bg-slate-50 px-2.5 py-1 text-slate-500">{athlete.guardianCount ?? 0} familia</span>
            {sportConfigName && <span className="rounded-full bg-teal-50 px-2.5 py-1 font-semibold text-teal-700">{sportConfigName}</span>}
          </div>
          <div className="mt-3 flex justify-end">
            <button type="button" onClick={onEdit} className="min-h-9 rounded-lg px-3 text-xs font-bold text-zaltyko-teal hover:bg-teal-50">Editar ficha</button>
          </div>
        </div>
      </div>
    </article>
  );
}
