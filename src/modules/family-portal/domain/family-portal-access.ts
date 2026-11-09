import { OperationalError } from "@/modules/shared/domain/operational-error";

/**
 * Family portal authorization (P2 #16).
 *
 * A Supabase Auth account reaches family data only through the canonical
 * chain: guardians.auth_user_id → active guardian → active family_guardians
 * link → active family → family_members open today → active athlete, every
 * hop inside the same organization. This module is pure so the whole matrix
 * is testable; the application layer feeds it rows and never widens it.
 */

/** Organizations whose families may use the portal. */
export const FAMILY_PORTAL_ORGANIZATION_STATUSES = ["trial", "active"] as const;

export interface FamilyPortalGuardianRow {
  guardianId: string;
  organizationId: string;
  organizationName: string;
  organizationTimezone: string;
  defaultCurrency: string;
  guardianActive: boolean;
}

/** One family_guardians link, optionally joined to one family member. */
export interface FamilyPortalLinkRow {
  organizationId: string;
  guardianId: string;
  familyId: string;
  linkActive: boolean;
  canViewAthletes: boolean;
  familyActive: boolean;
  member: {
    organizationId: string;
    athleteId: string;
    startsOn: string;
    endsOn: string | null;
    athleteActive: boolean;
    givenName: string;
    familyName: string;
    preferredName: string | null;
  } | null;
}

export interface FamilyPortalAthlete {
  athleteId: string;
  /** Preferred or given name plus the first surname, nothing else. */
  displayName: string;
}

export interface FamilyPortalAcademy {
  organizationId: string;
  organizationName: string;
  timezone: string;
  defaultCurrency: string;
  /** Families whose fees this account may read. */
  familyIds: string[];
  athletes: FamilyPortalAthlete[];
}

export interface FamilyPortalAccess {
  userId: string;
  academies: FamilyPortalAcademy[];
}

export interface VisibleFamilyAthlete {
  academy: FamilyPortalAcademy;
  athlete: FamilyPortalAthlete;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** YYYY-MM-DD for `instant` in `timeZone` (falls back to UTC). */
export function localIsoDate(instant: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(instant);
  } catch {
    return instant.toISOString().slice(0, 10);
  }
}

export function isMemberOpenOn(
  member: { startsOn: string; endsOn: string | null },
  isoDate: string
): boolean {
  return (
    member.startsOn <= isoDate &&
    (member.endsOn === null || member.endsOn >= isoDate)
  );
}

export function familyAthleteDisplayName(person: {
  givenName: string;
  familyName: string;
  preferredName: string | null;
}): string {
  const first = (person.preferredName?.trim() || person.givenName.trim());
  const surname = person.familyName.trim().split(/\s+/)[0] ?? "";
  return [first, surname].filter(Boolean).join(" ");
}

export function buildFamilyPortalAccess(input: {
  userId: string;
  guardians: FamilyPortalGuardianRow[];
  links: FamilyPortalLinkRow[];
  now: Date;
}): FamilyPortalAccess {
  const academies = new Map<string, FamilyPortalAcademy>();
  const activeGuardians = new Map<string, FamilyPortalGuardianRow>();

  for (const guardian of input.guardians) {
    if (!guardian.guardianActive) continue;
    activeGuardians.set(guardian.guardianId, guardian);
    if (!academies.has(guardian.organizationId)) {
      academies.set(guardian.organizationId, {
        organizationId: guardian.organizationId,
        organizationName: guardian.organizationName,
        timezone: guardian.organizationTimezone,
        defaultCurrency: guardian.defaultCurrency,
        familyIds: [],
        athletes: [],
      });
    }
  }

  for (const link of input.links) {
    const guardian = activeGuardians.get(link.guardianId);
    // Every hop must stay inside the guardian's own academy.
    if (!guardian || guardian.organizationId !== link.organizationId) continue;
    if (!link.linkActive || !link.familyActive) continue;
    const academy = academies.get(guardian.organizationId);
    if (!academy) continue;

    if (!academy.familyIds.includes(link.familyId)) {
      academy.familyIds.push(link.familyId);
    }

    const member = link.member;
    if (!member || !link.canViewAthletes) continue;
    if (member.organizationId !== guardian.organizationId) continue;
    if (!member.athleteActive) continue;
    if (!isMemberOpenOn(member, localIsoDate(input.now, academy.timezone))) {
      continue;
    }
    if (academy.athletes.some((item) => item.athleteId === member.athleteId)) {
      continue;
    }
    academy.athletes.push({
      athleteId: member.athleteId,
      displayName: familyAthleteDisplayName(member),
    });
  }

  for (const academy of academies.values()) {
    academy.familyIds.sort();
    academy.athletes.sort((a, b) =>
      a.displayName.localeCompare(b.displayName, "es")
    );
  }

  return {
    userId: input.userId,
    academies: [...academies.values()].sort((a, b) =>
      a.organizationName.localeCompare(b.organizationName, "es")
    ),
  };
}

function notFound(): OperationalError {
  // Same answer for "foreign", "unknown" and "malformed": no existence oracle.
  return new OperationalError("NOT_FOUND", "Gimnasta no encontrada", 404);
}

/**
 * Resolves an athlete id from the URL against the access set. Anything that
 * is not one of this account's visible athletes is a 404.
 */
export function requireVisibleFamilyAthlete(
  access: FamilyPortalAccess,
  athleteId: string
): VisibleFamilyAthlete {
  if (!UUID_PATTERN.test(athleteId)) throw notFound();
  const normalized = athleteId.toLowerCase();
  for (const academy of access.academies) {
    const athlete = academy.athletes.find(
      (item) => item.athleteId.toLowerCase() === normalized
    );
    if (athlete) return { academy, athlete };
  }
  throw notFound();
}

export function hasFamilyPortalData(access: FamilyPortalAccess): boolean {
  return access.academies.some(
    (academy) => academy.athletes.length > 0 || academy.familyIds.length > 0
  );
}
