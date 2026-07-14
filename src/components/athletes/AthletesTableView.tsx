"use client";

import { type FormEvent, memo, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { athleteStatusOptions } from "@/lib/athletes/constants";
import { PAGE_SIZES } from "@/lib/constants";
import { useToast } from "@/components/ui/toast-provider";
import { Modal } from "@/components/ui/modal";
import { CreateAthleteDialog } from "@/components/athletes/CreateAthleteDialog";
import { EditAthleteDialog } from "@/components/athletes/EditAthleteDialog";
import { AthletesKanbanView } from "@/components/athletes/AthletesKanbanView";
import ImportExportPanel from "@/components/athletes/ImportExportPanel";
import {
  AthletesDataTable,
  AthletesEmptyState,
  AthletesToolbar,
  type AgeRange,
} from "@/components/athletes/AthletesTableSections";
import type { SportConfigOption } from "@/components/groups/types";
import { getTerminologyForSportConfig } from "@/lib/sport-config/terminology";
import type { AthleteListItem, GroupOption } from "@/types";
import { useTranslation } from "@/hooks/use-translation";
import { logger } from "@/lib/logger";

interface AthletesTableViewProps {
  academyId: string;
  tenantId: string;
  athletes: AthleteListItem[];
  levels: string[];
  groups: GroupOption[];
  sportConfigs?: SportConfigOption[];
  filters: {
    status?: (typeof athleteStatusOptions)[number];
    level?: string;
    q?: string;
    groupId?: string;
    sportConfigId?: string;
  };
}

type SortBy = "name" | "age" | "createdAt";
type SortOrder = "asc" | "desc";

export const AthletesTableView = memo(function AthletesTableView({
  academyId,
  tenantId,
  athletes: initialAthletes,
  levels,
  groups,
  sportConfigs = [],
  filters,
}: AthletesTableViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const toast = useToast();
  const { locale } = useTranslation();
  const tCommon = useMemo(
    () => ({
      search: locale === "en" ? "Search" : "Buscar",
      cancel: locale === "en" ? "Cancel" : "Cancelar",
      delete: locale === "en" ? "Delete" : "Eliminar",
    }),
    [locale]
  );

  const [athletes, setAthletes] = useState<AthleteListItem[]>(initialAthletes);
  const [query, setQuery] = useState(filters.q ?? "");
  const [statusFilter, setStatusFilter] = useState(filters.status ?? "");
  const [levelFilter, setLevelFilter] = useState(filters.level ?? "");
  const [groupFilter, setGroupFilter] = useState(filters.groupId ?? "");
  const [sportConfigFilter, setSportConfigFilter] = useState(filters.sportConfigId ?? "");
  const [ageRange, setAgeRange] = useState<AgeRange>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<AthleteListItem | null>(null);
  const [isPending, startTransition] = useTransition();
  const [athletesWithAlerts, setAthletesWithAlerts] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"table" | "kanban">("table");
  const [selectedAthletes, setSelectedAthletes] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortBy>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = PAGE_SIZES.TABLE_DEFAULT;

  useEffect(() => {
    setAthletes(initialAthletes);
  }, [initialAthletes]);

  useEffect(() => {
    const controller = new AbortController();

    const loadAttendanceAlerts = async () => {
      try {
        const response = await fetch(`/api/alerts/attendance?academyId=${academyId}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;

        const data = await response.json();
        const alerts = data?.data?.items ?? data?.items ?? data?.alerts ?? [];
        if (Array.isArray(alerts)) {
          setAthletesWithAlerts(
            new Set(
              alerts
                .map((alert: { athleteId?: string }) => alert.athleteId)
                .filter((athleteId): athleteId is string => Boolean(athleteId))
            )
          );
        }
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") {
          logger.error("Error loading attendance alerts:", error);
        }
      }
    };

    if (academyId && athletes.length > 0) {
      loadAttendanceAlerts();
    }

    return () => controller.abort();
  }, [academyId, athletes.length]);

  const sportConfigNameById = useMemo(
    () =>
      new Map(
        sportConfigs.map((config) => [
          config.id,
          `${config.branchName} · ${config.disciplineName}`,
        ])
      ),
    [sportConfigs]
  );
  const terms = useMemo(
    () => getTerminologyForSportConfig(sportConfigs, sportConfigFilter || filters.sportConfigId),
    [filters.sportConfigId, sportConfigFilter, sportConfigs]
  );

  const filteredAthletes = useMemo(() => {
    let result = [...athletes];

    if (ageRange.min !== undefined) {
      result = result.filter((athlete) => athlete.age !== null && athlete.age >= ageRange.min!);
    }
    if (ageRange.max !== undefined) {
      result = result.filter((athlete) => athlete.age !== null && athlete.age <= ageRange.max!);
    }

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

  const totalPages = Math.ceil(filteredAthletes.length / itemsPerPage);
  const paginatedAthletes = filteredAthletes.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  const hasActiveFilters =
    filters.q ||
    filters.level ||
    filters.status ||
    filters.groupId ||
    filters.sportConfigId ||
    ageRange.min ||
    ageRange.max;
  const isEmpty = athletes.length === 0;

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams(searchParams?.toString());

    setParam(params, "q", query.trim());
    setParam(params, "status", statusFilter);
    setParam(params, "level", levelFilter);
    setParam(params, "group", groupFilter);
    setParam(params, "sportConfigId", sportConfigFilter);

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

  const handleExportCSV = () => {
    const headers = [
      "Nombre",
      "Nivel",
      "Estado",
      "Edad",
      terms.group,
      "sportConfigId",
      "programCode",
      "levelCode",
      "categoryCode",
      "Familia",
      "Fecha creación",
    ];
    const rows = filteredAthletes.map((athlete) => [
      athlete.name,
      athlete.level || "",
      athlete.status,
      athlete.age?.toString() || "",
      athlete.groupName || "",
      athlete.primarySportConfigId || "",
      athlete.programCode || "",
      athlete.levelCode || "",
      athlete.categoryCode || "",
      athlete.guardianCount?.toString() || "0",
      athlete.createdAt ? new Date(athlete.createdAt).toLocaleDateString("es-ES") : "",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${terms.athletes.toLowerCase()}_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast.pushToast({
      title: "Exportación completada",
      description: `Se han exportado ${filteredAthletes.length} ${terms.athletes.toLowerCase()}.`,
      variant: "success",
    });
  };

  const toggleSelectAll = () => {
    if (selectedAthletes.size === paginatedAthletes.length) {
      setSelectedAthletes(new Set());
    } else {
      setSelectedAthletes(new Set(paginatedAthletes.map((athlete) => athlete.id)));
    }
  };

  const toggleSelectAthlete = (id: string) => {
    setSelectedAthletes((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleDeleted = (athleteId: string) => {
    setAthletes((prevAthletes) => prevAthletes.filter((athlete) => athlete.id !== athleteId));

    toast.pushToast({
      title: `${terms.athlete} eliminado`,
      description: `${terms.athlete} eliminado correctamente.`,
      variant: "success",
    });

    handleRefresh();
  };

  const handleCreated = () => {
    toast.pushToast({
      title: `${terms.athlete} creado`,
      description: `El nuevo ${terms.athlete.toLowerCase()} ha sido agregado correctamente.`,
      variant: "success",
    });
    handleRefresh();
  };

  const handleImported = (summary: { created: number; skipped: number; total: number }) => {
    toast.pushToast({
      title: "Importación completada",
      description: `${summary.created} ${terms.athletes.toLowerCase()} creados, ${summary.skipped} omitidos de ${summary.total} filas.`,
      variant: summary.created > 0 ? "success" : "warning",
    });
    handleRefresh();
  };

  const handleClearFilters = () => {
    setStatusFilter("");
    setLevelFilter("");
    setGroupFilter("");
    setSportConfigFilter("");
    setAgeRange({});
    setQuery("");
  };

  const handleBatchAction = (action: string) => {
    if (action !== "delete") return;

    if (confirm(`¿Eliminar ${selectedAthletes.size} ${terms.athletes.toLowerCase()}?`)) {
      toast.pushToast({
        title: "Eliminación masiva",
        description: `Se eliminarán ${selectedAthletes.size} ${terms.athletes.toLowerCase()}`,
        variant: "warning",
      });
      setSelectedAthletes(new Set());
    }
  };

  const handleSortChange = (nextSortBy: SortBy) => {
    setSortBy(nextSortBy);
    setSortOrder(sortBy === nextSortBy && sortOrder === "asc" ? "desc" : "asc");
  };

  return (
    <div className="space-y-6">
      <AthletesToolbar
        ageRange={ageRange}
        groupFilter={groupFilter}
        groups={groups}
        isPending={isPending}
        levelFilter={levelFilter}
        levels={levels}
        query={query}
        selectedCount={selectedAthletes.size}
        sportConfigFilter={sportConfigFilter}
        sportConfigs={sportConfigs}
        statusFilter={statusFilter}
        terms={terms}
        text={tCommon}
        viewMode={viewMode}
        onAgeRangeChange={setAgeRange}
        onBatchAction={handleBatchAction}
        onClearFilters={handleClearFilters}
        onClearSelection={() => setSelectedAthletes(new Set())}
        onCreate={() => setCreateOpen(true)}
        onExportCSV={handleExportCSV}
        onGroupChange={setGroupFilter}
        onImportClick={() => setImportOpen(true)}
        onLevelChange={setLevelFilter}
        onQueryChange={setQuery}
        onSportConfigChange={setSportConfigFilter}
        onStatusChange={setStatusFilter}
        onSubmit={applyFilters}
        onViewModeChange={setViewMode}
      />

      {isEmpty ? (
        <AthletesEmptyState
          hasActiveFilters={Boolean(hasActiveFilters)}
          terms={terms}
          onCreate={() => setCreateOpen(true)}
          onImportClick={() => setImportOpen(true)}
        />
      ) : viewMode === "kanban" ? (
        <AthletesKanbanView academyId={academyId} />
      ) : (
        <AthletesDataTable
          academyId={academyId}
          allAthletesCount={athletes.length}
          athletes={paginatedAthletes}
          athletesWithAlerts={athletesWithAlerts}
          currentPage={currentPage}
          filteredCount={filteredAthletes.length}
          itemsPerPage={itemsPerPage}
          selectedAthletes={selectedAthletes}
          sortBy={sortBy}
          sortOrder={sortOrder}
          sportConfigNameById={sportConfigNameById}
          terms={terms}
          totalPages={totalPages}
          onEdit={setEditing}
          onPageChange={setCurrentPage}
          onSortChange={handleSortChange}
          onToggleSelectAll={toggleSelectAll}
          onToggleSelectAthlete={toggleSelectAthlete}
        />
      )}

      <Modal
        title="Importar gimnastas desde CSV"
        description="Trae tu lista completa en un solo paso."
        open={importOpen}
        onClose={() => setImportOpen(false)}
      >
        <ImportExportPanel tenantId={tenantId} academyId={academyId} onImported={handleImported} />
      </Modal>

      <CreateAthleteDialog
        academyId={academyId}
        groups={groups}
        initialSportConfigId={sportConfigFilter || undefined}
        open={createOpen}
        sportConfigs={sportConfigs}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />

      {editing && (
        <EditAthleteDialog
          academyId={academyId}
          athlete={{
            id: editing.id,
            name: editing.name,
            level: editing.level,
            status: editing.status,
            dob: editing.dob ?? null,
            groupId: editing.groupId ?? null,
            groupName: editing.groupName,
            primarySportConfigId: editing.primarySportConfigId ?? null,
            programCode: editing.programCode ?? null,
            levelCode: editing.levelCode ?? null,
            categoryCode: editing.categoryCode ?? null,
          }}
          groups={groups}
          open={Boolean(editing)}
          sportConfigs={sportConfigs}
          onClose={() => setEditing(null)}
          onDeleted={() => {
            if (editing) {
              handleDeleted(editing.id);
            } else {
              handleRefresh();
            }
          }}
          onUpdated={handleRefresh}
        />
      )}
    </div>
  );
});

function setParam(params: URLSearchParams, key: string, value: string) {
  if (value) {
    params.set(key, value);
  } else {
    params.delete(key);
  }
}
