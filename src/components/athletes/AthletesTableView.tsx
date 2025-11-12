"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { athleteStatusOptions } from "@/lib/athletes/constants";
import { useToast } from "@/components/ui/toast-provider";

import { CreateAthleteDialog } from "@/components/athletes/CreateAthleteDialog";
import { EditAthleteDialog } from "@/components/athletes/EditAthleteDialog";

interface AthleteListItem {
  id: string;
  name: string;
  level: string | null;
  status: (typeof athleteStatusOptions)[number];
  age: number | null;
  dob: string | null;
  guardianCount: number;
  createdAt: string | null;
  groupId: string | null;
  groupName: string | null;
  groupColor: string | null;
}

interface GroupOption {
  id: string;
  name: string;
  color: string | null;
}

interface AthletesTableViewProps {
  academyId: string;
  athletes: AthleteListItem[];
  levels: string[];
  groups: GroupOption[];
  filters: {
    status?: (typeof athleteStatusOptions)[number];
    level?: string;
    q?: string;
    groupId?: string;
  };
}

export function AthletesTableView({ academyId, athletes: initialAthletes, levels, groups, filters }: AthletesTableViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const toast = useToast();
  const [athletes, setAthletes] = useState<AthleteListItem[]>(initialAthletes);
  const [query, setQuery] = useState(filters.q ?? "");
  const [statusFilter, setStatusFilter] = useState(filters.status ?? "");
  const [levelFilter, setLevelFilter] = useState(filters.level ?? "");
  const [groupFilter, setGroupFilter] = useState(filters.groupId ?? "");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AthleteListItem | null>(null);
  const [isPending, startTransition] = useTransition();
  const [mutatingAthleteId, setMutatingAthleteId] = useState<string | null>(null);

  // Sincronizar athletes cuando cambian los initialAthletes (después de refresh)
  useEffect(() => {
    setAthletes(initialAthletes);
  }, [initialAthletes]);

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams(searchParams?.toString());

    if (query.trim()) {
      params.set("q", query.trim());
    } else {
      params.delete("q");
    }

    if (statusFilter) {
      params.set("status", statusFilter);
    } else {
      params.delete("status");
    }

    if (levelFilter) {
      params.set("level", levelFilter);
    } else {
      params.delete("level");
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

  const handleUpdated = (updatedAthlete: AthleteListItem) => {
    // Optimistic update: actualizar inmediatamente en la lista
    setAthletes((prevAthletes) =>
      prevAthletes.map((athlete) =>
        athlete.id === updatedAthlete.id ? updatedAthlete : athlete
      )
    );
    
    toast.pushToast({
      title: "Atleta actualizado",
      description: "Los cambios se han guardado correctamente.",
      variant: "success",
    });
    
    // Refrescar para sincronizar con el servidor
    handleRefresh();
  };

  const handleDeleted = (athleteId: string) => {
    // Optimistic update: eliminar inmediatamente de la lista
    setAthletes((prevAthletes) => prevAthletes.filter((athlete) => athlete.id !== athleteId));
    
    toast.pushToast({
      title: "Atleta eliminado",
      description: "El atleta ha sido eliminado correctamente.",
      variant: "success",
    });
    
    // Refrescar para sincronizar con el servidor
    handleRefresh();
  };

  const handleCreated = () => {
    toast.pushToast({
      title: "Atleta creado",
      description: "El nuevo atleta ha sido agregado correctamente.",
      variant: "success",
    });
    handleRefresh();
  };

  const emptyStateMessage = useMemo(() => {
    if (filters.q || filters.level || filters.status || filters.groupId) {
      return "No hay atletas que coincidan con los filtros.";
    }
    return "Aún no has registrado atletas en esta academia.";
  }, [filters]);

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-lg border bg-card p-5 shadow-sm xl:flex-row xl:items-center xl:justify-between">
        <form className="flex flex-1 flex-wrap items-center gap-3" onSubmit={applyFilters}>
          <input
            type="search"
            placeholder="Buscar por nombre"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-[200px] flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as (typeof athleteStatusOptions)[number] | "")}
            className="min-w-[160px] rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">Estado</option>
            {athleteStatusOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select
            value={levelFilter}
            onChange={(event) => setLevelFilter(event.target.value)}
            className="min-w-[160px] rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">Nivel</option>
            {levels.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
          <select
            value={groupFilter}
            onChange={(event) => setGroupFilter(event.target.value)}
            className="min-w-[180px] rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">Grupo</option>
            {groups.map((group) => (
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
            {isPending ? "Aplicando…" : "Aplicar filtros"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-600"
        >
          Nuevo atleta
        </button>
      </section>

      <div className="overflow-hidden rounded-lg border bg-card shadow">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted/60">
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Nivel</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium text-right">Edad</th>
              <th className="px-4 py-3 font-medium text-right">Familia</th>
              <th className="px-4 py-3 font-medium">Grupo</th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-background text-foreground">
            {athletes.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  {emptyStateMessage}
                </td>
              </tr>
            )}
            {athletes.map((athlete) => (
              <tr key={athlete.id} className="hover:bg-muted/40">
                <td className="px-4 py-3">
                  <div className="space-y-1">
                    <Link
                      href={`/app/${academyId}/athletes/${athlete.id}`}
                      className="font-semibold text-primary transition hover:underline"
                    >
                      {athlete.name}
                    </Link>
                    {athlete.dob && (
                      <p className="text-xs text-muted-foreground">
                        Nacido el {athlete.dob.slice(0, 10)}
                      </p>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">{athlete.level ?? "—"}</td>
                <td className="px-4 py-3 capitalize">{athlete.status}</td>
                <td className="px-4 py-3 text-right tabular-nums">{athlete.age ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {Number(athlete.guardianCount ?? 0)}
                </td>
                 <td className="px-4 py-3">
                  {athlete.groupName ? (
                    <span
                      className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold"
                      style={
                        athlete.groupColor
                          ? {
                              borderColor: athlete.groupColor,
                              color: athlete.groupColor,
                            }
                          : undefined
                      }
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
                    <span className="text-xs text-muted-foreground">Sin grupo</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => setEditing(athlete)}
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

      <CreateAthleteDialog
        academyId={academyId}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
        levelSuggestions={levels}
        groups={groups}
      />

      {editing && (
        <EditAthleteDialog
          athlete={editing}
          academyId={academyId}
          open={Boolean(editing)}
          onClose={() => setEditing(null)}
          onUpdated={() => {
            // El EditAthleteDialog manejará la actualización optimista internamente
            handleRefresh();
          }}
          onDeleted={() => {
            // Optimistic update: eliminar inmediatamente de la lista
            if (editing) {
              handleDeleted(editing.id);
            } else {
              handleRefresh();
            }
          }}
          levelSuggestions={levels}
          groups={groups}
        />
      )}
    </div>
  );
}


