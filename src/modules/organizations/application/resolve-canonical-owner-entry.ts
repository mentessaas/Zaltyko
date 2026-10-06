import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { organizationMembers, organizations } from "@/db/zaltyko-schema";

export async function findCanonicalOwnerEntry(userId: string) {
  const [membership] = await db
    .select({
      organizationId: organizationMembers.organizationId,
      role: organizationMembers.role,
    })
    .from(organizationMembers)
    .innerJoin(
      organizations,
      eq(organizations.id, organizationMembers.organizationId)
    )
    .where(
      and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.status, "active"),
        inArray(organizationMembers.role, ["owner", "admin", "manager"]),
        inArray(organizations.status, ["trial", "active"])
      )
    )
    .orderBy(asc(organizations.name))
    .limit(1);
  return membership ?? null;
}
