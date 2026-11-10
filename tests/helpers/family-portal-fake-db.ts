/**
 * Synthetic database for the family portal isolation matrix (P2 #16).
 *
 * It answers only the queries issued by the family portal: the guardian, link
 * and payer lookups that resolve access, and the read-only domain queries.
 * Every flag (guardian, link, family, athlete, payer period) comes from the
 * fixture data, never hard-coded, so the pure domain check is exercised.
 * Each domain read is recorded with its SQL text and bound parameters so a
 * test can prove that a denied request never reached tenant data, that an
 * allowed one bound only ids from the resolved access, and that every query
 * carries the canonical chain bound to the session user. Any write throws.
 */
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

import {
  attendanceRecords,
  classTemplateWeekdays,
  enrollments,
  familyGuardians,
  familyPayers,
  guardians,
  invoices,
  sessions,
} from "@/db/zaltyko-schema";

export const ids = {
  orgA: "a1000000-0000-4000-8000-000000000001",
  orgB: "b1000000-0000-4000-8000-000000000001",
  orgClosed: "c1000000-0000-4000-8000-000000000001",
  siteNorth: "a1000000-0000-4000-8000-000000000011",
  siteSouth: "a1000000-0000-4000-8000-000000000012",
  siteB: "b1000000-0000-4000-8000-000000000011",
  // Accounts (Supabase Auth users).
  userFamilyA: "f1000000-0000-4000-8000-000000000001",
  userFamilyA2: "f1000000-0000-4000-8000-000000000002",
  userFamilyB: "f1000000-0000-4000-8000-000000000003",
  userNoViewPayer: "f1000000-0000-4000-8000-000000000004",
  userClosed: "f1000000-0000-4000-8000-000000000005",
  userInactiveLink: "f1000000-0000-4000-8000-000000000006",
  userStranger: "f1000000-0000-4000-8000-000000000007",
  userInactiveGuardian: "f1000000-0000-4000-8000-000000000008",
  userInactiveFamily: "f1000000-0000-4000-8000-000000000009",
  userNoViewNoPay: "f1000000-0000-4000-8000-00000000000a",
  userPayerEnded: "f1000000-0000-4000-8000-00000000000b",
  // Guardians.
  guardianA: "a1000000-0000-4000-8000-000000000021",
  guardianA2: "a1000000-0000-4000-8000-000000000022",
  guardianNoViewPayer: "a1000000-0000-4000-8000-000000000023",
  guardianInactiveLink: "a1000000-0000-4000-8000-000000000024",
  guardianInactive: "a1000000-0000-4000-8000-000000000025",
  guardianInactiveFamily: "a1000000-0000-4000-8000-000000000026",
  guardianNoViewNoPay: "a1000000-0000-4000-8000-000000000027",
  guardianPayerEnded: "a1000000-0000-4000-8000-000000000028",
  guardianB: "b1000000-0000-4000-8000-000000000021",
  guardianClosed: "c1000000-0000-4000-8000-000000000021",
  // Families.
  familyA: "a1000000-0000-4000-8000-000000000031",
  familyA2: "a1000000-0000-4000-8000-000000000032",
  familyInactive: "a1000000-0000-4000-8000-000000000033",
  familyB: "b1000000-0000-4000-8000-000000000031",
  familyClosed: "c1000000-0000-4000-8000-000000000031",
  // Athletes.
  ana: "a1000000-0000-4000-8000-000000000041",
  /** Same family as ana, membership ended before "today". */
  bruno: "a1000000-0000-4000-8000-000000000042",
  /** Same family as ana, athlete archived. */
  eva: "a1000000-0000-4000-8000-000000000043",
  /** Same academy, other family, other site. */
  carla: "a1000000-0000-4000-8000-000000000044",
  /** Only member of the inactive family. */
  ines: "a1000000-0000-4000-8000-000000000045",
  /** Same family as ana, membership starts after "today". */
  fede: "a1000000-0000-4000-8000-000000000046",
  /** Other academy. */
  dani: "b1000000-0000-4000-8000-000000000041",
  /** Closed academy. */
  olga: "c1000000-0000-4000-8000-000000000041",
  // Classes, sessions, attendance and fees.
  classNorth: "a1000000-0000-4000-8000-000000000051",
  classSouth: "a1000000-0000-4000-8000-000000000052",
  classB: "b1000000-0000-4000-8000-000000000051",
  enrollmentAna: "a1000000-0000-4000-8000-000000000061",
  enrollmentCarla: "a1000000-0000-4000-8000-000000000062",
  enrollmentDani: "b1000000-0000-4000-8000-000000000061",
  sessionNorth: "a1000000-0000-4000-8000-000000000071",
  sessionNorthCancelled: "a1000000-0000-4000-8000-000000000072",
  sessionSouth: "a1000000-0000-4000-8000-000000000073",
  sessionB: "b1000000-0000-4000-8000-000000000071",
  attendanceAna: "a1000000-0000-4000-8000-000000000081",
  attendanceCarla: "a1000000-0000-4000-8000-000000000082",
  attendanceDani: "b1000000-0000-4000-8000-000000000081",
  /** Dani's record from before the membership started: must stay hidden. */
  attendanceDaniBeforeMembership: "b1000000-0000-4000-8000-000000000082",
  invoiceA: "a1000000-0000-4000-8000-000000000091",
  invoiceA2: "a1000000-0000-4000-8000-000000000092",
  invoiceB: "b1000000-0000-4000-8000-000000000091",
  unknown: "d1000000-0000-4000-8000-000000000001",
} as const;

