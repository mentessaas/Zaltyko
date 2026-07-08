export function resolveCandidateGroupIds(params: {
  groupIds?: string[];
  groupId?: string | null;
  currentGroupIds: string[];
}): string[] {
  const candidateGroupIds =
    params.groupIds !== undefined
      ? params.groupIds
      : params.groupId !== undefined
      ? params.groupId
        ? [params.groupId]
        : []
      : params.currentGroupIds;

  return Array.from(new Set(candidateGroupIds));
}

export function resolveEffectiveSportConfigId(params: {
  requestedSportConfigId?: string | null;
  groupSportConfigIds: string[];
  currentSportConfigId?: string | null;
}): string | null {
  if (params.requestedSportConfigId !== undefined) {
    return params.requestedSportConfigId;
  }

  const uniqueGroupSportConfigIds = Array.from(new Set(params.groupSportConfigIds.filter(Boolean)));
  if (uniqueGroupSportConfigIds.length === 1) {
    return uniqueGroupSportConfigIds[0];
  }

  return params.currentSportConfigId ?? null;
}

export function hasMixedSportConfigGroups(groupSportConfigIds: string[], requestedSportConfigId?: string | null): boolean {
  return groupSportConfigIds.length > 1 && !requestedSportConfigId;
}

export function normalizeClassApparatus(apparatus?: string[] | null): string[] | null | undefined {
  if (apparatus === undefined) return undefined;
  if (!apparatus || apparatus.length === 0) return null;
  return Array.from(new Set(apparatus.map((item) => item.trim()).filter(Boolean)));
}

export function normalizeWeekdays(weekdays?: number[]): number[] | null {
  return weekdays !== undefined ? Array.from(new Set(weekdays)).sort((a, b) => a - b) : null;
}

export function resolveFinalSchedule(params: {
  bodyWeekdays?: number[];
  currentWeekdays: number[];
  bodyStartTime?: string | null;
  bodyEndTime?: string | null;
  currentStartTime?: string | null;
  currentEndTime?: string | null;
}) {
  return {
    weekdays:
      params.bodyWeekdays !== undefined
        ? Array.from(new Set(params.bodyWeekdays)).sort((a, b) => a - b)
        : params.currentWeekdays,
    startTime:
      params.bodyStartTime !== undefined
        ? params.bodyStartTime
        : params.currentStartTime
        ? String(params.currentStartTime)
        : null,
    endTime:
      params.bodyEndTime !== undefined
        ? params.bodyEndTime
        : params.currentEndTime
        ? String(params.currentEndTime)
        : null,
  };
}
