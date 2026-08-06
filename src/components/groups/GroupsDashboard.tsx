"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GroupCard } from "./GroupCard";
import { CreateGroupDialog } from "./CreateGroupDialog";
import { EditGroupDialog } from "./EditGroupDialog";
import { AthleteOption, CoachOption, GroupSummary, SportConfigOption } from "./types";
import { createClient } from "@/lib/supabase/client";
import { TooltipOnboarding } from "@/components/tooltips/TooltipOnboarding";
import { useAcademyContext } from "@/hooks/use-academy-context";
import { pluralizeFirstWord } from "@/lib/specialization/registry";
import { getStarterGroupPresets, type StarterGroupPreset } from "@/lib/specialization/operational-presets";
import { summarizeStarterGroupSetup } from "@/lib/groups/starter-setup";
import { logger } from "@/lib/logger";

interface GroupsDashboardProps {
  academyId: string;
  initialGroups: GroupSummary[];
  coaches: CoachOption[];
  athletes: AthleteOption[];
  sportConfigs?: SportConfigOption[];
  initialFocusGroupId?: string;
}

export function GroupsDashboard({
  academyId,
  initialGroups,
  coaches,
  athletes,
  sportConfigs: initialSportConfigs = [],
  initialFocusGroupId,
}: GroupsDashboardProps) {
  const { specialization } = useAcademyContext();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sportConfigFilter = searchParams?.get("sportConfigId") ?? "";
  const [groups, setGroups] = useState(initialGroups);
  const [sportConfigs, setSportConfigs] = useState<SportConfigOption[]>(initialSportConfigs);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<StarterGroupPreset | null>(null);
  const [editingGroup, setEditingGroup] = useState<GroupSummary | null>(null);
  const [currentAthleteIds, setCurrentAthleteIds] = useState<string[]>([]);
  const [loadingAthleteIds, setLoadingAthleteIds] = useState(false);
  const [isRefreshing, startRefreshTransition] = useTransition();

  const assistantsMap = useMemo(() => {
    const map = new Map<string, string>();
    coaches.forEach((coach) => {
      map.set(coach.id, coach.name);
    });
    return map;
  }, [coaches]);

  const hydrateGroups = useCallback(
    (items: GroupSummary[]) =>
      items.map((group) => ({
        ...group,
        assistantNames: group.assistantIds
          .map((assistantId) => assistantsMap.get(assistantId) ?? "Sin nombre")
          .filter(Boolean),
      })),
    [assistantsMap]
  );

  const starterPresets = useMemo(
    () => getStarterGroupPresets(specialization),
    [specialization]
  );
  const starterSetup = useMemo(
    () => summarizeStarterGroupSetup(specialization, groups),
    [groups, specialization]
  );
  const selectedSportConfig = useMemo(
    () => sportConfigs.find((config) => config.id === sportConfigFilter) ?? null,
    [sportConfigFilter, sportConfigs]
  );
  const sportConfigLabelById = useMemo(
    () =>
      new Map(
        sportConfigs.map((config) => [
          config.id,
          `${config.branchName} · ${config.disciplineName}`,
        ])
      ),
    [sportConfigs]
  );

  const updateSportConfigFilter = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams?.toString());
      if (value) {
        params.set("sportConfigId", value);
      } else {
        params.delete("sportConfigId");
      }
      const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
      router.replace(nextUrl, { scroll: false });
      router.refresh();
    },
    [pathname, router, searchParams]
  );

  useEffect(() => {
    setGroups(hydrateGroups(initialGroups));
  }, [initialGroups, hydrateGroups]);

  const loadGroupAthleteIds = useCallback(async (groupId: string) => {
    setLoadingAthleteIds(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const response = await fetch(`/api/groups/${groupId}/athletes`, {
        headers: {
        },
        cache: "no-store",
      });

      if (!response.ok) {
        logger.error("Error loading group athletes:", response.status);
        setCurrentAthleteIds([]);
        return;
      }

      const data = await response.json();
      if (Array.isArray(data.athleteIds)) {
        setCurrentAthleteIds(data.athleteIds);
      } else {
        setCurrentAthleteIds([]);
      }
    } catch (error) {
      logger.error("Error loading group athletes:", error);
      setCurrentAthleteIds([]);
    } finally {
      setLoadingAthleteIds(false);
    }
  }, []);

  const handleEdit = useCallback(
    async (group: GroupSummary) => {
      setEditingGroup(group);
      await loadGroupAthleteIds(group.id);
    },
    [loadGroupAthleteIds]
  );

  const handleEditClose = useCallback(() => {
    setEditingGroup(null);
    setCurrentAthleteIds([]);
  }, []);

  const handleGuidedEdit = useCallback(
    async (groupId: string) => {
      const target = groups.find((item) => item.id === groupId);
      if (!target) {
        return;
      }
      await handleEdit(target);
    },
    [groups, handleEdit]
  );

  useEffect(() => {
    if (!initialFocusGroupId || editingGroup) {
      return;
    }

    const target = groups.find((item) => item.id === initialFocusGroupId);
    if (!target) {
      return;
    }

    void handleEdit(target);

    const params = new URLSearchParams(searchParams?.toString());
    params.delete("focusGroup");
    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [editingGroup, groups, handleEdit, initialFocusGroupId, pathname, router, searchParams]);

  const refreshGroups = useCallback(async () => {
    startRefreshTransition(async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const params = new URLSearchParams({ academyId });
      if (sportConfigFilter) {
        params.set("sportConfigId", sportConfigFilter);
      }

      const response = await fetch(`/api/groups?${params.toString()}`, {
        headers: {
        },
        cache: "no-store",
      });

      if (!response.ok) {
        // Silently ignore; UI will still show previous state
        return;
      }

      const payload = await response.json();
      const data = payload.data ?? payload;
      if (Array.isArray(data.sportConfigs)) {
        setSportConfigs(data.sportConfigs);
      }
      if (Array.isArray(data.items)) {
        setGroups(
          hydrateGroups(
            data.items.map((item: any) => ({
              id: item.id,
              academyId,
              name: item.name,
              discipline: item.discipline,
              sportConfigId: item.sportConfigId ?? null,
              programCode: item.programCode ?? null,
              levelCode: item.levelCode ?? null,
              categoryCode: item.categoryCode ?? null,
              level: item.level ?? null,
              technicalFocus: item.technicalFocus ?? null,
              apparatus: item.apparatus ?? [],
              sessionBlocks: item.sessionBlocks ?? [],
              color: item.color ?? null,
              coachId: item.coachId ?? null,
              coachName: item.coachName ?? null,
              assistantIds: Array.isArray(item.assistantIds) ? item.assistantIds : [],
              assistantNames: [],
              athleteCount: Number(item.athleteCount ?? 0),
              createdAt: item.createdAt ?? new Date().toISOString(),
              monthlyFeeCents: item.monthlyFeeCents ?? null,
              billingItemId: item.billingItemId ?? null,
            }))
          )
        );
      }
    });
  }, [academyId, hydrateGroups, sportConfigFilter]);

  useEffect(() => {
    void refreshGroups();
  }, [refreshGroups]);

  return (
    <div className="space-y-6">
      {starterSetup.starterGroupCount > 0 && (
        <section className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              Ya tienes {starterSetup.starterGroupCount} {starterSetup.starterGroupCount === 1 ? specialization.labels.groupLabel.toLowerCase() : pluralizeFirstWord(specialization.labels.groupLabel).toLowerCase()} creadas desde la plantilla inicial
            </p>
            <p className="text-sm text-muted-foreground">
              Termina de asignar responsables, niveles y {specialization.labels.athletesPlural.toLowerCase()} para que la estructura base quede lista para operar.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-md border bg-background/80 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Listos para operar
              </p>
              <p className="mt-1 text-2xl font-bold text-foreground">{starterSetup.readyCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {starterSetup.completionPercentage}% de la plantilla ya está afinada
              </p>
            </div>
            <div className="rounded-md border bg-background/80 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Responsables pendientes
              </p>
              <p className="mt-1 text-2xl font-bold text-foreground">{starterSetup.missingCoachCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {pluralizeFirstWord(specialization.labels.groupLabel)} sin responsable principal
              </p>
            </div>
            <div className="rounded-md border bg-background/80 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Nivel por definir
              </p>
              <p className="mt-1 text-2xl font-bold text-foreground">{starterSetup.missingLevelCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Bloques base sin tramo técnico cerrado
              </p>
            </div>
            <div className="rounded-md border bg-background/80 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Estructura pendiente
              </p>
              <p className="mt-1 text-2xl font-bold text-foreground">
                {starterSetup.emptyGroupCount + starterSetup.missingTemplateCount}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Entre grupos vacíos y sugerencias todavía no creadas
              </p>
            </div>
          </div>

          {(starterSetup.items.some((item) => !item.isReady) || starterSetup.missingTemplateCount > 0) && (
            <div className="rounded-md border bg-background/80 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Puesta a punto guiada</p>
                  <p className="text-sm text-muted-foreground">
                    Empieza por los grupos base que todavía necesitan ajustes.
                  </p>
                </div>
                <Button variant="outline" asChild>
                  <Link href={`/app/${academyId}/classes`}>
                    Revisar {pluralizeFirstWord(specialization.labels.classLabel).toLowerCase()}
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>

              <div className="mt-4 space-y-3">
                {starterSetup.items
                  .filter((item) => !item.isReady)
                  .slice(0, 3)
                  .map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-3 rounded-md border border-dashed border-border/70 p-3 lg:flex-row lg:items-center lg:justify-between"
                    >
                      <div className="space-y-2">
                        <Link
                          href={`/app/${academyId}/groups/${item.id}`}
                          className="text-sm font-semibold text-primary hover:underline"
                        >
                          {item.name}
                        </Link>
                        <div className="flex flex-wrap gap-2">
                          {item.issues.map((issue) => (
                            <Badge key={issue} variant="outline" className="bg-background">
                              {issue}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => void handleGuidedEdit(item.id)}>
                          Ajustar ahora
                        </Button>
                        <Button variant="outline" asChild>
                          <Link href={`/app/${academyId}/groups/${item.id}`}>Abrir ficha</Link>
                        </Button>
                      </div>
                    </div>
                  ))}

                {starterSetup.missingTemplateNames.slice(0, 2).map((name) => (
                  <div
                    key={name}
                    className="flex flex-col gap-3 rounded-md border border-dashed border-border/70 p-3 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">{name}</p>
                      <p className="text-sm text-muted-foreground">
                        Este grupo sugerido de la plantilla inicial aún no se ha creado.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => {
                        const preset = starterPresets.find((entry) => entry.name === name) ?? null;
                        setSelectedPreset(preset);
                        setCreateOpen(true);
                      }}
                    >
                      Crear {specialization.labels.groupLabel.toLowerCase()}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <section className="flex flex-col gap-4 rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.45)] lg:flex-row lg:items-center lg:justify-between">
        <div className="flex-1 space-y-2">
          <p className="text-sm font-medium text-foreground">
            Estructura inicial sugerida para {specialization.labels.disciplineName.toLowerCase()}
          </p>
          <div className="flex flex-wrap gap-2">
            {starterPresets.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => {
                  setSelectedPreset(preset);
                  setCreateOpen(true);
                }}
                className="rounded-md border border-border bg-background px-3 py-2 text-left text-xs transition hover:border-primary hover:bg-primary/5"
              >
                <span className="block font-semibold text-foreground">{preset.name}</span>
                <span className="block text-muted-foreground">{preset.level}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={sportConfigFilter}
            onChange={(event) => updateSportConfigFilter(event.target.value)}
            className="min-h-10 min-w-[220px] rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">Todas las ramas</option>
            {sportConfigs.map((config) => (
              <option key={config.id} value={config.id}>
                {config.branchName} · {config.disciplineName}
              </option>
            ))}
          </select>
          <TooltipOnboarding
            tooltipId="tooltip_create_group"
            message={`Empieza aquí: crea un grupo para organizar a tus ${specialization.labels.athletesPlural.toLowerCase()} por nivel y horario.`}
          >
            <button
              type="button"
              onClick={() => {
                setSelectedPreset(null);
                setCreateOpen(true);
              }}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-zaltyko-teal px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-dark"
            >
              Nuevo grupo
            </button>
          </TooltipOnboarding>
        </div>
      </section>

      {selectedSportConfig && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
          Mostrando solo grupos de{" "}
          <span className="font-semibold text-foreground">
            {selectedSportConfig.branchName} · {selectedSportConfig.disciplineName}
          </span>
          .
        </div>
      )}

      {groups.length === 0 ? (
        <div className="rounded-[22px] border border-dashed border-slate-300 bg-white p-12 text-center shadow-[0_18px_50px_-32px_rgba(15,23,42,0.45)]">
          <p className="mb-4 text-sm text-muted-foreground">
            {selectedSportConfig
              ? `No hay grupos para ${selectedSportConfig.branchName} · ${selectedSportConfig.disciplineName}.`
              : `Aún no has creado ningún grupo. Crea tu primer grupo para organizar tus ${specialization.labels.athletesPlural.toLowerCase()} por nivel y horario.`}
          </p>
          <button
            type="button"
            onClick={() => {
              setSelectedPreset(null);
              setCreateOpen(true);
            }}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-zaltyko-teal px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-dark"
          >
            Crear primer grupo
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => (
            <GroupCard
              key={group.id}
              academyId={academyId}
              group={group}
              sportConfigLabel={
                group.sportConfigId ? sportConfigLabelById.get(group.sportConfigId) ?? null : null
              }
              onEdit={handleEdit}
            />
          ))}
        </div>
      )}

      <CreateGroupDialog
        academyId={academyId}
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setSelectedPreset(null);
        }}
        onCreated={refreshGroups}
        coaches={coaches}
        athletes={athletes}
        initialPreset={selectedPreset}
        sportConfigs={sportConfigs}
        initialSportConfigId={sportConfigFilter || undefined}
      />

      {editingGroup && (
        <EditGroupDialog
          academyId={academyId}
          group={editingGroup}
          open={!!editingGroup}
          onClose={handleEditClose}
          onUpdated={refreshGroups}
          coaches={coaches}
          athletes={athletes}
          currentAthleteIds={currentAthleteIds}
          sportConfigs={sportConfigs}
        />
      )}
    </div>
  );
}