/** Fixed clock for every test: Tuesday 10 November 2026, 09:00 UTC. */
export const NOW = new Date("2026-11-10T09:00:00.000Z");

/** Every id that belongs to someone other than family A in academy A. */
export const FOREIGN_TO_FAMILY_A = [
  ids.orgB,
  ids.orgClosed,
  ids.familyA2,
  ids.familyInactive,
  ids.familyB,
  ids.familyClosed,
  ids.carla,
  ids.ines,
  ids.dani,
  ids.olga,
  ids.bruno,
  ids.eva,
  ids.fede,
  ids.classSouth,
  ids.classB,
  ids.siteSouth,
  ids.siteB,
] as const;

const organizationsById: Record<
  string,
  { name: string; status: string; timezone: string; currency: string }
> = {
  [ids.orgA]: { name: "Club Sintético", status: "active", timezone: "Europe/Madrid", currency: "EUR" },
  [ids.orgB]: { name: "Otro Club", status: "trial", timezone: "America/Mexico_City", currency: "MXN" },
  [ids.orgClosed]: { name: "Club Cerrado", status: "closed", timezone: "Europe/Madrid", currency: "EUR" },
};

const guardianRows = [
  { guardianId: ids.guardianA, userId: ids.userFamilyA, organizationId: ids.orgA, active: true },
  { guardianId: ids.guardianA2, userId: ids.userFamilyA2, organizationId: ids.orgA, active: true },
  { guardianId: ids.guardianNoViewPayer, userId: ids.userNoViewPayer, organizationId: ids.orgA, active: true },
  { guardianId: ids.guardianInactiveLink, userId: ids.userInactiveLink, organizationId: ids.orgA, active: true },
  { guardianId: ids.guardianInactive, userId: ids.userInactiveGuardian, organizationId: ids.orgA, active: false },
  { guardianId: ids.guardianInactiveFamily, userId: ids.userInactiveFamily, organizationId: ids.orgA, active: true },
  { guardianId: ids.guardianNoViewNoPay, userId: ids.userNoViewNoPay, organizationId: ids.orgA, active: true },
  { guardianId: ids.guardianPayerEnded, userId: ids.userPayerEnded, organizationId: ids.orgA, active: true },
  { guardianId: ids.guardianB, userId: ids.userFamilyB, organizationId: ids.orgB, active: true },
  { guardianId: ids.guardianClosed, userId: ids.userClosed, organizationId: ids.orgClosed, active: true },
];

const familiesById: Record<string, { organizationId: string; active: boolean }> = {
  [ids.familyA]: { organizationId: ids.orgA, active: true },
  [ids.familyA2]: { organizationId: ids.orgA, active: true },
  [ids.familyInactive]: { organizationId: ids.orgA, active: false },
  [ids.familyB]: { organizationId: ids.orgB, active: true },
  [ids.familyClosed]: { organizationId: ids.orgClosed, active: true },
};

