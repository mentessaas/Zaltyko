"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import { CreateClassDialog } from "@/components/classes/CreateClassDialog";
import { EditClassDialog } from "@/components/classes/EditClassDialog";
import { RecurringIndicator } from "@/components/shared/RecurringIndicator";
import { AlertBadge } from "@/components/shared/AlertBadge";

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
}

interface ClassItem {
  id: string;
  name: string;
  weekdays: number[];
  startTime: string | null;
  endTime: string | null;
  capacity: number | null;
  autoGenerateSessions: boolean;
  createdAt: string | null;
  coaches: CoachOption[];
  groups: {
    id: string;
    name: string;
    color: string | null;
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
  }[];
  filters: {
    q?: string;
    groupId?: string;
  };
}

export function ClassesTableView({
  academyId,
  classes,
  availableCoaches,
  groupOptions,
  filters,
}: ClassesTableViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [query, setQuery] = useState(filters.q ?? "");
  const [groupFilter, setGroupFilter] = useState(filters.groupId ?? "");
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

  const hasActiveFilters = filters.q || filters.groupId;
  const isEmpty = classes.length === 0;

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-lg border bg-card p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <form className="flex flex-1 flex-wrap items-center gap-3" onSubmit={applyFilters}>
          <input
            type="search"
            placeholder="Buscar por nombre"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-[220px] flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <select
            value={groupFilter}
            onChange={(event) => setGroupFilter(event.target.value)}
            className="min-w-[200px] rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">Todos los grupos</option>
            {groupOptions.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </form>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-600"
          >
            Nueva clase
          </button>
        </div>
      </section>

      {isEmpty ? (
        <div className="rounded-lg border bg-card p-12 text-center shadow-sm">
          <p className="mb-4 text-sm text-muted-foreground">
            {hasActiveFilters
              ? "No se encontraron clases con esos criterios."
              : "Aún no has creado ninguna clase. Crea tu primera clase para organizar horarios y sesiones de entrenamiento."}
          </p>
          {!hasActiveFilters && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-600"
            >
              Crear primera clase
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card shadow">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/60">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Horario</th>
                <th className="px-4 py-3 font-medium text-right">Capacidad</th>
                <th className="px-4 py-3 font-medium">Entrenadores</th>
                <th className="px-4 py-3 font-medium">Grupos vinculados</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-background text-foreground">
            {classes.map((item) => (
              <tr key={item.id} className="hover:bg-muted/40">
                <td className="px-4 py-3">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/app/${academyId}/classes/${item.id}`}
                        className="font-semibold text-primary hover:underline"
                      >
                        {item.name}
                      </Link>
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
                  </div>
                </td>
                <td className="px-4 py-3">{formatSchedule(item)}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  <div className="flex flex-col items-end gap-1">
                    <span>{item.capacity ?? "—"}</span>
                    {item.capacity && item.capacity > 0 && (
                      <AlertBadge type="capacity" severity="medium" className="text-[10px]" />
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2 text-xs">
                    {item.coaches.length === 0 ? (
                      <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">
                        Sin asignar
                      </span>
                    ) : (
                      item.coaches.map((coach) => (
                        <span
                          key={coach.id}
                          className="rounded-full bg-sky-500/10 px-3 py-1 text-sky-600"
                        >
                          {coach.name}
                        </span>
                      ))
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2 text-xs">
                    {item.groups.length === 0 ? (
                      <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">
                        Sin vínculo
                      </span>
                    ) : (
                      item.groups.map((group) => (
                        <span
                          key={group.id}
                          className="inline-flex items-center gap-2 rounded-full border px-3 py-1 font-medium"
                          style={
                            group.color
                              ? {
                                  borderColor: group.color,
                                  color: group.color,
                                }
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
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => setEditing(item)}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    Editar
                  </button>
                </td>
              </tr>
            ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateClassDialog
        academyId={academyId}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleRefresh}
      />

      {editing && (
        <EditClassDialog
          classItem={editing}
          availableCoaches={availableCoaches}
          availableGroups={groupOptions}
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


