import type { ProfileRow } from "@/lib/authz";
import { verifyCoachAthleteScope, type PermissionCheck } from "@/lib/permissions";

export async function verifyProgressAccess({
  tenantId,
  academyId,
  athleteId,
  athleteGroupId,
  profile,
}: {
  tenantId: string;
  academyId: string;
  athleteId: string;
  athleteGroupId?: string | null;
  profile: Pick<ProfileRow, "id" | "userId" | "role" | "tenantId">;
}): Promise<PermissionCheck> {
  return verifyCoachAthleteScope({
    tenantId,
    academyId,
    athleteId,
    athleteGroupId,
    profile,
  });
}