const linkRows = [
  { guardianId: ids.guardianA, familyId: ids.familyA, active: true, canView: true },
  { guardianId: ids.guardianA2, familyId: ids.familyA2, active: true, canView: true },
  { guardianId: ids.guardianNoViewPayer, familyId: ids.familyA, active: true, canView: false },
  { guardianId: ids.guardianInactiveLink, familyId: ids.familyA, active: false, canView: true },
  { guardianId: ids.guardianInactive, familyId: ids.familyA, active: true, canView: true },
  { guardianId: ids.guardianInactiveFamily, familyId: ids.familyInactive, active: true, canView: true },
  { guardianId: ids.guardianNoViewNoPay, familyId: ids.familyA, active: true, canView: false },
  { guardianId: ids.guardianPayerEnded, familyId: ids.familyA, active: true, canView: false },
  { guardianId: ids.guardianB, familyId: ids.familyB, active: true, canView: true },
  { guardianId: ids.guardianClosed, familyId: ids.familyClosed, active: true, canView: true },
].map((link) => ({ ...link, organizationId: familiesById[link.familyId].organizationId }));

const payerRows = [
  { guardianId: ids.guardianA, familyId: ids.familyA, startsOn: "2026-09-01", endsOn: null },
  { guardianId: ids.guardianA2, familyId: ids.familyA2, startsOn: "2026-09-01", endsOn: null },
  { guardianId: ids.guardianNoViewPayer, familyId: ids.familyA, startsOn: "2026-10-01", endsOn: null },
  { guardianId: ids.guardianInactiveLink, familyId: ids.familyA, startsOn: "2026-09-01", endsOn: null },
  { guardianId: ids.guardianInactive, familyId: ids.familyA, startsOn: "2026-09-01", endsOn: null },
  { guardianId: ids.guardianInactiveFamily, familyId: ids.familyInactive, startsOn: "2026-09-01", endsOn: null },
  { guardianId: ids.guardianPayerEnded, familyId: ids.familyA, startsOn: "2026-01-01", endsOn: "2026-10-31" },
  { guardianId: ids.guardianB, familyId: ids.familyB, startsOn: "2026-09-01", endsOn: null },
  { guardianId: ids.guardianClosed, familyId: ids.familyClosed, startsOn: "2026-09-01", endsOn: null },
].map((payer) => ({ ...payer, organizationId: familiesById[payer.familyId].organizationId }));

const memberRows = [
  { familyId: ids.familyA, athleteId: ids.ana, startsOn: "2026-09-01", endsOn: null, athleteActive: true, givenName: "Ana", familyName: "Sintética Prueba", preferredName: null },
  { familyId: ids.familyA, athleteId: ids.bruno, startsOn: "2025-09-01", endsOn: "2026-09-30", athleteActive: true, givenName: "Bruno", familyName: "Sintético", preferredName: null },
  { familyId: ids.familyA, athleteId: ids.eva, startsOn: "2026-09-01", endsOn: null, athleteActive: false, givenName: "Eva", familyName: "Sintética", preferredName: null },
  { familyId: ids.familyA, athleteId: ids.fede, startsOn: "2026-12-01", endsOn: null, athleteActive: true, givenName: "Fede", familyName: "Sintético", preferredName: null },
  { familyId: ids.familyA2, athleteId: ids.carla, startsOn: "2026-09-01", endsOn: null, athleteActive: true, givenName: "Carla", familyName: "Ajena", preferredName: null },
  { familyId: ids.familyInactive, athleteId: ids.ines, startsOn: "2026-09-01", endsOn: null, athleteActive: true, givenName: "Inés", familyName: "Inactiva", preferredName: null },
  { familyId: ids.familyB, athleteId: ids.dani, startsOn: "2026-09-01", endsOn: null, athleteActive: true, givenName: "Daniel", familyName: "Otro", preferredName: "Dani" },
  { familyId: ids.familyClosed, athleteId: ids.olga, startsOn: "2026-09-01", endsOn: null, athleteActive: true, givenName: "Olga", familyName: "Cerrada", preferredName: null },
].map((member) => ({ ...member, organizationId: familiesById[member.familyId].organizationId }));

