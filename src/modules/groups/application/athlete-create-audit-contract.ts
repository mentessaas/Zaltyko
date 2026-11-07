function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** The create flow intentionally audits only the related group and membership IDs. */
export function matchesAthleteCreateAuditAfter(
  after: unknown,
  groupId: string,
  membershipId: string
): boolean {
  return record(after) &&
    Object.keys(after).sort().join(",") === "groupId,membershipId" &&
    after.groupId === groupId &&
    after.membershipId === membershipId;
}
