"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { CreateCoachDialog } from "@/components/coaches/CreateCoachDialog";
import { EditCoachDialog } from "@/components/coaches/EditCoachDialog";
import { PublicProfileBadge } from "@/components/shared/PublicProfileBadge";
import { getTerminologyForSportConfig } from "@/lib/sport-config/terminology";

interface ClassOption {
  id: string;
  name: string;
  sportConfigId: string | null;
}

interface SportConfigOption {
  id: string;
  name: string;
  disciplineName: string;
  branchName: string;
  terminology?: Record<string, string>;
}

interface CoachItem {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  sportConfigIds: string[];
  isPublic: boolean;
  publicBio: string | null;
  createdAt: string | null;
  classes: ClassOption[];
  groups: {
    id: string;
    name: string;
    color: string | null;
    sportConfigId: string | null;
    role: "principal" | "asistente";
  }[];
}

interface CoachesTableViewProps {
  academyId: string;
  coaches: CoachItem[];
  classes: ClassOption[];
  sportConfigs: SportConfigOption[];
  groupOptions: {
    id: string;
    name: string;
    color: string | null;
    sportConfigId: string | null;
  }[];
  filters: {
    q?: string;
    groupId?: string;
    sportConfigId?: string;
  };
}

export function CoachesTableView({ academyId, coaches, classes, sportConfigs, groupOptions, filters }: CoachesTableViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [query, setQuery] = useState(filters.q ?? "");
  const [groupFilter, setGroupFilter] = useState(filters.groupId ?? "");
  const [sportConfigFilter, setSportConfigFilter] = useState(filters.sportConfigId ?? "");
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

  const hasActiveFilters = filters.q || filters.groupId || filters.sportConfigId;
  const isEmpty = coaches.length === 0;
  const sportConfigNameById = new Map(sportConfigs.map((config) => [config.id, config.branchName]));
  const selectedSportConfig = sportConfigs.find((config) => config.id === sportConfigFilter) ?? null;
  const terms = getTerminologyForSportConfig(sportConfigs, sportConfigFilter === "unscoped" ? null : sportConfigFilter);
  const coachTermLower = terms.coach.toLowerCase();
  const coachTermPluralLower = `${coachTermLower}s`;
  const groupTermLower = terms.group.toLowerCase();
  const selectedSportConfigLabel =
    sportConfigFilter === "unscoped"
      ? `${terms.coach}s sin rama asignada`
      : selectedSportConfig
        ? `${terms.coach}s disponibles para ${selectedSportConfig.branchName}`
        : null;

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
            className="min-w-[220px] rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">Todas las ramas</option>
            <option value="unscoped">Sin rama asignada</option>
            {sportConfigs.map((config) => (
              <option key={config.id} value={config.id}>
                {config.branchName} · {config.disciplineName}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-60"
          >
            Filtrar
          </button>
        </form>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-600"
          >
            Nuevo {coachTermLower}
          </button>
        </div>
      </section>

      {selectedSportConfigLabel && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
          {selectedSportConfigLabel}. Los {coachTermPluralLower} sin rama asignada siguen disponibles para todas las ramas.
        </div>
      )}

      {isEmpty ? (
        <div className="rounded-lg border bg-card p-12 text-center shadow-sm">
          <p className="mb-4 text-sm text-muted-foreground">
            {hasActiveFilters
              ? `No hay ${coachTermPluralLower} que coincidan con la búsqueda.`
              : `Aún no has creado ningún ${coachTermLower}. Crea tu primer ${coachTermLower} para asignarlo a clases y ${groupTermLower}s.`}
          </p>
          {!hasActiveFilters && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-600"
            >
              Crear primer {coachTermLower}
            </button>
          )}
        </div>
      ) : (
        <>
        {/* Cards — móvil */}
        <ul className="space-y-3 md:hidden">
          {coaches.map((coach) => (
            <li key={coach.id} className="rounded-lg border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/app/${academyId}/coaches/${coach.id}`}
                      className="font-semibold text-primary hover:underline"
                    >
                      {coach.name}
                    </Link>
                    {coach.isPublic && (
                      <PublicProfileBadge coachId={coach.id} academyId={academyId} isPublic={coach.isPublic} />
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {coach.email ?? "Sin correo"} · {coach.phone ?? "Sin teléfono"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(coach)}
                  className="shrink-0 text-xs font-semibold text-primary hover:underline"
                >
                  Editar
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {coach.sportConfigIds.length === 0 ? (
                  <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">Todas</span>
                ) : (
                  coach.sportConfigIds.map((sportConfigId) => (
                    <span key={sportConfigId} className="rounded-full bg-sky-500/10 px-3 py-1 text-sky-700">
                      {sportConfigNameById.get(sportConfigId) ?? "Rama"}
                    </span>
                  ))
                )}
              </div>

              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {coach.classes.length === 0 ? (
                  <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">Sin asignaciones</span>
                ) : (
                  coach.classes.map((cls) => (
                    <span key={cls.id} className="rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-600">
                      {cls.name}
                    </span>
                  ))
                )}
              </div>

              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {coach.groups.length === 0 ? (
                  <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">Sin {groupTermLower}</span>
                ) : (
                  coach.groups.map((group) => (
                    <span
                      key={`${group.id}-${group.role}`}
                      className="inline-flex items-center gap-2 rounded-full border px-3 py-1 font-medium"
                      style={group.color ? { borderColor: group.color, color: group.color } : undefined}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: group.color ?? "currentColor" }} />
                      {group.name}
                    </span>
                  ))
                )}
              </div>
            </li>
          ))}
        </ul>

        {/* Tabla — escritorio */}
        <div className="hidden overflow-x-auto rounded-lg border bg-card shadow md:block">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/60">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Contacto</th>
                <th className="px-4 py-3 font-medium">Ramas</th>
                <th className="px-4 py-3 font-medium">Clases asignadas</th>
                <th className="px-4 py-3 font-medium">{terms.groups}</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-background text-foreground">
            {coaches.map((coach) => (
              <tr key={coach.id} className="hover:bg-muted/40">
                <td className="px-4 py-3">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/app/${academyId}/coaches/${coach.id}`}
                        className="font-semibold text-primary transition hover:underline"
                      >
                        {coach.name}
                      </Link>
                      {coach.isPublic && (
                        <PublicProfileBadge
                          coachId={coach.id}
                          academyId={academyId}
                          isPublic={coach.isPublic}
                        />
                      )}
                    </div>
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
                    {coach.sportConfigIds.length === 0 ? (
                      <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">
                        Todas
                      </span>
                    ) : (
                      coach.sportConfigIds.map((sportConfigId) => (
                        <span key={sportConfigId} className="rounded-full bg-sky-500/10 px-3 py-1 text-sky-700">
                          {sportConfigNameById.get(sportConfigId) ?? "Rama"}
                        </span>
                      ))
                    )}
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
                        Sin {groupTermLower}
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
        </>
      )}

      <CreateCoachDialog
        academyId={academyId}
        sportConfigs={sportConfigs}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleRefresh}
      />

      {editing && (
        <EditCoachDialog
          coach={editing}
          academyId={academyId}
          availableClasses={classes}
          sportConfigs={sportConfigs}
          open={Boolean(editing)}
          onClose={() => setEditing(null)}
          onUpdated={handleRefresh}
          onDeleted={handleRefresh}
        />
      )}
    </div>
  );
}