const locationsById: Record<string, { name: string; timezone: string }> = {
  [ids.siteNorth]: { name: "Sede Norte", timezone: "Europe/Madrid" },
  [ids.siteSouth]: { name: "Sede Sur", timezone: "Europe/Madrid" },
  [ids.siteB]: { name: "Sede Ajena", timezone: "America/Mexico_City" },
};

const classesById: Record<string, { organizationId: string; locationId: string; name: string }> = {
  [ids.classNorth]: { organizationId: ids.orgA, locationId: ids.siteNorth, name: "Iniciación" },
  [ids.classSouth]: { organizationId: ids.orgA, locationId: ids.siteSouth, name: "Base 3" },
  [ids.classB]: { organizationId: ids.orgB, locationId: ids.siteB, name: "Clase ajena" },
};

const enrollmentRows = [
  { enrollmentId: ids.enrollmentAna, organizationId: ids.orgA, athleteId: ids.ana, classTemplateId: ids.classNorth, status: "active", startsOn: "2026-09-01", endsOn: null },
  { enrollmentId: ids.enrollmentCarla, organizationId: ids.orgA, athleteId: ids.carla, classTemplateId: ids.classSouth, status: "active", startsOn: "2026-09-01", endsOn: null },
  { enrollmentId: ids.enrollmentDani, organizationId: ids.orgB, athleteId: ids.dani, classTemplateId: ids.classB, status: "active", startsOn: "2026-08-01", endsOn: null },
];

const weekdayRows = [
  { organizationId: ids.orgA, classTemplateId: ids.classNorth, isoWeekday: 2, startsAtLocal: "17:30:00", endsAtLocal: "19:00:00" },
  { organizationId: ids.orgA, classTemplateId: ids.classSouth, isoWeekday: 3, startsAtLocal: "18:00:00", endsAtLocal: "19:30:00" },
  { organizationId: ids.orgB, classTemplateId: ids.classB, isoWeekday: 4, startsAtLocal: "16:00:00", endsAtLocal: "17:00:00" },
];

const sessionRows = [
  { sessionId: ids.sessionNorth, organizationId: ids.orgA, classTemplateId: ids.classNorth, locationId: ids.siteNorth, startsAt: "2026-11-10T16:30:00.000Z", endsAt: "2026-11-10T18:00:00.000Z", status: "scheduled" },
  { sessionId: ids.sessionNorthCancelled, organizationId: ids.orgA, classTemplateId: ids.classNorth, locationId: ids.siteNorth, startsAt: "2026-11-17T16:30:00.000Z", endsAt: "2026-11-17T18:00:00.000Z", status: "cancelled" },
  { sessionId: ids.sessionSouth, organizationId: ids.orgA, classTemplateId: ids.classSouth, locationId: ids.siteSouth, startsAt: "2026-11-11T17:00:00.000Z", endsAt: "2026-11-11T18:30:00.000Z", status: "scheduled" },
  { sessionId: ids.sessionB, organizationId: ids.orgB, classTemplateId: ids.classB, locationId: ids.siteB, startsAt: "2026-11-12T22:00:00.000Z", endsAt: "2026-11-12T23:00:00.000Z", status: "scheduled" },
];

const attendanceRows = [
  { recordId: ids.attendanceAna, organizationId: ids.orgA, athleteId: ids.ana, classTemplateId: ids.classNorth, locationId: ids.siteNorth, sessionStartsAt: "2026-11-03T16:30:00.000Z", status: "late" },
  { recordId: ids.attendanceCarla, organizationId: ids.orgA, athleteId: ids.carla, classTemplateId: ids.classSouth, locationId: ids.siteSouth, sessionStartsAt: "2026-11-04T17:00:00.000Z", status: "absent" },
  { recordId: ids.attendanceDani, organizationId: ids.orgB, athleteId: ids.dani, classTemplateId: ids.classB, locationId: ids.siteB, sessionStartsAt: "2026-11-05T22:00:00.000Z", status: "present" },
  // 2026-08-31 18:00 in Mexico City: the day before Dani joined family B.
  { recordId: ids.attendanceDaniBeforeMembership, organizationId: ids.orgB, athleteId: ids.dani, classTemplateId: ids.classB, locationId: ids.siteB, sessionStartsAt: "2026-09-01T00:00:00.000Z", status: "absent" },
];

