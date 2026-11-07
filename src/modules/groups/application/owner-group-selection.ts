type GroupOption = { id: string };

export function selectOwnerGroup<T extends GroupOption>(
  accessibleGroups: readonly T[],
  requestedGroupId?: string
): T | null {
  if (requestedGroupId) {
    return accessibleGroups.find((group) => group.id === requestedGroupId) ?? null;
  }

  return accessibleGroups[0] ?? null;
}
