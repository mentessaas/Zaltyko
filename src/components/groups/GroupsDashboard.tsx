"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { GroupCard } from "./GroupCard";
import { CreateGroupDialog } from "./CreateGroupDialog";
import { AthleteOption, CoachOption, GroupSummary } from "./types";
import { createClient } from "@/lib/supabase/client";

interface GroupsDashboardProps {
  academyId: string;
  initialGroups: GroupSummary[];
  coaches: CoachOption[];
  athletes: AthleteOption[];
}

export function GroupsDashboard({
  academyId,
  initialGroups,
  coaches,
  athletes,
}: GroupsDashboardProps) {
  const [groups, setGroups] = useState(initialGroups);
  const [createOpen, setCreateOpen] = useState(false);
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

  useEffect(() => {
    setGroups(hydrateGroups(initialGroups));
  }, [initialGroups, hydrateGroups]);

  const refreshGroups = useCallback(async () => {
    startRefreshTransition(async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const response = await fetch(`/api/groups?academyId=${academyId}`, {
        headers: {
          ...(user?.id ? { "x-user-id": user.id } : {}),
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
              color: item.color ?? null,
              coachId: item.coachId ?? null,
              coachName: item.coachName ?? null,
              assistantIds: Array.isArray(item.assistantIds) ? item.assistantIds : [],
              assistantNames: [],
              athleteCount: Number(item.athleteCount ?? 0),
              createdAt: item.createdAt ?? new Date().toISOString(),
            }))
          )
        );
      }
    });
  }, [academyId, hydrateGroups]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Grupos de entrenamiento</h2>
          <p className="text-sm text-muted-foreground">
            Organiza a tus atletas por niveles o equipos. Los grupos te permiten automatizar asistencia,
            evaluaciones y facturación.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => refreshGroups()} disabled={isRefreshing}>
            {isRefreshing ? "Actualizando…" : "Refrescar"}
          </Button>
          <Button onClick={() => setCreateOpen(true)}>Nuevo grupo</Button>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-12 text-center text-muted-foreground">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Aún no has creado grupos</h3>
            <p className="text-sm">
              Crea tu primer grupo para agrupar atletas por niveles, horarios o equipos de competencia.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>Crear mi primer grupo</Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => (
            <GroupCard key={group.id} academyId={academyId} group={group} />
          ))}
        </div>
      )}

      <CreateGroupDialog
        academyId={academyId}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={refreshGroups}
        coaches={coaches}
        athletes={athletes}
      />
    </div>
  );
}
