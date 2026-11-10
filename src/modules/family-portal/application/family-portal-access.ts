import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  athletes,
  families,
  familyGuardians,
  familyMembers,
  familyPayers,
  guardians,
  organizations,
  people,
} from "@/db/zaltyko-schema";
import { logger } from "@/lib/logger";
import {
  FAMILY_PORTAL_ORGANIZATION_STATUSES,
  buildFamilyPortalAccess,
  type FamilyPortalAccess,
  type FamilyPortalLinkRow,
} from "@/modules/family-portal/domain/family-portal-access";

/** One account may be a guardian in a handful of academies, never hundreds. */
const MAX_GUARDIAN_ROWS = 20;
/** Open links × open members for those guardians. */
const MAX_LINK_ROWS = 500;
const MAX_PAYER_ROWS = 100;

/** Academy-local calendar date of `now` for the joined organization row. */
function organizationToday(now: Date) {
  return sql`(${now.toISOString()}::timestamptz at time zone ${organizations.defaultTimezone})::date`;
}

function warnIfTruncated(kind: string, rows: number, limit: number, userId: string) {
  if (rows <= limit) return;
  // Never silent: a truncated access set hides data the family should see.
  logger.error("family_portal.access_truncated", undefined, {
    kind,
    limit,
    userIdPrefix: userId.slice(0, 8),
  });
}

/**
 * Resolves what a Supabase Auth account may see in the family portal. The
 * SQL already filters on the canonical chain; buildFamilyPortalAccess checks
 * every hop again so a widened query can never widen the result.
 *
 * Internal to the family portal: reads call it themselves with the session
 * user id, so no caller can hand them a fabricated access object.
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
      organizationStatus: organizations.status,
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
    .orderBy(asc(organizations.name), asc(guardians.id))
    .limit(MAX_GUARDIAN_ROWS + 1);
  warnIfTruncated("guardians", guardianRows.length, MAX_GUARDIAN_ROWS, input.userId);
  const guardiansInScope = guardianRows.slice(0, MAX_GUARDIAN_ROWS);

  if (guardiansInScope.length === 0) {
    return { userId: input.userId, academies: [] };
  }
  const organizationIds = [
    ...new Set(guardiansInScope.map((row) => row.organizationId)),
  ];
  const guardianIds = guardiansInScope.map((row) => row.guardianId);
  const today = organizationToday(now);

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
      organizations,
      eq(organizations.id, familyGuardians.organizationId)
    )
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
        eq(familyMembers.familyId, familyGuardians.familyId),
        // Only memberships open today in the academy's own calendar.
        sql`${familyMembers.startsOn} <= ${today}`,
        or(isNull(familyMembers.endsOn), sql`${familyMembers.endsOn} >= ${today}`)
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
        inArray(familyGuardians.organizationId, organizationIds),
        inArray(familyGuardians.guardianId, guardianIds),
        eq(familyGuardians.isActive, true),
        eq(families.isActive, true)
      )
    )
    .orderBy(asc(familyGuardians.familyId), asc(familyMembers.athleteId))
    .limit(MAX_LINK_ROWS + 1);
  warnIfTruncated("links", linkRows.length, MAX_LINK_ROWS, input.userId);

  const payerRows = await db
    .select({
      organizationId: familyPayers.organizationId,
      guardianId: familyPayers.guardianId,
      familyId: familyPayers.familyId,
      startsOn: familyPayers.startsOn,
      endsOn: familyPayers.endsOn,
    })
    .from(familyPayers)
    .innerJoin(organizations, eq(organizations.id, familyPayers.organizationId))
    .where(
      and(
        inArray(familyPayers.organizationId, organizationIds),
        inArray(familyPayers.guardianId, guardianIds),
        sql`${familyPayers.startsOn} <= ${today}`,
        or(isNull(familyPayers.endsOn), sql`${familyPayers.endsOn} >= ${today}`)
      )
    )
    .orderBy(asc(familyPayers.familyId), asc(familyPayers.id))
    .limit(MAX_PAYER_ROWS + 1);
  warnIfTruncated("payers", payerRows.length, MAX_PAYER_ROWS, input.userId);

  const links: FamilyPortalLinkRow[] = linkRows
    .slice(0, MAX_LINK_ROWS)
    .map((row) => ({
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
    guardians: guardiansInScope,
    links,
    payers: payerRows.slice(0, MAX_PAYER_ROWS),
    now,
  });
}
