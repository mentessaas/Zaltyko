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

  const emptyMessage = useMemo(() => {
    if (filters.q || filters.groupId) {
      return "No hay entrenadores que coincidan con la búsqueda.";
    }
    return "Registra entrenadores y asígnalos a tus clases para facilitar la operación.";
  }, [filters]);

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-lg border bg-card p-5 shadow-sm xl:flex-row xl:items-center xl:justify-between">
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
          <button
            type="submit"
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
          >
            {isPending ? "Buscando…" : "Buscar"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-600"
        >
          Nuevo entrenador
        </button>
      </section>

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
            {coaches.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            )}
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


