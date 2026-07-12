import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, memberships, profiles } from "@/db/schema";

export interface BillingAcademyAccess {
  id: string;
  tenantId: string;
  name: string;
  ownerProfileId: string;
  ownerUserId: string;
  ownerName: string | null;
}

export async function getBillingAcademyAccess(params: {
  academyId: string;
  userId: string;
  profileId: string;
  profileRole: string;
}): Promise<BillingAcademyAccess | null> {
  const [academy] = await db
    .select({
      id: academies.id,
      tenantId: academies.tenantId,
      name: academies.name,
      ownerProfileId: academies.ownerId,
      ownerUserId: profiles.userId,
      ownerName: profiles.name,
    })
    .from(academies)
    .innerJoin(profiles, eq(academies.ownerId, profiles.id))
    .where(eq(academies.id, params.academyId))
    .limit(1);

  if (!academy) return null;

  if (params.profileRole === "super_admin" || academy.ownerProfileId === params.profileId) {
    return academy;
  }

  const [ownerMembership] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.academyId, params.academyId),
        eq(memberships.userId, params.userId),
        eq(memberships.role, "owner")
      )
    )
    .limit(1);

  return ownerMembership ? academy : null;
}
