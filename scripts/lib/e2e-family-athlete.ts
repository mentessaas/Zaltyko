export interface ConfiguredE2EFamilyAthlete {
  id: string;
  name: string;
  user_id: string | null;
  academy_id: string;
  tenant_id: string;
}

export function assertConfiguredE2EFamilyAthlete(
  row: ConfiguredE2EFamilyAthlete | undefined,
  expected: {
    academyId: string;
    tenantId: string;
    athleteUserId: string;
    deterministicName: string;
    legacyName: string;
  }
) {
  const hasExpectedName =
    row?.name === expected.deterministicName ||
    (row?.name === expected.legacyName && row.user_id === expected.athleteUserId);
  const hasCompatibleUser =
    !row?.user_id || row.user_id === expected.athleteUserId;

  if (
    !row ||
    row.academy_id !== expected.academyId ||
    row.tenant_id !== expected.tenantId ||
    !hasExpectedName ||
    !hasCompatibleUser
  ) {
    throw new Error(
      "E2E_ATHLETE_ID must point to a disposable athlete row for this family/academy."
    );
  }

  return row.id;
}