const invoiceRows = [
  { invoiceId: ids.invoiceA, organizationId: ids.orgA, familyId: ids.familyA, reference: "CUO-2026-11-A", status: "partially_paid", currency: "EUR", totalCents: 4500, allocatedCents: "2500", refundedCents: "500", dueAt: "2026-11-05T23:00:00.000Z", periodStart: "2026-11-01", periodEnd: "2026-11-30" },
  { invoiceId: ids.invoiceA2, organizationId: ids.orgA, familyId: ids.familyA2, reference: "CUO-2026-11-A2", status: "issued", currency: "EUR", totalCents: 3900, allocatedCents: "0", refundedCents: "0", dueAt: "2026-11-05T23:00:00.000Z", periodStart: "2026-11-01", periodEnd: "2026-11-30" },
  { invoiceId: ids.invoiceB, organizationId: ids.orgB, familyId: ids.familyB, reference: "CUO-2026-11-B", status: "paid", currency: "MXN", totalCents: 90000, allocatedCents: "90000", refundedCents: "0", dueAt: "2026-11-05T23:00:00.000Z", periodStart: "2026-11-01", periodEnd: "2026-11-30" },
];

const dialect = new PgDialect();

function render(clause: unknown): { sql: string; params: unknown[] } {
  if (!clause) return { sql: "", params: [] };
  const query = dialect.sqlToQuery(clause as SQL);
  return { sql: query.sql, params: query.params };
}

export interface RecordedRead {
  table: string;
  /** SQL text of the joins and the where clause. */
  sql: string;
  params: unknown[];
}

export interface FamilyPortalFakeState {
  guardianLookups: RecordedRead[];
  linkLookups: RecordedRead[];
  payerLookups: RecordedRead[];
  domainReads: RecordedRead[];
  unknownTables: string[];
}

export function createFamilyPortalFakeState(): FamilyPortalFakeState {
  return {
    guardianLookups: [],
    linkLookups: [],
    payerLookups: [],
    domainReads: [],
    unknownTables: [],
  };
}

function tableName(table: unknown): string {
  const symbol = Object.getOwnPropertySymbols(table ?? {}).find((item) =>
    String(item).includes("Name")
  );
  return symbol ? String((table as Record<symbol, unknown>)[symbol]) : "unknown";
}

