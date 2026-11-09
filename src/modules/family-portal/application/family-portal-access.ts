import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  athletes,
  families,
  familyGuardians,
  familyMembers,
  guardians,
  organizations,
  people,
} from "@/db/zaltyko-schema";
import {
  FAMILY_PORTAL_ORGANIZATION_STATUSES,
  buildFamilyPortalAccess,
  type FamilyPortalAccess,
  type FamilyPortalLinkRow,
} from "@/modules/family-portal/domain/family-portal-access";

/** One account may be a guardian in a handful of academies, never hundreds. */
const MAX_GUARDIAN_ROWS = 20;
/** Links × members (including closed memberships) for those guardians. */
const MAX_LINK_ROWS = 500;

/**
 * Resolves what a Supabase Auth account may see in the family portal. The
 * SQL already filters on the canonical chain; buildFamilyPortalAccess checks
 * every hop again so a widened query can never widen the result.
 */
export async function resolveFamilyPortalAccess(input: {
  userId: string;
  now?: Date;
}): Promise<FamilyPortalAccess> {
  const now = input.now ?? new Date();
  const guardianRows = await db
    .select({
      guardianId: guardians.id,
      organizationId: guardians.organizationId,
      organizationName: organizations.name,
      organizationTimezone: organizations.defaultTimezone,
      defaultCurrency: organizations.defaultCurrency,
      guardianActive: guardians.isActive,
    })
    .from(guardians)
    .innerJoin(organizations, eq(organizations.id, guardians.organizationId))
    .where(
      and(
        eq(guardians.authUserId, input.userId),
        eq(guardians.isActive, true),
        inArray(organizations.status, [...FAMILY_PORTAL_ORGANIZATION_STATUSES])
      )
    )
    .orderBy(asc(organizations.name))
    .limit(MAX_GUARDIAN_ROWS);

  if (guardianRows.length === 0) {
    return { userId: input.userId, academies: [] };
  }

  const linkRows = await db
    .select({
      organizationId: familyGuardians.organizationId,
      guardianId: familyGuardians.guardianId,
      familyId: familyGuardians.familyId,
      linkActive: familyGuardians.isActive,
      canViewAthletes: familyGuardians.canViewAthletes,
      familyActive: families.isActive,
      memberOrganizationId: familyMembers.organizationId,
      athleteId: familyMembers.athleteId,
      startsOn: familyMembers.startsOn,
      endsOn: familyMembers.endsOn,
      athleteActive: athletes.isActive,
      givenName: people.givenName,
      familyName: people.familyName,
      preferredName: people.preferredName,
    })
    .from(familyGuardians)
    .innerJoin(
      families,
      and(
        eq(families.organizationId, familyGuardians.organizationId),
        eq(families.id, familyGuardians.familyId)
      )
    )
    .leftJoin(
      familyMembers,
      and(
        eq(familyMembers.organizationId, familyGuardians.organizationId),
        eq(familyMembers.familyId, familyGuardians.familyId)
      )
    )
    .leftJoin(
      athletes,
      and(
        eq(athletes.organizationId, familyMembers.organizationId),
        eq(athletes.id, familyMembers.athleteId)
      )
    )
    .leftJoin(
      people,
      and(
        eq(people.organizationId, athletes.organizationId),
        eq(people.id, athletes.personId)
      )
    )
    .where(
      and(
        inArray(
          familyGuardians.organizationId,
          [...new Set(guardianRows.map((row) => row.organizationId))]
        ),
        inArray(
          familyGuardians.guardianId,
          guardianRows.map((row) => row.guardianId)
        ),
        eq(familyGuardians.isActive, true),
        eq(families.isActive, true)
      )
    )
    .limit(MAX_LINK_ROWS);

  const links: FamilyPortalLinkRow[] = linkRows.map((row) => ({
    organizationId: row.organizationId,
    guardianId: row.guardianId,
    familyId: row.familyId,
    linkActive: row.linkActive,
    canViewAthletes: row.canViewAthletes,
    familyActive: row.familyActive,
    member:
      row.athleteId &&
      row.memberOrganizationId &&
      row.startsOn &&
      row.athleteActive !== null &&
      row.givenName !== null &&
      row.familyName !== null
        ? {
            organizationId: row.memberOrganizationId,
            athleteId: row.athleteId,
            startsOn: row.startsOn,
            endsOn: row.endsOn,
            athleteActive: row.athleteActive,
            givenName: row.givenName,
            familyName: row.familyName,
            preferredName: row.preferredName,
          }
        : null,
  }));

  return buildFamilyPortalAccess({
    userId: input.userId,
    guardians: guardianRows,
    links,
    now,
  });
}
