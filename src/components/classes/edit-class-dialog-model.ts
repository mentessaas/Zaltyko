export interface CoachOption {
  id: string;
  name: string;
  email: string | null;
  sportConfigIds?: string[];
}

export interface GroupOption {
  id: string;
  name: string;
  color: string | null;
  sportConfigId?: string | null;
}

export interface ClassItem {
  id: string;
  name: string;
  weekdays: number[];
  startTime: string | null;
  endTime: string | null;
  capacity: number | null;
  technicalFocus?: string | null;
  apparatus?: string[];
  sportConfigId?: string | null;
  allowsFreeTrial: boolean;
  waitingListEnabled: boolean;
  cancellationHoursBefore: number | null;
  cancellationPolicy: string;
  coaches: CoachOption[];
  groups?: GroupOption[];
}

export interface EditClassFormState {
  name: string;
  selectedWeekdays: string[];
  startTime: string;
  endTime: string;
  capacity: string;
  technicalFocus: string;
  selectedApparatus: string[];
  selectedCoaches: string[];
  selectedGroups: string[];
  allowsFreeTrial: boolean;
  waitingListEnabled: boolean;
  cancellationHoursBefore: number;
  cancellationPolicy: string;
}

export function buildEditClassPayload(
  form: EditClassFormState,
  effectiveSportConfigId: string | null
): Record<string, unknown> {
  return {
    name: form.name.trim(),
    weekdays: normalizeWeekdays(form.selectedWeekdays),
    startTime: form.startTime || null,
    endTime: form.endTime || null,
    capacity: form.capacity ? Number(form.capacity) : null,
    technicalFocus: form.technicalFocus.trim() || null,
    apparatus: form.selectedApparatus,
    sportConfigId: effectiveSportConfigId || null,
    coachIds: form.selectedCoaches,
    groupIds: form.selectedGroups,
    allowsFreeTrial: form.allowsFreeTrial,
    waitingListEnabled: form.waitingListEnabled,
    cancellationHoursBefore: form.cancellationHoursBefore ? Number(form.cancellationHoursBefore) : 24,
    cancellationPolicy: form.cancellationPolicy,
  };
}

export function hasEditClassChanges(
  classItem: ClassItem,
  form: EditClassFormState,
  effectiveSportConfigId: string | null
) {
  const originalCoachIds = classItem.coaches.map((coach) => coach.id).sort();
  const newCoachIds = [...form.selectedCoaches].sort();
  const sameCoaches =
    originalCoachIds.length === newCoachIds.length &&
    originalCoachIds.every((value, index) => value === newCoachIds[index]);

  const originalWeekdays = [...classItem.weekdays].sort((a, b) => a - b);
  const newWeekdays = normalizeWeekdays(form.selectedWeekdays);
  const sameWeekdays =
    originalWeekdays.length === newWeekdays.length &&
    originalWeekdays.every((value, index) => value === newWeekdays[index]);

  const originalCapacity =
    classItem.capacity !== null && classItem.capacity !== undefined
      ? String(classItem.capacity)
      : "";
  const originalGroupIds = (classItem.groups?.map((group) => group.id) ?? []).sort();
  const newGroupIds = [...form.selectedGroups].sort();
  const sameGroups =
    originalGroupIds.length === newGroupIds.length &&
    originalGroupIds.every((value, index) => value === newGroupIds[index]);

  return (
    form.name.trim() !== classItem.name.trim() ||
    !sameWeekdays ||
    form.startTime !== (classItem.startTime ?? "") ||
    form.endTime !== (classItem.endTime ?? "") ||
    form.capacity !== originalCapacity ||
    !sameCoaches ||
    !sameGroups ||
    (effectiveSportConfigId || null) !== (classItem.sportConfigId ?? null) ||
    form.selectedApparatus.join(",") !== (classItem.apparatus ?? []).join(",") ||
    form.technicalFocus !== (classItem.technicalFocus ?? "")
  );
}

function normalizeWeekdays(selectedWeekdays: string[]) {
  return selectedWeekdays
    .map((day) => Number(day))
    .filter((day) => !isNaN(day) && day >= 0 && day <= 6)
    .sort((a, b) => a - b);
}