function selectRows(
  state: FamilyPortalFakeState,
  table: unknown,
  read: RecordedRead
): unknown[] {
  const has = (value: string) => read.params.includes(value);

  if (table === guardians) {
    state.guardianLookups.push(read);
    // Emulates auth_user_id = $user and organization status in ($statuses).
    // is_active is returned from the data so the domain check is exercised.
    return guardianRows
      .filter((row) => has(row.userId))
      .filter((row) => has(organizationsById[row.organizationId].status))
      .map((row) => ({
        guardianId: row.guardianId,
        organizationId: row.organizationId,
        organizationName: organizationsById[row.organizationId].name,
        organizationStatus: organizationsById[row.organizationId].status,
        organizationTimezone: organizationsById[row.organizationId].timezone,
        defaultCurrency: organizationsById[row.organizationId].currency,
        guardianActive: row.active,
      }));
  }

  if (table === familyGuardians) {
    state.linkLookups.push(read);
    // Emulates the guardian/organization filters and the member left join.
    // Link, family and athlete flags and member periods come from the data.
    return linkRows
      .filter((link) => has(link.guardianId) && has(link.organizationId))
      .flatMap((link) => {
        const base = {
          organizationId: link.organizationId,
          guardianId: link.guardianId,
          familyId: link.familyId,
          linkActive: link.active,
          canViewAthletes: link.canView,
          familyActive: familiesById[link.familyId].active,
        };
        const members = memberRows.filter(
          (member) =>
            member.familyId === link.familyId &&
            member.organizationId === link.organizationId
        );
        if (members.length === 0) {
          return [{
            ...base,
            memberOrganizationId: null,
            athleteId: null,
            startsOn: null,
            endsOn: null,
            athleteActive: null,
            givenName: null,
            familyName: null,
            preferredName: null,
          }];
        }
        return members.map((member) => ({
          ...base,
          memberOrganizationId: member.organizationId,
          athleteId: member.athleteId,
          startsOn: member.startsOn,
          endsOn: member.endsOn,
          athleteActive: member.athleteActive,
          givenName: member.givenName,
          familyName: member.familyName,
          preferredName: member.preferredName,
        }));
      });
  }

  if (table === familyPayers) {
    state.payerLookups.push(read);
    return payerRows
      .filter((payer) => has(payer.guardianId) && has(payer.organizationId))
      .map(({ organizationId, guardianId, familyId, startsOn, endsOn }) => ({
        organizationId,
        guardianId,
        familyId,
        startsOn,
        endsOn,
      }));
  }

  state.domainReads.push(read);

  if (table === enrollments) {
    return enrollmentRows
      .filter((row) => has(row.organizationId) && has(row.athleteId))
      .map((row) => {
        const klass = classesById[row.classTemplateId];
        const location = locationsById[klass.locationId];
        return {
          enrollmentId: row.enrollmentId,
          classTemplateId: row.classTemplateId,
          status: row.status,
          startsOn: row.startsOn,
          endsOn: row.endsOn,
          className: klass.name,
          locationName: location.name,
          timezone: location.timezone,
        };
      });
  }
  if (table === classTemplateWeekdays) {
    return weekdayRows.filter(
      (row) => has(row.organizationId) && has(row.classTemplateId)
    );
  }
  if (table === sessions) {
    return sessionRows
      .filter((row) => has(row.organizationId) && has(row.classTemplateId))
      .map((row) => ({
        sessionId: row.sessionId,
        classTemplateId: row.classTemplateId,
        startsAt: new Date(row.startsAt),
        endsAt: new Date(row.endsAt),
        status: row.status,
        locationName: locationsById[row.locationId].name,
        timezone: locationsById[row.locationId].timezone,
      }));
  }
  if (table === attendanceRecords) {
    // The SQL `since` bound is not emulated here on purpose: the in-memory
    // defense must drop pre-membership records on its own.
    return attendanceRows
      .filter((row) => has(row.organizationId) && has(row.athleteId))
      .map((row) => ({
        recordId: row.recordId,
        status: row.status,
        sessionStartsAt: new Date(row.sessionStartsAt),
        className: classesById[row.classTemplateId].name,
        locationName: locationsById[row.locationId].name,
        timezone: locationsById[row.locationId].timezone,
      }));
  }
  if (table === invoices) {
    return invoiceRows
      .filter((row) => has(row.organizationId) && has(row.familyId))
      .map((row) => ({
        invoiceId: row.invoiceId,
        reference: row.reference,
        status: row.status,
        currency: row.currency,
        totalCents: row.totalCents,
        dueAt: new Date(row.dueAt),
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        allocatedCents: row.allocatedCents,
        refundedCents: row.refundedCents,
      }));
  }

  state.unknownTables.push(tableName(table));
  return [];
}

/** A chainable Drizzle-like select that resolves on await or limit(). */
function selectChain(state: FamilyPortalFakeState) {
  let table: unknown;
  const fragments: string[] = [];
  const params: unknown[] = [];
  const add = (clause: unknown) => {
    const rendered = render(clause);
    fragments.push(rendered.sql);
    params.push(...rendered.params);
  };
  const resolve = () =>
    Promise.resolve(
      selectRows(state, table, {
        table: tableName(table),
        sql: fragments.join(" "),
        params,
      })
    );
  const chain: Record<string, unknown> = {
    from(value: unknown) {
      table = value;
      return chain;
    },
    innerJoin(_table: unknown, on: unknown) {
      add(on);
      return chain;
    },
    leftJoin(_table: unknown, on: unknown) {
      add(on);
      return chain;
    },
    where(clause: unknown) {
      add(clause);
      return chain;
    },
    orderBy: () => chain,
    groupBy: () => chain,
    limit: () => resolve(),
    then: (
      onFulfilled: (rows: unknown[]) => unknown,
      onRejected?: (error: unknown) => unknown
    ) => resolve().then(onFulfilled, onRejected),
  };
  return chain;
}

export function createFamilyPortalFakeDb(state: FamilyPortalFakeState) {
  const reject = (operation: string) => () => {
    throw new Error(`Family portal is read-only: unexpected ${operation}`);
  };
  return {
    select: () => selectChain(state),
    execute: reject("execute"),
    insert: reject("insert"),
    update: reject("update"),
    delete: reject("delete"),
    transaction: reject("transaction"),
  };
}
