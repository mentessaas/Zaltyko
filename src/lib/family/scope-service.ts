import { and, eq, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { academies, athletes, familyContacts, guardianAthletes, guardians, profiles } from "@/db/schema";

export interface FamilyChildSummary {
  id: string;
  name: string;
  level: string | null;
  status: string;
  academyId: string;
  academyName: string;
}

export async function getFamilyChildrenForUser({
  userId,
  email,
}: {
  userId: string;
  email: string;
}): Promise<FamilyChildSummary[]> {
  const parentEmail = email.toLowerCase();

  const [profile] = await db
    .select({
      id: profiles.id,
      tenantId: profiles.tenantId,
      role: profiles.role,
    })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  if (!profile || (profile.role !== "parent" && profile.role !== "athlete")) {
    return [];
  }

  const legacyChildren = await db
    .select({
      id: athletes.id,
      name: athletes.name,
      level: athletes.level,
      status: athletes.status,
      academyId: athletes.academyId,
      academyName: academies.name,
    })
    .from(familyContacts)
    .innerJoin(athletes, eq(familyContacts.athleteId, athletes.id))
    .innerJoin(academies, eq(athletes.academyId, academies.id))
    .where(
      and(
        eq(familyContacts.tenantId, profile.tenantId),
        eq(athletes.tenantId, profile.tenantId),
        eq(academies.tenantId, profile.tenantId),
        sql`lower(${familyContacts.email}) = ${parentEmail}`
      )
    );

  const guardianChildren = await db
    .select({
      id: athletes.id,
      name: athletes.name,
      level: athletes.level,
      status: athletes.status,
      academyId: athletes.academyId,
      academyName: academies.name,
    })
    .from(guardians)
    .innerJoin(guardianAthletes, eq(guardianAthletes.guardianId, guardians.id))
    .innerJoin(athletes, eq(guardianAthletes.athleteId, athletes.id))
    .innerJoin(academies, eq(athletes.academyId, academies.id))
    .where(
      and(
        eq(guardians.tenantId, profile.tenantId),
        eq(guardianAthletes.tenantId, profile.tenantId),
        eq(athletes.tenantId, profile.tenantId),
        eq(academies.tenantId, profile.tenantId),
        or(
          eq(guardians.profileId, profile.id),
          sql`lower(${guardians.email}) = ${parentEmail}`
        )
      )
    );

  const childrenById = new Map<string, FamilyChildSummary>();
  for (const child of [...legacyChildren, ...guardianChildren]) {
    childrenById.set(child.id, child);
  }

  return Array.from(childrenById.values());
}
