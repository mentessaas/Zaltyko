"use client";

import * as React from "react";
import { FormEvent, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { CreateClassDialog } from "@/components/classes/CreateClassDialog";
import { EditClassDialog } from "@/components/classes/EditClassDialog";
import { RecurringIndicator } from "@/components/shared/RecurringIndicator";
import { AlertBadge } from "@/components/shared/AlertBadge";
import { useAcademyContext } from "@/hooks/use-academy-context";
import { getStarterClassPresets, getStarterGroupPresets } from "@/lib/specialization/operational-presets";
import type { SportConfigOption } from "@/components/groups/types";
import { getTerminologyForSportConfig } from "@/lib/sport-config/terminology";

const WEEKDAY_LABELS: Record<number, string> = {
  0: "Domingo",
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
};

interface CoachOption {
  id: string;
  name: string;
  email: string | null;
  sportConfigIds?: string[];
}

interface ClassItem {
  id: string;
  name: string;
  weekdays: number[];
  startTime: string | null;
  endTime: string | null;
  capacity: number | null;
  technicalFocus?: string | null;
  apparatus?: string[];
  sportConfigId?: string | null;
  autoGenerateSessions: boolean;
  allowsFreeTrial: boolean;
  waitingListEnabled: boolean;
  cancellationHoursBefore: number;
  cancellationPolicy: string;
  currentEnrollment?: number;
  createdAt: string | null;
  coaches: CoachOption[];
  groups: {
    id: string;
    name: string;
    color: string | null;
    sportConfigId?: string | null;
  }[];
}

interface ClassesTableViewProps {
  academyId: string;
  classes: ClassItem[];
  availableCoaches: CoachOption[];
  groupOptions: {
    id: string;
    name: string;
    color: string | null;
    sportConfigId?: string | null;
  }[];
  sportConfigs?: SportConfigOption[];
  filters: {
    q?: string;
    groupId?: string;
    sportConfigId?: string;
  };
}

export function ClassesTableView({
  academyId,
  classes,
  availableCoaches,
  groupOptions,
  sportConfigs = [],
  filters,
}: ClassesTableViewProps) {
  const { specialization } = useAcademyContext();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [query, setQuery] = useState(filters.q ?? "");
  const [groupFilter, setGroupFilter] = useState(filters.groupId ?? "");
  const [sportConfigFilter, setSportConfigFilter] = useState(filters.sportConfigId ?? "");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ClassItem | null>(null);
  const [isPending, startTransition] = useTransition();

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const params = new URLSearchParams(searchParams?.toString());
    if (query.trim()) {
      params.set("q", query.trim());
    } else {
      params.delete("q");
    }

    if (groupFilter) {
      params.set("group", groupFilter);
    } else {
      params.delete("group");
    }

    if (sportConfigFilter) {
      params.set("sportConfigId", sportConfigFilter);
    } else {
      params.delete("sportConfigId");
    }

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
      router.refresh();
    });
  };

  const handleRefresh = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  const handleDeleted = () => {
    setEditing(null);
    handleRefresh();
  };

  const formatSchedule = (item: ClassItem) => {
    const days =
      item.weekdays && item.weekdays.length > 0
        ? item.weekdays.map((day) => WEEKDAY_LABELS[day] ?? `Día ${day}`).join(", ")
        : "Sin día fijo";
    const time =
      item.startTime && item.endTime
        ? `${item.startTime} – ${item.endTime}`
        : item.startTime
        ? `Desde ${item.startTime}`
        : "Horario flexible";
    return `${days} · ${time}`;
  };

  const hasActiveFilters = filters.q || filters.groupId || filters.sportConfigId;
  const terms = getTerminologyForSportConfig(sportConfigs, sportConfigFilter || filters.sportConfigId);
  const classTerm = specialization.labels.classLabel;
  const classTermLower = classTerm.toLowerCase();
  const groupTermLower = terms.group.toLowerCase();
  const coachTermPluralLower = `${terms.coach.toLowerCase()}s`;
  const isEmpty = classes.length === 0;
  const starterClassNames = new Set(
    getStarterClassPresets(specialization, getStarterGroupPresets(specialization)).map((preset) => preset.name)
  );
  const apparatusLabels = Object.fromEntries(
    specialization.evaluation.apparatus.map((item) => [item.code, item.label])
  );
  const sportConfigNameById = new Map(
    sportConfigs.map((config) => [config.id, `${config.branchName} · ${config.disciplineName}`])
  );

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-2xl border border-zaltyko-mist bg-white p-5 shadow-soft lg:flex-row lg:items-center lg:justify-between">
        <form className="flex flex-1 flex-wrap items-center gap-3" onSubmit={applyFilters}>
          <input
            type="search"
            placeholder="Buscar por nombre"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-h-11 min-w-[220px] flex-1 rounded-card border border-zaltyko-mist bg-white px-3 py-2 text-sm focus:border-zaltyko-teal focus:outline-none focus:ring-4 focus:ring-zaltyko-teal/15"
          />
          <select
            value={groupFilter}
            onChange={(event) => setGroupFilter(event.target.value)}
            className="min-h-11 min-w-[200px] rounded-card border border-zaltyko-mist bg-white px-3 py-2 text-sm focus:border-zaltyko-teal focus:outline-none focus:ring-4 focus:ring-zaltyko-teal/15"
          >
            <option value="">Todos los {groupTermLower}s</option>
            {groupOptions.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          <select
            value={sportConfigFilter}
            onChange={(event) => setSportConfigFilter(event.target.value)}
            className="min-h-11 min-w-[210px] rounded-card border border-zaltyko-mist bg-white px-3 py-2 text-sm focus:border-zaltyko-teal focus:outline-none focus:ring-4 focus:ring-zaltyko-teal/15"
          >
            <option value="">Todas las ramas</option>
            {sportConfigs.map((config) => (
              <option key={config.id} value={config.id}>
                {config.branchName} · {config.disciplineName}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={isPending}
            className="min-h-10 rounded-full bg-zaltyko-teal px-4 py-2 text-xs font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
          >
            Filtrar
          </button>
        </form>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-zaltyko-teal px-4 py-2 text-sm font-semibold text-white shadow-soft hover:bg-primary-dark"
          >
            Crear {classTermLower}
          </button>
        </div>
      </section>

      {isEmpty ? (
        <div className="rounded-2xl border border-zaltyko-mist bg-white p-12 text-center shadow-soft">
          <p className="mb-4 text-sm text-muted-foreground">
            {hasActiveFilters
              ? `No se encontraron ${classTermLower}s con esos criterios.`
              : `Aún no has creado ninguna ${classTermLower}. Crea tu primera ${classTermLower} para organizar horarios y sesiones de entrenamiento.`}
          </p>
          {!hasActiveFilters && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-zaltyko-teal px-4 py-2 text-sm font-semibold text-white shadow-soft hover:bg-primary-dark"
            >
              Crear primera {classTermLower}
            </button>
          )}
        </div>
      ) : (
        <ClassesDataTable
          academyId={academyId}
          classes={classes}
          apparatusLabels={apparatusLabels}
          sportConfigNameById={sportConfigNameById}
          starterClassNames={starterClassNames}
          terms={terms}
          coachTermPluralLower={coachTermPluralLower}
          groupTermLower={groupTermLower}
          formatSchedule={formatSchedule}
          onEdit={setEditing}
        />
      )}

      <CreateClassDialog
        academyId={academyId}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleRefresh}
        groupOptions={groupOptions}
        coachOptions={availableCoaches}
        sportConfigs={sportConfigs}
        initialSportConfigId={sportConfigFilter || undefined}
      />

      {editing && (
        <EditClassDialog
          classItem={editing}
          availableCoaches={availableCoaches}
          availableGroups={groupOptions}
          sportConfigs={sportConfigs}
          open={Boolean(editing)}
          onClose={() => setEditing(null)}
          onUpdated={handleRefresh}
          onDeleted={handleDeleted}
          academyId={academyId}
        />
      )}
    </div>
  );
}

