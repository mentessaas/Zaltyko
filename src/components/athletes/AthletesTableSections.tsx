"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  CheckSquare,
  ChevronDown,
  Download,
  LayoutGrid,
  List,
  Search,
  Square,
  RotateCcw,
  Upload,
  Users,
} from "lucide-react";

import { athleteStatusOptions, getAthleteStatusLabel } from "@/lib/athletes/constants";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { AlertBadge } from "@/components/shared/AlertBadge";
import { TooltipOnboarding } from "@/components/tooltips/TooltipOnboarding";
import type { SportConfigOption } from "@/components/groups/types";
import type { AthleteListItem, GroupOption } from "@/types";
import { cn } from "@/lib/utils";
import { groupInk } from "@/lib/mat/group-ink";

const birthDateFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "2015-05-01" → "1 may 2015"; UTC para que servidor y cliente coincidan. */
function formatBirthDate(dob: string): string {
  const date = new Date(`${dob.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? dob.slice(0, 10) : birthDateFormatter.format(date);
}

const STATUS_TONE: Record<string, { dot: string; badge: string }> = {
  active: { dot: "bg-zaltyko-teal", badge: "border-zaltyko-teal/25 bg-zaltyko-teal/10 text-zaltyko-primary-dark" },
  trial: { dot: "bg-zaltyko-indigo", badge: "border-zaltyko-indigo/25 bg-zaltyko-indigo/10 text-zaltyko-indigo" },
};
const STATUS_TONE_MUTED = { dot: "bg-slate-400", badge: "border-border bg-muted text-muted-foreground" };

/**
 * Estado con punto indicador + texto, patrón de los status badges de
 * @spaceui (hallados con ui-indexador). El texto siempre dice el estado; el
 * color solo refuerza.
 */
function AthleteStatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? STATUS_TONE_MUTED;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-0.5 text-xs font-semibold",
        tone.badge
      )}
    >
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
      {getAthleteStatusLabel(status)}
    </span>
  );
}

export interface AthleteTerms {
  athlete: string;
  athletes: string;
  group: string;
}

export interface AthleteCommonText {
  search: string;
  cancel: string;
  archive: string;
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
  allowArchive,
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
  athleteCount,
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
  allowArchive: boolean;
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
  /** Total de la academia: el aviso de onboarding solo tiene sentido con < 5. */
  athleteCount?: number;
}) {
  // Patrón compacto: filtros frecuentes en una línea, el resto colapsable.
  const [showAdvanced, setShowAdvanced] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const advancedActive =
    Boolean(groupFilter) ||
    Boolean(sportConfigFilter) ||
    ageRange.min !== undefined ||
    ageRange.max !== undefined;
  const submit = () => formRef.current?.requestSubmit();

  const selectClass =
    "min-h-11 rounded-md border border-ramp-300 bg-white px-3 py-2 text-sm text-mat-night transition-colors hover:border-mat focus:border-mat focus:outline-none focus:ring-2 focus:ring-mat/25";
  const showOnboardingTip = athleteCount !== undefined && athleteCount < 5;

  // Barra de gimnastas «Magnesio sobre tapiz»: sin tarjeta, apoyada en una
  // regla. Fila 1: búsqueda, filtros y estado rápido; a la derecha, vistas y
  // acciones. Los filtros avanzados se despliegan debajo.
  return (
    <section aria-label="Buscar y filtrar" className="border-b border-chalk-line pb-4">
      <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        {/* Fila 1: búsqueda + filtros frecuentes + avanzados + vistas */}
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <label htmlFor="athletes-search" className="sr-only">
              Buscar {terms.athletes.toLowerCase()} por nombre
            </label>
            <input
              id="athletes-search"
              type="search"
              placeholder={`${text.search} por nombre…`}
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              className="min-h-11 w-full rounded-card border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-zaltyko-teal focus:outline-none focus:ring-4 focus:ring-zaltyko-teal/15"
            />
          </div>

          <label htmlFor="athletes-status-filter" className="sr-only">
            Filtrar por estado
          </label>
          <select
            id="athletes-status-filter"
            value={statusFilter}
            onChange={(event) => {
              onStatusChange(event.target.value);
              submit();
            }}
            className={selectClass}
          >
            <option value="">Estado</option>
            {athleteStatusOptions.map((option) => (
              <option key={option} value={option}>
                {getAthleteStatusLabel(option)}
              </option>
            ))}
          </select>

          <label htmlFor="athletes-level-filter" className="sr-only">
            Filtrar por nivel
          </label>
          <select
            id="athletes-level-filter"
            value={levelFilter}
            onChange={(event) => {
              onLevelChange(event.target.value);
              submit();
            }}
            className={selectClass}
          >
            <option value="">Nivel</option>
            {levels.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setShowAdvanced((prev) => !prev)}
            aria-expanded={showAdvanced}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 rounded-card border px-3 py-2 text-sm font-medium transition-colors",
              advancedActive
                ? "border-zaltyko-teal/50 bg-zaltyko-teal/10 text-zaltyko-teal"
                : "border-border bg-card text-muted-foreground hover:border-zaltyko-teal/50 hover:text-foreground"
            )}
          >
            Más filtros
            {advancedActive && (
              <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-zaltyko-teal text-xs font-bold text-white">
                •
              </span>
            )}
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 ${showAdvanced ? "rotate-180" : ""}`}
            />
          </button>

          <div role="group" aria-label="Estado rápido" className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                onStatusChange("active");
                submit();
              }}
              className={`min-h-11 rounded-md px-3 text-sm font-semibold transition-colors ${
                statusFilter === "active" ? "bg-mat text-white" : "text-mat hover:bg-mat-wash"
              }`}
            >
              Activos
            </button>
            <button
              type="button"
              onClick={() => {
                onStatusChange("trial");
                submit();
              }}
              className={`min-h-11 rounded-md px-3 text-sm font-semibold transition-colors ${
                statusFilter === "trial" ? "bg-mat text-white" : "text-mat hover:bg-mat-wash"
              }`}
            >
              Prueba
            </button>
            {statusFilter && (
              <button
                type="button"
                onClick={() => {
                  onStatusChange("");
                  submit();
                }}
                className="min-h-11 rounded-md px-2 text-xs font-medium text-ramp-500 transition-colors hover:text-mat-night"
              >
                Quitar estado
              </button>
            )}
          </div>

        </div>
          <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center overflow-hidden rounded-md border border-ramp-300 bg-white">
            <button
              type="button"
              onClick={() => onViewModeChange("table")}
              className={`flex h-11 w-11 items-center justify-center rounded-sm transition-colors ${viewMode === "table" ? "bg-mat text-white" : "text-muted-foreground hover:bg-muted"}`}
              title="Vista de tabla"
              aria-label="Vista de tabla"
              aria-pressed={viewMode === "table"}
            >
              <List className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("kanban")}
              className={`flex h-11 w-11 items-center justify-center rounded-sm transition-colors ${viewMode === "kanban" ? "bg-mat text-white" : "text-muted-foreground hover:bg-muted"}`}
              title="Vista Kanban"
              aria-label="Vista Kanban"
              aria-pressed={viewMode === "kanban"}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
  
            {selectedCount > 0 && (
              <div className="flex items-center gap-2 rounded-md bg-mat-wash px-3 py-2">
                <span className="text-sm font-medium text-foreground">{selectedCount} seleccionados</span>
                <select
                  aria-label="Accion por lote"
                  className="rounded-lg border border-border bg-card px-2 py-1 text-xs"
                  defaultValue=""
                  onChange={(event) => {
                    onBatchAction(event.target.value);
                    event.target.value = "";
                  }}
                >
                  <option value="">Acciones…</option>
                  {allowArchive && <option value="archive">{text.archive}</option>}
                  <option value="export">Exportar seleccionados</option>
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

            <button
              type="button"
              onClick={onImportClick}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-ramp-300 bg-white px-3 text-sm font-semibold text-mat-night transition-colors hover:border-mat hover:text-mat"
            >
              <Upload className="mr-2 h-4 w-4" />
              Importar CSV
            </button>

            <button
              type="button"
              onClick={onExportCSV}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-ramp-300 bg-white px-3 text-sm font-semibold text-mat-night transition-colors hover:border-mat hover:text-mat"
            >
              <Download className="mr-2 h-4 w-4" />
              Exportar
            </button>

            {(() => {
              const createButton = (
                <button
                  type="button"
                  onClick={onCreate}
                  className="inline-flex min-h-11 items-center justify-center rounded-md bg-mat px-4 text-sm font-bold text-white transition-colors hover:bg-mat-deep"
                >
                  <Users aria-hidden className="mr-2 h-4 w-4" />
                  Añadir {terms.athlete.toLowerCase()}
                </button>
              );
              // El aviso de los 5 primeros solo mientras de verdad haya menos de 5.
              return showOnboardingTip ? (
                <TooltipOnboarding
                  tooltipId="tooltip_add_athlete"
                  message={`Añade al menos 5 ${terms.athletes.toLowerCase()} clave para ver todo el valor del sistema.`}
                >
                  {createButton}
                </TooltipOnboarding>
              ) : (
                createButton
              );
            })()}
          </div>
        </div>

        {/* Fila 2 (colapsable): filtros avanzados */}
        {showAdvanced && (
          <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-dashed border-border bg-background/60 p-3">
            <label htmlFor="athletes-group-filter" className="sr-only">
              Filtrar por {terms.group.toLowerCase()}
            </label>
            <select
              id="athletes-group-filter"
              value={groupFilter}
              onChange={(event) => onGroupChange(event.target.value)}
              className={selectClass}
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
              className={selectClass}
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
                placeholder="Edad mín."
                min="1"
                max="99"
                value={ageRange.min ?? ""}
                onChange={(event) =>
                  onAgeRangeChange({ ...ageRange, min: event.target.value ? parseInt(event.target.value) : undefined })
                }
                className="min-h-11 w-20 rounded-card border border-border bg-card px-2 py-2 text-sm text-foreground focus:border-zaltyko-teal focus:outline-none focus:ring-4 focus:ring-zaltyko-teal/15"
              />
              <span className="text-muted-foreground">–</span>
              <label htmlFor="athletes-age-max" className="sr-only">
                Edad maxima
              </label>
              <input
                id="athletes-age-max"
                type="number"
                placeholder="Edad máx."
                min="1"
                max="99"
                value={ageRange.max ?? ""}
                onChange={(event) =>
                  onAgeRangeChange({ ...ageRange, max: event.target.value ? parseInt(event.target.value) : undefined })
                }
                className="min-h-11 w-20 rounded-card border border-border bg-card px-2 py-2 text-sm text-foreground focus:border-zaltyko-teal focus:outline-none focus:ring-4 focus:ring-zaltyko-teal/15"
              />
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="min-h-11 rounded-md bg-mat px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-mat-deep disabled:opacity-60"
            >
              {isPending ? "Filtrando…" : "Aplicar"}
            </button>
            <button
              type="button"
              onClick={() => {
                onClearFilters();
                setShowAdvanced(false);
              }}
              className="min-h-11 rounded-md border border-ramp-300 bg-white px-3 py-2 text-sm text-ramp-600 transition-colors hover:bg-muted hover:text-foreground"
            >
              Limpiar todo
            </button>
          </div>
        )}

      </form>
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
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-zaltyko-indigo/60 bg-card px-4 py-2 text-sm font-semibold text-zaltyko-indigo shadow-soft transition-all hover:bg-zaltyko-indigo/10"
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
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-zaltyko-teal px-4 py-2 text-sm font-semibold text-white shadow-soft transition-all hover:bg-zaltyko-primary-dark"
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
  onRestore,
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
  onRestore: (athlete: AthleteListItem) => void;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="overflow-hidden rounded-[22px] border border-border bg-card shadow-[0_18px_50px_-32px_rgba(15,23,42,0.45)]">
      <div className="divide-y divide-border md:hidden">
        {athletes.map((athlete) => (
          <AthleteMobileCard
            key={athlete.id}
            academyId={academyId}
            athlete={athlete}
            selected={selectedAthletes.has(athlete.id)}
            hasAlert={athletesWithAlerts.has(athlete.id)}
            sportConfigName={athlete.primarySportConfigId ? sportConfigNameById.get(athlete.primarySportConfigId) : undefined}
            terms={terms}
            onToggleSelect={() => onToggleSelectAthlete(athlete.id)}
            onEdit={() => onEdit(athlete)}
            onRestore={() => onRestore(athlete)}
          />
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted/50">
          <tr className="text-left text-xs uppercase tracking-[0.05em] text-muted-foreground">
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
            <th className="px-3 py-3 font-medium">
              <SortableHeader active={sortBy === "name"} order={sortOrder} onClick={() => onSortChange("name")}>
                Nombre
              </SortableHeader>
            </th>
            <th className="px-3 py-3 font-medium">Nivel</th>
            <th className="px-3 py-3 font-medium">Estado</th>
            <th className="px-3 py-3 text-right font-medium">
              <SortableHeader active={sortBy === "age"} order={sortOrder} alignRight onClick={() => onSortChange("age")}>
                Edad
              </SortableHeader>
            </th>
            <th className="px-3 py-3 text-right font-medium">Familia</th>
            <th className="px-3 py-3 font-medium">{terms.group} principal</th>
            <th className="px-3 py-3 text-right font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card text-foreground">
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
              onRestore={() => onRestore(athlete)}
            />
          ))}
        </tbody>
      </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-3 py-3">
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

function AthleteMobileCard({
  academyId,
  athlete,
  selected,
  hasAlert,
  sportConfigName,
  terms,
  onToggleSelect,
  onEdit,
  onRestore,
}: {
  academyId: string;
  athlete: AthleteListItem;
  selected: boolean;
  hasAlert: boolean;
  sportConfigName?: string;
  terms: AthleteTerms;
  onToggleSelect: () => void;
  onEdit: () => void;
  onRestore: () => void;
}) {
  return (
    <article className="p-4">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onToggleSelect}
          className="mt-0.5 shrink-0 rounded-lg p-1 text-muted-foreground hover:text-zaltyko-teal"
          aria-label={`${selected ? "Deseleccionar" : "Seleccionar"} ${athlete.name}`}
        >
          {selected ? <CheckSquare className="h-5 w-5 text-zaltyko-teal" /> : <Square className="h-5 w-5" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {athlete.status === "archived" ? (
                <span className="truncate font-display text-base font-bold text-foreground">{athlete.name}</span>
              ) : (
                <Link href={`/app/${academyId}/athletes/${athlete.id}`} className="truncate font-display text-base font-bold text-foreground hover:text-zaltyko-teal">
                  {athlete.name}
                </Link>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{athlete.level ?? "Sin nivel"}</span>
                <span aria-hidden="true">·</span>
                        <span>{getAthleteStatusLabel(athlete.status)}</span>
                {athlete.age !== null && <><span aria-hidden="true">·</span><span>{athlete.age} años</span></>}
              </div>
            </div>
            {hasAlert && <AlertBadge type="attendance" severity="medium" className="shrink-0 text-xs" />}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            {athlete.groupName ? (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 font-semibold text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: groupInk(athlete.groupColor, athlete.groupName ?? undefined) }} />
                {athlete.groupName}
              </span>
            ) : <span className="rounded-md bg-signal-wash px-2.5 py-1 font-semibold text-signal-ink">Sin {terms.group.toLowerCase()}</span>}
            <span className="rounded-md bg-muted px-2.5 py-1 text-muted-foreground">{athlete.guardianCount ?? 0} familia</span>
            {sportConfigName && <span className="rounded-md bg-mat-wash px-2.5 py-1 font-semibold text-mat-deep">{sportConfigName}</span>}
          </div>
          <div className="mt-3 flex justify-end">
            {athlete.status === "archived" ? (
              <button type="button" onClick={onRestore} className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-xs font-bold text-zaltyko-teal hover:bg-mat-wash">
                <RotateCcw className="h-3.5 w-3.5" />
                Restaurar
              </button>
            ) : (
              <button type="button" onClick={onEdit} className="min-h-11 rounded-md px-3 text-xs font-bold text-zaltyko-teal hover:bg-mat-wash">Editar ficha</button>
            )}
          </div>
        </div>
      </div>
    </article>
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
      // Preflight de Tailwind pone `text-transform: none` en <button>; sin
      // `uppercase` las cabeceras ordenables no coincidían con el resto.
      className={`${alignRight ? "ml-auto" : ""} flex items-center gap-1 uppercase tracking-[0.05em] hover:text-zaltyko-teal`}
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
  onRestore,
}: {
  academyId: string;
  athlete: AthleteListItem;
  selected: boolean;
  hasAlert: boolean;
  sportConfigName?: string;
  terms: AthleteTerms;
  onToggleSelect: () => void;
  onEdit: () => void;
  onRestore: () => void;
}) {
  return (
    <tr className="odd:bg-card even:bg-muted/40 transition-colors hover:bg-zaltyko-teal/[0.05]">
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
      <td className="px-3 py-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {athlete.status === "archived" ? (
              <span className="font-semibold text-foreground">{athlete.name}</span>
            ) : (
              <Link
                href={`/app/${academyId}/athletes/${athlete.id}`}
                className="font-semibold text-zaltyko-teal transition hover:underline"
              >
                {athlete.name}
              </Link>
            )}
            {hasAlert && <AlertBadge type="attendance" severity="medium" className="text-xs" />}
          </div>
          {athlete.dob && (
            <p className="whitespace-nowrap text-xs text-muted-foreground">
              Nacimiento: {formatBirthDate(athlete.dob)}
            </p>
          )}
          {athlete.primarySportConfigId && (
            <span className="inline-flex w-fit rounded-md border border-chalk-line bg-chalk px-2.5 py-1 text-xs font-medium text-ramp-600">
              {sportConfigName ?? "Configuración deportiva"}
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-3">{athlete.level ?? "—"}</td>
      <td className="px-3 py-3">
        <AthleteStatusBadge status={athlete.status} />
      </td>
      <td className="px-3 py-3 text-right tabular-nums">{athlete.age ?? "—"}</td>
      <td className="px-3 py-3 text-right tabular-nums">{Number(athlete.guardianCount ?? 0)}</td>
      <td className="px-3 py-3">
        {athlete.groupName ? (
          // El color del grupo lo elige la academia: va en el punto y el borde,
          // no en el texto, para no depender de su contraste sobre blanco.
          <span
            className="inline-flex max-w-[10rem] items-center gap-2 whitespace-nowrap rounded-md border border-chalk-line bg-card px-2.5 py-1 text-xs font-semibold text-foreground"
            title={athlete.groupName}
          >
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-full"
              style={{
                backgroundColor: groupInk(athlete.groupColor, athlete.groupName ?? undefined),
              }}
            />
            <span className="truncate">{athlete.groupName}</span>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Sin {terms.group.toLowerCase()}</span>
        )}
      </td>
      <td className="px-3 py-3 text-right">
        {athlete.status === "archived" ? (
          <button type="button" onClick={onRestore} className="inline-flex items-center gap-1 text-xs font-semibold text-zaltyko-teal hover:underline">
            <RotateCcw className="h-3.5 w-3.5" />
            Restaurar
          </button>
        ) : (
          <button type="button" onClick={onEdit} className="text-xs font-semibold text-zaltyko-teal hover:underline">
            Editar
          </button>
        )}
      </td>
    </tr>
  );
}
