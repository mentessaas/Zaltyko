"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { GroupCard } from "./GroupCard";
import { CreateGroupDialog } from "./CreateGroupDialog";
import { EditGroupDialog } from "./EditGroupDialog";
import { AthleteOption, CoachOption, GroupSummary } from "./types";
import { createClient } from "@/lib/supabase/client";
import { TooltipOnboarding } from "@/components/tooltips/TooltipOnboarding";

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
          ...(user?.id ? { "x-user-id": user.id } : {}),
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
      <section className="flex flex-col gap-4 rounded-lg border bg-card p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex-1" />
        <div className="flex items-center gap-3">
          <TooltipOnboarding
            tooltipId="tooltip_create_group"
            message="Empieza aquí: crea un grupo para organizar a tus atletas por nivel y horario."
          >
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
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
            onClick={() => setCreateOpen(true)}
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
        onClose={() => setCreateOpen(false)}
        onCreated={refreshGroups}
        coaches={coaches}
        athletes={athletes}
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
