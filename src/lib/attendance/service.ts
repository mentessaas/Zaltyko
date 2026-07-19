import type { ProfileRow } from "@/lib/authz";
import { verifyCoachClassScope, type PermissionCheck } from "@/lib/permissions";

export async function verifyAttendanceWriteAccess({
  tenantId,
  academyId,
  classId,
  profile,
}: {
  tenantId: string;
  academyId: string;
  classId: string;
  profile: Pick<ProfileRow, "id" | "userId" | "role" | "tenantId">;
}): Promise<PermissionCheck> {
  return verifyCoachClassScope({
    tenantId,
    academyId,
    classId,
    profile,
  });
}
