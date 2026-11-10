import { OperationalError } from "@/modules/shared/domain/operational-error";

/**
 * Family portal authorization (P2 #16).
 *
 * A Supabase Auth account reaches family data only through the canonical
 * chain, every hop inside the same organization:
 *
 *  - athletes: guardians.auth_user_id → active guardian (academy trial or
 *    active) → active family_guardians link with can_view_athletes → active
 *    family → family_members open today → active athlete;
 *  - fees (provisional rule, pending Elvis): the same guardian, active link
 *    and active family, plus a family_payers row for that guardian open
 *    today. A guardian who neither sees athletes nor pays sees nothing.
 *
 * This module is pure so the whole matrix is testable. The application layer
 * also enforces the same chain inside every SQL read (family-portal-sql.ts),
 * so neither layer alone can widen what a family sees.
 */

/** Organizations whose families may use the portal. */
export const FAMILY_PORTAL_ORGANIZATION_STATUSES = ["trial", "active"] as const;

export interface FamilyPortalGuardianRow {
  guardianId: string;
  organizationId: string;
  organizationName: string;
  organizationStatus: string;
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

/** One family_payers row of one of the account's guardians. */
export interface FamilyPortalPayerRow {
  organizationId: string;
  guardianId: string;
  familyId: string;
  startsOn: string;
  endsOn: string | null;
}

export interface FamilyPortalAthlete {
  athleteId: string;
  /** Preferred or given name plus the first surname, nothing else. */
  displayName: string;
  /**
   * Earliest start of the memberships that link this account to the athlete
   * today. Schedule and attendance before this academy-local date stay
   * hidden: a family does not inherit another family's history.
   */
  visibleSince: string;
}

export interface FamilyPortalAcademy {
  organizationId: string;
  organizationName: string;
  timezone: string;
  defaultCurrency: string;
  /** Families whose fees this account may read (open payer only). */
  feeFamilyIds: string[];
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

export function isOpenOn(
  period: { startsOn: string; endsOn: string | null },
  isoDate: string
): boolean {
  return (
    period.startsOn <= isoDate &&
    (period.endsOn === null || period.endsOn >= isoDate)
  );
}

export function familyAthleteDisplayName(person: {
  givenName: string;
  familyName: string;
  preferredName: string | null;
}): string {
  const first = person.preferredName?.trim() || person.givenName.trim();
  const surname = person.familyName.trim().split(/\s+/)[0] ?? "";
  return [first, surname].filter(Boolean).join(" ");
}

function isPortalOrganizationStatus(status: string): boolean {
  return (FAMILY_PORTAL_ORGANIZATION_STATUSES as readonly string[]).includes(status);
}

export function buildFamilyPortalAccess(input: {
  userId: string;
  guardians: FamilyPortalGuardianRow[];
  links: FamilyPortalLinkRow[];
  payers: FamilyPortalPayerRow[];
  now: Date;
}): FamilyPortalAccess {
  const academies = new Map<string, FamilyPortalAcademy>();
  const activeGuardians = new Map<string, FamilyPortalGuardianRow>();
  const todayByOrganization = new Map<string, string>();

  for (const guardian of input.guardians) {
    if (!guardian.guardianActive) continue;
    if (!isPortalOrganizationStatus(guardian.organizationStatus)) continue;
    activeGuardians.set(guardian.guardianId, guardian);
    if (!academies.has(guardian.organizationId)) {
      todayByOrganization.set(
        guardian.organizationId,
        localIsoDate(input.now, guardian.organizationTimezone)
      );
      academies.set(guardian.organizationId, {
        organizationId: guardian.organizationId,
        organizationName: guardian.organizationName,
        timezone: guardian.organizationTimezone,
        defaultCurrency: guardian.defaultCurrency,
        feeFamilyIds: [],
        athletes: [],
      });
    }
  }

  /** guardianId|familyId pairs with an active link to an active family. */
  const activeLinks = new Set<string>();
  const athletesByAcademy = new Map<string, Map<string, FamilyPortalAthlete>>();

  for (const link of input.links) {
    const guardian = activeGuardians.get(link.guardianId);
    // Every hop must stay inside the guardian's own academy.
    if (!guardian || guardian.organizationId !== link.organizationId) continue;
    if (!link.linkActive || !link.familyActive) continue;
    activeLinks.add(`${link.guardianId}|${link.familyId}`);

    const member = link.member;
    if (!member || !link.canViewAthletes) continue;
    if (member.organizationId !== guardian.organizationId) continue;
    if (!member.athleteActive) continue;
    const today = todayByOrganization.get(guardian.organizationId);
    if (!today || !isOpenOn(member, today)) continue;

    const byId =
      athletesByAcademy.get(guardian.organizationId) ??
      new Map<string, FamilyPortalAthlete>();
    athletesByAcademy.set(guardian.organizationId, byId);
    const existing = byId.get(member.athleteId);
    if (existing) {
      if (member.startsOn < existing.visibleSince) {
        existing.visibleSince = member.startsOn;
      }
      continue;
    }
    byId.set(member.athleteId, {
      athleteId: member.athleteId,
      displayName: familyAthleteDisplayName(member),
      visibleSince: member.startsOn,
    });
  }

  for (const payer of input.payers) {
    const guardian = activeGuardians.get(payer.guardianId);
    if (!guardian || guardian.organizationId !== payer.organizationId) continue;
    if (!activeLinks.has(`${payer.guardianId}|${payer.familyId}`)) continue;
    const today = todayByOrganization.get(guardian.organizationId);
    if (!today || !isOpenOn(payer, today)) continue;
    const academy = academies.get(guardian.organizationId);
    if (academy && !academy.feeFamilyIds.includes(payer.familyId)) {
      academy.feeFamilyIds.push(payer.familyId);
    }
  }

  const visible: FamilyPortalAcademy[] = [];
  for (const academy of academies.values()) {
    academy.athletes = [
      ...(athletesByAcademy.get(academy.organizationId)?.values() ?? []),
    ].sort((a, b) => a.displayName.localeCompare(b.displayName, "es"));
    academy.feeFamilyIds.sort();
    // An academy where the account neither sees athletes nor pays is hidden.
    if (academy.athletes.length > 0 || academy.feeFamilyIds.length > 0) {
      visible.push(academy);
    }
  }

  return {
    userId: input.userId,
    academies: visible.sort((a, b) =>
      a.organizationName.localeCompare(b.organizationName, "es")
    ),
  };
}

function notFound(): OperationalError {
  // Same answer for "foreign", "unknown" and "malformed": no existence oracle.
  return new OperationalError("NOT_FOUND", "Gimnasta no encontrada", 404);
}

export function isFamilyPortalUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * Resolves an athlete id from the URL against the access set. Anything that
 * is not one of this account's visible athletes is a 404.
 */
export function requireVisibleFamilyAthlete(
  access: FamilyPortalAccess,
  athleteId: string
): VisibleFamilyAthlete {
  if (!isFamilyPortalUuid(athleteId)) throw notFound();
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
  return access.academies.length > 0;
}
