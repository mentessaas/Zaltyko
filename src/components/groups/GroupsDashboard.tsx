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
import { AthleteOption, CoachOption, GroupSummary } from "./types";
import { createClient } from "@/lib/supabase/client";
import { TooltipOnboarding } from "@/components/tooltips/TooltipOnboarding";
import { useAcademyContext } from "@/hooks/use-academy-context";
import { getStarterGroupPresets, type StarterGroupPreset } from "@/lib/specialization/operational-presets";
import { summarizeStarterGroupSetup } from "@/lib/groups/starter-setup";

interface GroupsDashboardProps {
  academyId: string;
  initialGroups: GroupSummary[];
  coaches: CoachOption[];
  athletes: AthleteOption[];
  initialFocusGroupId?: string;
}

export function GroupsDashboard({
  academyId,
  initialGroups,
  coaches,
  athletes,
  initialFocusGroupId,
}: GroupsDashboardProps) {
  const { specialization } = useAcademyContext();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [groups, setGroups] = useState(initialGroups);
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
        console.error("Error loading group athletes:", response.status);
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
      console.error("Error loading group athletes:", error);
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

      const response = await fetch(`/api/groups?academyId=${academyId}`, {
        headers: {
        },
        cache: "no-store",
      });

      if (!response.ok) {
        // Silently ignore; UI will still show previous state
        return;
      }

      const data = await response.json();
      if (Array.isArray(data.items)) {
        setGroups(
          hydrateGroups(
            data.items.map((item: any) => ({
              id: item.id,
              academyId,
              name: item.name,
              discipline: item.discipline,
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
  }, [academyId, hydrateGroups]);

  return (
    <div className="space-y-6">
      {starterSetup.starterGroupCount > 0 && (
        <section className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              Ya tienes {starterSetup.starterGroupCount} {starterSetup.starterGroupCount === 1 ? specialization.labels.groupLabel.toLowerCase() : `${specialization.labels.groupLabel.toLowerCase()}s`} creadas desde la plantilla inicial
            </p>
            <p className="text-sm text-muted-foreground">
              Termina de asignar responsables, niveles y gimnastas para que la estructura base quede lista para operar.
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
                {specialization.labels.groupLabel}s sin responsable principal
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
                    Revisar {specialization.labels.classLabel.toLowerCase()}s
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

      <section className="flex flex-col gap-4 rounded-lg border bg-card p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
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
          <TooltipOnboarding
            tooltipId="tooltip_create_group"
            message="Empieza aquí: crea un grupo para organizar a tus atletas por nivel y horario."
          >
            <button
              type="button"
              onClick={() => {
                setSelectedPreset(null);
                setCreateOpen(true);
              }}
              className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-600"
            >
              Nuevo grupo
            </button>
          </TooltipOnboarding>
        </div>
      </section>

      {groups.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center shadow-sm">
          <p className="mb-4 text-sm text-muted-foreground">
            Aún no has creado ningún grupo. Crea tu primer grupo para organizar tus atletas por nivel y horario.
          </p>
          <button
            type="button"
            onClick={() => {
              setSelectedPreset(null);
              setCreateOpen(true);
            }}
            className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-600"
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
        />
      )}
    </div>
  );
}