interface ClassesDataTableProps {
  academyId: string;
  classes: ClassItem[];
  apparatusLabels: Record<string, string>;
  sportConfigNameById: Map<string, string>;
  starterClassNames: Set<string>;
  terms: {
    coach: string;
    group: string;
    groups: string;
  };
  coachTermPluralLower: string;
  groupTermLower: string;
  formatSchedule: (item: ClassItem) => string;
  onEdit: (item: ClassItem) => void;
}

/**
 * Vista de tabla + cards móvil para Clases. Comparte el DataTable genérico
 * con el piloto de Atletas (mismas guarantees: 4 estados, accesibilidad,
 * responsive, opt-in features). El estado vacío real se renderiza en el
 * padre (`ClassesTableView`) para preservar la CTA contextual "Crear
 * primera clase" cuando no hay filtros activos.
 */
function ClassesDataTable({
  academyId,
  classes,
  apparatusLabels,
  sportConfigNameById,
  starterClassNames,
  terms,
  coachTermPluralLower,
  groupTermLower,
  formatSchedule,
  onEdit,
}: ClassesDataTableProps) {
  const columns = React.useMemo<DataTableColumn<ClassItem>[]>(
    () => [
      {
        id: "name",
        header: "Nombre",
        sortable: true,
        sortValue: (item) => item.name,
        cell: (item) => (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-zaltyko-teal">{item.name}</span>
              {starterClassNames.has(item.name) && (
                <span className="rounded-full border border-zaltyko-teal/30 bg-zaltyko-teal/10 px-2 py-0.5 text-[11px] font-semibold text-zaltyko-teal">
                  Plantilla inicial
                </span>
              )}
              {item.autoGenerateSessions && (
                <RecurringIndicator
                  classId={item.id}
                  academyId={academyId}
                  autoGenerateSessions={item.autoGenerateSessions}
                />
              )}
            </div>
            {item.createdAt && (
              <p className="text-xs text-muted-foreground">
                Creada el {item.createdAt.slice(0, 10)}
              </p>
            )}
            {item.sportConfigId && (
              <span className="inline-flex w-fit rounded-full border border-zaltyko-mist bg-zaltyko-white px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                {sportConfigNameById.get(item.sportConfigId) ??
                  "Configuración deportiva"}
              </span>
            )}
            {(item.technicalFocus || (item.apparatus?.length ?? 0) > 0) && (
              <div className="flex flex-wrap gap-2">
                {item.technicalFocus && (
                  <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
                    {item.technicalFocus}
                  </span>
                )}
                {(item.apparatus ?? []).map((apparatus) => (
                  <span
                    key={apparatus}
                    className="rounded-full border border-zaltyko-mist bg-white px-2.5 py-1 text-[11px] text-muted-foreground"
                  >
                    {apparatusLabels[apparatus] || apparatus}
                  </span>
                ))}
              </div>
            )}
          </div>
        ),
      },
      {
        id: "schedule",
        header: "Horario",
        cell: (item) => formatSchedule(item),
      },
      {
        id: "capacity",
        header: "Capacidad",
        align: "right",
        className: "tabular-nums",
        cell: (item) => (
          <div className="flex flex-col items-end gap-1">
            <span>{item.capacity ?? "—"}</span>
            {item.capacity && item.capacity > 0 && (
              <AlertBadge type="capacity" severity="medium" className="text-[10px]" />
            )}
          </div>
        ),
      },
      {
        id: "coaches",
        header: `${terms.coach}s`,
        cell: (item) => (
          <div className="flex flex-wrap gap-2 text-xs">
            {item.coaches.length === 0 ? (
              <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">
                Sin {coachTermPluralLower} asignados
              </span>
            ) : (
              item.coaches.map((coach) => (
                <span
                  key={coach.id}
                  className="rounded-full bg-zaltyko-indigo/10 px-3 py-1 text-zaltyko-indigo"
                >
                  {coach.name}
                </span>
              ))
            )}
          </div>
        ),
      },
      {
        id: "groups",
        header: `${terms.groups} vinculados`,
        cell: (item) => (
          <div className="flex flex-wrap gap-2 text-xs">
            {item.groups.length === 0 ? (
              <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">
                Sin {groupTermLower} vinculado
              </span>
            ) : (
              item.groups.map((group) => (
                <span
                  key={group.id}
                  className="inline-flex items-center gap-2 rounded-full border px-3 py-1 font-medium"
                  style={
                    group.color
                      ? { borderColor: group.color, color: group.color }
                      : undefined
                  }
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: group.color ?? "currentColor" }}
                  />
                  {group.name}
                </span>
              ))
            )}
          </div>
        ),
      },
      {
        id: "actions",
        header: <span className="sr-only">Acciones</span>,
        align: "right",
        cell: (item) => (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onEdit(item);
            }}
            className="text-xs font-semibold text-zaltyko-teal hover:underline"
          >
            Editar
          </button>
        ),
      },
    ],
    [
      academyId,
      apparatusLabels,
      coachTermPluralLower,
      formatSchedule,
      groupTermLower,
      onEdit,
      sportConfigNameById,
      starterClassNames,
      terms.coach,
      terms.groups,
    ]
  );

  return (
    <DataTable<ClassItem>
      data={classes}
      columns={columns}
      getRowKey={(item) => item.id}
      ariaLabel={`Listado de clases`}
      itemLabel="clases"
      rowHref={(item) => `/app/${academyId}/classes/${item.id}`}
      mobileCard={(item) => (
        <article className="rounded-2xl border border-zaltyko-mist bg-white p-4 shadow-soft">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/app/${academyId}/classes/${item.id}`}
                  className="font-semibold text-zaltyko-teal hover:underline"
                >
                  {item.name}
                </Link>
                {starterClassNames.has(item.name) && (
                  <span className="rounded-full border border-zaltyko-teal/30 bg-zaltyko-teal/10 px-2 py-0.5 text-[11px] font-semibold text-zaltyko-teal">
                    Plantilla inicial
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{formatSchedule(item)}</p>
            </div>
            <button
              type="button"
              onClick={() => onEdit(item)}
              className="shrink-0 text-xs font-semibold text-zaltyko-teal hover:underline"
            >
              Editar
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Capacidad</span>
            <span className="tabular-nums font-medium text-zaltyko-navy">{item.capacity ?? "—"}</span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {item.coaches.length === 0 ? (
              <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">
                Sin {coachTermPluralLower} asignados
              </span>
            ) : (
              item.coaches.map((coach) => (
                <span key={coach.id} className="rounded-full bg-zaltyko-indigo/10 px-3 py-1 text-zaltyko-indigo">
                  {coach.name}
                </span>
              ))
            )}
          </div>

          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {item.groups.length === 0 ? (
              <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">
                Sin {groupTermLower} vinculado
              </span>
            ) : (
              item.groups.map((group) => (
                <span
                  key={group.id}
                  className="inline-flex items-center gap-2 rounded-full border px-3 py-1 font-medium"
                  style={group.color ? { borderColor: group.color, color: group.color } : undefined}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: group.color ?? "currentColor" }} />
                  {group.name}
                </span>
              ))
            )}
          </div>
        </article>
      )}
    />
  );
}
