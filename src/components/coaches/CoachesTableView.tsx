"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { CreateCoachDialog } from "@/components/coaches/CreateCoachDialog";
import { EditCoachDialog } from "@/components/coaches/EditCoachDialog";

interface ClassOption {
  id: string;
  name: string;
}

interface CoachItem {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  createdAt: string | null;
  classes: ClassOption[];
  groups: {
    id: string;
    name: string;
    color: string | null;
    role: "principal" | "asistente";
  }[];
}

interface CoachesTableViewProps {
  academyId: string;
  coaches: CoachItem[];
  classes: ClassOption[];
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

export function CoachesTableView({ academyId, coaches, classes, groupOptions, filters }: CoachesTableViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [query, setQuery] = useState(filters.q ?? "");
  const [groupFilter, setGroupFilter] = useState(filters.groupId ?? "");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CoachItem | null>(null);
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

  const hasActiveFilters = filters.q || filters.groupId;
  const isEmpty = coaches.length === 0;

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-lg border bg-card p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <form className="flex flex-1 flex-wrap items-center gap-3" onSubmit={applyFilters}>
          <input
            type="search"
            placeholder="Buscar por nombre o correo"
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
            Nuevo entrenador
          </button>
        </div>
      </section>

      {isEmpty ? (
        <div className="rounded-lg border bg-card p-12 text-center shadow-sm">
          <p className="mb-4 text-sm text-muted-foreground">
            {hasActiveFilters
              ? "No hay entrenadores que coincidan con la búsqueda."
              : "Aún no has creado ningún entrenador. Crea tu primer entrenador para asignarlo a clases y grupos."}
          </p>
          {!hasActiveFilters && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-600"
            >
              Crear primer entrenador
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card shadow">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/60">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Contacto</th>
                <th className="px-4 py-3 font-medium">Clases asignadas</th>
                <th className="px-4 py-3 font-medium">Grupos</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-background text-foreground">
            {coaches.map((coach) => (
              <tr key={coach.id} className="hover:bg-muted/40">
                <td className="px-4 py-3">
                  <div className="space-y-1">
                    <Link
                      href={`/app/${academyId}/coaches/${coach.id}`}
                      className="font-semibold text-primary transition hover:underline"
                    >
                      {coach.name}
                    </Link>
                    {coach.createdAt && (
                      <p className="text-xs text-muted-foreground">
                        Alta: {coach.createdAt.slice(0, 10)}
                      </p>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p>{coach.email ?? "Sin correo"}</p>
                    <p>{coach.phone ?? "Sin teléfono"}</p>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2 text-xs">
                    {coach.classes.length === 0 ? (
                      <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">
                        Sin asignaciones
                      </span>
                    ) : (
                      coach.classes.map((cls) => (
                        <span
                          key={cls.id}
                          className="rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-600"
                        >
                          {cls.name}
                        </span>
                      ))
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2 text-xs">
                    {coach.groups.length === 0 ? (
                      <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">
                        Sin grupo
                      </span>
                    ) : (
                      coach.groups.map((group) => (
                        <span
                          key={`${group.id}-${group.role}`}
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
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {group.role}
                          </span>
                        </span>
                      ))
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => setEditing(coach)}
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

      {process.env.NODE_ENV !== "production" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p>
            ¿Necesitas reportes avanzados o invitaciones masivas? Usa temporalmente el{" "}
            <Link href="/dashboard/coaches" className="font-semibold underline">
              panel clásico
            </Link>{" "}
            mientras completamos la migración.
          </p>
        </div>
      )}

      <CreateCoachDialog
        academyId={academyId}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleRefresh}
      />

      {editing && (
        <EditCoachDialog
          coach={editing}
          academyId={academyId}
          availableClasses={classes}
          open={Boolean(editing)}
          onClose={() => setEditing(null)}
          onUpdated={handleRefresh}
          onDeleted={handleRefresh}
        />
      )}
    </div>
  );
}


