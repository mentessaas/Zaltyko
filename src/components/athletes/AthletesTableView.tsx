"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download, LayoutGrid, List, CheckSquare, Square, MoreHorizontal, Trash2, Mail, Users } from "lucide-react";

import { athleteStatusOptions } from "@/lib/athletes/constants";
import { PAGE_SIZES } from "@/lib/constants";
import { useToast } from "@/components/ui/toast-provider";
import { Button } from "@/components/ui/button";

import { CreateAthleteDialog } from "@/components/athletes/CreateAthleteDialog";
import { EditAthleteDialog } from "@/components/athletes/EditAthleteDialog";
import { AthletesKanbanView } from "@/components/athletes/AthletesKanbanView";
import { TooltipOnboarding } from "@/components/tooltips/TooltipOnboarding";
import { AlertBadge } from "@/components/shared/AlertBadge";
import type { AthleteListItem, GroupOption } from "@/types";

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
  const [ageRange, setAgeRange] = useState<{ min?: number; max?: number }>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AthleteListItem | null>(null);
  const [isPending, startTransition] = useTransition();
  const [mutatingAthleteId, setMutatingAthleteId] = useState<string | null>(null);
  const [athletesWithAlerts, setAthletesWithAlerts] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"table" | "kanban">("table");
  const [selectedAthletes, setSelectedAthletes] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<"name" | "age" | "createdAt">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = PAGE_SIZES.TABLE_DEFAULT;

  // Sincronizar athletes cuando cambian los initialAthletes (después de refresh)
  useEffect(() => {
    setAthletes(initialAthletes);
  }, [initialAthletes]);

  // Cargar alertas de asistencia para los atletas
  useEffect(() => {
    const controller = new AbortController();

    const loadAttendanceAlerts = async () => {
      try {
        const response = await fetch(`/api/alerts/attendance?academyId=${academyId}`, {
          signal: controller.signal,
        });
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data.alerts)) {
            const athleteIdsWithAlerts = new Set<string>(
              data.alerts.map((alert: any) => alert.athleteId as string)
            );
            setAthletesWithAlerts(athleteIdsWithAlerts);
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") {
          console.error("Error loading attendance alerts:", error);
        }
      }
    };

    if (academyId && athletes.length > 0) {
      loadAttendanceAlerts();
    }

    return () => controller.abort();
  }, [academyId, athletes.length]);

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

  // Export to CSV
  const handleExportCSV = () => {
    const headers = ["Nombre", "Nivel", "Estado", "Edad", "Grupo", "Familia", "Fecha creación"];
    const rows = filteredAthletes.map((athlete) => [
      athlete.name,
      athlete.level || "",
      athlete.status,
      athlete.age?.toString() || "",
      athlete.groupName || "",
      athlete.guardianCount?.toString() || "0",
      athlete.createdAt ? new Date(athlete.createdAt).toLocaleDateString("es-ES") : "",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `atletas_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast.pushToast({
      title: "Exportación completada",
      description: `Se han exportado ${filteredAthletes.length} atletas.`,
      variant: "success",
    });
  };

  // Selection handlers
  const toggleSelectAll = () => {
    if (selectedAthletes.size === paginatedAthletes.length) {
      setSelectedAthletes(new Set());
    } else {
      setSelectedAthletes(new Set(paginatedAthletes.map((a) => a.id)));
    }
  };

  const toggleSelectAthlete = (id: string) => {
    const newSelected = new Set(selectedAthletes);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedAthletes(newSelected);
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

  const hasActiveFilters = filters.q || filters.level || filters.status || filters.groupId || ageRange.min || ageRange.max;
  const isEmpty = athletes.length === 0;

  // Filter and sort athletes
  const filteredAthletes = useMemo(() => {
    let result = [...athletes];

    // Filter by age range
    if (ageRange.min !== undefined) {
      result = result.filter((a) => a.age !== null && a.age >= ageRange.min!);
    }
    if (ageRange.max !== undefined) {
      result = result.filter((a) => a.age !== null && a.age <= ageRange.max!);
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === "name") {
        return sortOrder === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      }
      if (sortBy === "age") {
        const ageA = a.age ?? 0;
        const ageB = b.age ?? 0;
        return sortOrder === "asc" ? ageA - ageB : ageB - ageA;
      }
      if (sortBy === "createdAt") {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
      }
      return 0;
    });

    return result;
  }, [athletes, ageRange, sortBy, sortOrder]);

  // Pagination
  const totalPages = Math.ceil(filteredAthletes.length / ITEMS_PER_PAGE);
  const paginatedAthletes = filteredAthletes.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-lg border bg-card p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
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
            <option value="">Grupo principal</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <input
              type="number"
              placeholder="Edad min"
              min="1"
              max="99"
              value={ageRange.min ?? ""}
              onChange={(e) => setAgeRange((prev) => ({ ...prev, min: e.target.value ? parseInt(e.target.value) : undefined }))}
              className="w-20 rounded-md border border-border bg-background px-2 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <span className="text-muted-foreground">-</span>
            <input
              type="number"
              placeholder="Edad max"
              min="1"
              max="99"
              value={ageRange.max ?? ""}
              onChange={(e) => setAgeRange((prev) => ({ ...prev, max: e.target.value ? parseInt(e.target.value) : undefined }))}
              className="w-20 rounded-md border border-border bg-background px-2 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          {/* Quick Filters */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStatusFilter("active")}
              className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-600 hover:bg-emerald-500/20"
            >
              Activos
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("trial")}
              className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-600 hover:bg-amber-500/20"
            >
              Prueba
            </button>
            <button
              type="button"
              onClick={() => { setStatusFilter(""); setLevelFilter(""); setGroupFilter(""); setAgeRange({}); setQuery(""); }}
              className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground hover:bg-muted"
            >
              Limpiar
            </button>
          </div>
        </form>

        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex items-center rounded-md border border-border">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`p-2 ${viewMode === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              title="Vista de tabla"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("kanban")}
              className={`p-2 ${viewMode === "kanban" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              title="Vista Kanban"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>

          {/* Export Button */}
          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium shadow hover:bg-muted"
          >
            <Download className="mr-2 h-4 w-4" />
            Exportar
          </button>

          {/* Batch Actions (when items selected) */}
          {selectedAthletes.size > 0 && (
            <div className="flex items-center gap-2 rounded-md border border-primary bg-primary/10 px-3 py-2">
              <span className="text-sm font-medium">{selectedAthletes.size} seleccionados</span>
              <select
                className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value === "delete") {
                    if (confirm(`¿Eliminar ${selectedAthletes.size} atletas?`)) {
                      toast.pushToast({
                        title: "Eliminación masiva",
                        description: `Se eliminarán ${selectedAthletes.size} atletas`,
                        variant: "warning",
                      });
                      setSelectedAthletes(new Set());
                    }
                  }
                  e.target.value = "";
                }}
              >
                <option value="">Acciones...</option>
                <option value="delete">Eliminar</option>
                <option value="export">Exportar seleccionados</option>
                <option value="message">Enviar mensaje</option>
              </select>
              <button
                type="button"
                onClick={() => setSelectedAthletes(new Set())}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </button>
            </div>
          )}

          <TooltipOnboarding
            tooltipId="tooltip_add_athlete"
            message="Añade al menos 5 atletas clave para ver todo el valor del sistema."
          >
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-600"
            >
              Nuevo atleta
            </button>
          </TooltipOnboarding>
        </div>
      </section>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center rounded-lg border bg-card p-12 text-center shadow-sm">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Users className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="mb-2 text-sm font-medium text-foreground">
            {hasActiveFilters
              ? "No hay atletas que coincidan con los filtros"
              : "Aún no has creado ningún atleta"}
          </p>
          <p className="mb-6 text-sm text-muted-foreground">
            {hasActiveFilters
              ? "Intenta ajustar los filtros de búsqueda"
              : "Crea tu primer atleta para empezar a gestionar tu academia"}
          </p>
          {!hasActiveFilters && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-600 hover:shadow-md"
            >
              Crear primer atleta
            </button>
          )}
        </div>
      ) : viewMode === "kanban" ? (
        <AthletesKanbanView
          athletes={athletes}
          academyId={academyId}
          onStatusChange={() => {
            // Status change will be handled by the API
          }}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card shadow">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/60">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-2 py-3 font-medium w-8">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="p-1 hover:text-primary"
                  >
                    {selectedAthletes.size === athletes.length && athletes.length > 0 ? (
                      <CheckSquare className="h-4 w-4" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3 font-medium">
                  <button
                    type="button"
                    onClick={() => { setSortBy("name"); setSortOrder(sortBy === "name" && sortOrder === "asc" ? "desc" : "asc"); }}
                    className="flex items-center gap-1 hover:text-primary"
                  >
                    Nombre
                    {sortBy === "name" && (sortOrder === "asc" ? " ↑" : " ↓")}
                  </button>
                </th>
                <th className="px-4 py-3 font-medium">Nivel</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium text-right">
                  <button
                    type="button"
                    onClick={() => { setSortBy("age"); setSortOrder(sortBy === "age" && sortOrder === "asc" ? "desc" : "asc"); }}
                    className="flex items-center gap-1 hover:text-primary ml-auto"
                  >
                    Edad
                    {sortBy === "age" && (sortOrder === "asc" ? " ↑" : " ↓")}
                  </button>
                </th>
                <th className="px-4 py-3 font-medium text-right">Familia</th>
                <th className="px-4 py-3 font-medium">Grupo principal</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-background text-foreground">
            {paginatedAthletes.map((athlete) => (
              <tr key={athlete.id} className="hover:bg-muted/40">
                <td className="px-2 py-3">
                  <button
                    type="button"
                    onClick={() => toggleSelectAthlete(athlete.id)}
                    className="p-1 hover:text-primary"
                  >
                    {selectedAthletes.has(athlete.id) ? (
                      <CheckSquare className="h-4 w-4" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/app/${academyId}/athletes/${athlete.id}`}
                        className="font-semibold text-primary transition hover:underline"
                      >
                        {athlete.name}
                      </Link>
                      {athletesWithAlerts.has(athlete.id) && (
                        <AlertBadge type="attendance" severity="medium" className="text-[10px]" />
                      )}
                    </div>
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
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border px-4 py-3">
              <p className="text-sm text-muted-foreground">
                Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredAthletes.length)} de {filteredAthletes.length} atletas
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
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
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {process.env.NODE_ENV !== "production" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p>
            ¿Necesitas importar datos? Usa el{" "}
            <Link href="/dashboard/athletes" className="font-semibold underline">
              módulo clásico
            </Link>{" "}
            mientras migramos las herramientas aquí.
          </p>
        </div>
      )}

      <CreateAthleteDialog
        academyId={academyId}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
        groups={groups}
      />

      {editing && (
        <EditAthleteDialog
          athlete={{
            id: editing.id,
            name: editing.name,
            level: editing.level,
            status: editing.status,
            dob: editing.dob ?? null,
            groupId: editing.groupId ?? null,
            groupName: editing.groupName,
          }}
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
          groups={groups}
        />
      )}
    </div>
  );
}


