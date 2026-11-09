/**
 * Synthetic database for the coach-access authorization matrix (P1 #8).
 *
 * It only answers the queries issued by the server guards
 * (resolveOwnerScope, resolveSessionAttendanceAccess, resolveSaasOwnerScope,
 * the data-export membership check and the denial audit). Every other table
 * returns no rows and is recorded in `domainReads`, so a test can prove that
 * a denied actor never reached tenant data.
 */
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

import {
  locations,
  memberLocationScopes,
  organizationMembers,
  organizations,
  sessionStaff,
  sessions,
  staffProfiles,
} from "@/db/zaltyko-schema";

export const ids = {
  orgA: "a0000000-0000-4000-8000-000000000001",
  orgForeign: "b0000000-0000-4000-8000-000000000001",
  siteAssigned: "a0000000-0000-4000-8000-000000000011",
  siteOther: "a0000000-0000-4000-8000-000000000012",
  siteForeign: "b0000000-0000-4000-8000-000000000011",
  sessionAssigned: "a0000000-0000-4000-8000-000000000021",
  sessionOtherSite: "a0000000-0000-4000-8000-000000000022",
  sessionForeign: "b0000000-0000-4000-8000-000000000021",
  owner: "c0000000-0000-4000-8000-000000000001",
  admin: "c0000000-0000-4000-8000-000000000002",
  manager: "c0000000-0000-4000-8000-000000000003",
  coach: "c0000000-0000-4000-8000-000000000004",
  coachAllSites: "c0000000-0000-4000-8000-000000000005",
  coachNoSites: "c0000000-0000-4000-8000-000000000006",
  stranger: "c0000000-0000-4000-8000-000000000007",
  entity: "d0000000-0000-4000-8000-000000000001",
} as const;

export type Role = "owner" | "admin" | "manager" | "coach";

export interface FakeMember {
  memberId: string;
  userId: string;
  organizationId: string;
  role: Role;
  locationScopeMode: "all" | "selected";
  scopedLocationIds: string[];
}

const organizationsById: Record<string, { name: string; status: string }> = {
  [ids.orgA]: { name: "Club Sintético", status: "active" },
  [ids.orgForeign]: { name: "Otro Club", status: "active" },
};

const locationsById: Record<
  string,
  { organizationId: string; name: string; timezone: string }
> = {
  [ids.siteAssigned]: { organizationId: ids.orgA, name: "Sede Norte", timezone: "Europe/Madrid" },
  [ids.siteOther]: { organizationId: ids.orgA, name: "Sede Sur", timezone: "Europe/Madrid" },
  [ids.siteForeign]: { organizationId: ids.orgForeign, name: "Sede Ajena", timezone: "Europe/Madrid" },
};

const sessionsById: Record<string, { organizationId: string; locationId: string }> = {
  [ids.sessionAssigned]: { organizationId: ids.orgA, locationId: ids.siteAssigned },
  [ids.sessionOtherSite]: { organizationId: ids.orgA, locationId: ids.siteOther },
  [ids.sessionForeign]: { organizationId: ids.orgForeign, locationId: ids.siteForeign },
};

/** One member per role in orgA; the coach is limited to siteAssigned. */
export const members: Record<string, FakeMember> = {
  [ids.owner]: member(ids.owner, "owner", "all", []),
  [ids.admin]: member(ids.admin, "admin", "all", []),
  [ids.manager]: member(ids.manager, "manager", "selected", [ids.siteAssigned]),
  [ids.coach]: member(ids.coach, "coach", "selected", [ids.siteAssigned]),
  [ids.coachAllSites]: member(ids.coachAllSites, "coach", "all", []),
  [ids.coachNoSites]: member(ids.coachNoSites, "coach", "selected", []),
};

function member(
  userId: string,
  role: Role,
  locationScopeMode: "all" | "selected",
  scopedLocationIds: string[]
): FakeMember {
  return {
    // Same suffix as the user id, distinct prefix: unique per member.
    memberId: `e${userId.slice(1)}`,
    userId,
    organizationId: ids.orgA,
    role,
    locationScopeMode,
    scopedLocationIds,
  };
}

const dialect = new PgDialect();

function paramsOf(clause: unknown): unknown[] {
  if (!clause) return [];
  return dialect.sqlToQuery(clause as SQL).params;
}

export interface FakeDbState {
  /** Sessions where each member id is assigned as staff. */
  sessionStaff: Record<string, string[]>;
  domainReads: string[];
  audits: Array<{ params: unknown[] }>;
  unknownStatements: string[];
}

export function createFakeDbState(): FakeDbState {
  return {
    sessionStaff: {
      [members[ids.coach].memberId]: [ids.sessionAssigned],
      [members[ids.coachAllSites].memberId]: [ids.sessionAssigned, ids.sessionOtherSite],
    },
    domainReads: [],
    audits: [],
    unknownStatements: [],
  };
}

function tableName(table: unknown): string {
  const symbol = Object.getOwnPropertySymbols(table ?? {}).find((item) =>
    String(item).includes("Name")
  );
  return symbol ? String((table as Record<symbol, unknown>)[symbol]) : "unknown";
}

function membershipRow(item: FakeMember) {
  return {
    id: item.memberId,
    memberId: item.memberId,
    organizationId: item.organizationId,
    organizationName: organizationsById[item.organizationId].name,
    defaultCurrency: "EUR",
    role: item.role,
    locationScopeMode: item.locationScopeMode,
    userId: item.userId,
    status: "active",
  };
}

function locationRow(id: string) {
  const location = locationsById[id];
  return { id, name: location.name, timezone: location.timezone };
}

function selectRows(
  state: FakeDbState,
  table: unknown,
  params: unknown[]
): unknown[] {
  const has = (value: string) => params.includes(value);
  const knownMembers = Object.values(members);

  if (table === organizationMembers) {
    // resolveOwnerScope: (userId, "active"); session access adds orgId.
    return knownMembers
      .filter((item) => has(item.userId))
      .filter(
        (item) =>
          !Object.keys(organizationsById).some((orgId) => has(orgId)) ||
          has(item.organizationId)
      )
      .map(membershipRow);
  }
  if (table === locations) {
    return Object.keys(locationsById)
      .filter((id) => has(locationsById[id].organizationId))
      .map(locationRow);
  }
  if (table === memberLocationScopes) {
    const scoped = knownMembers.find((item) => has(item.memberId));
    if (!scoped || !has(scoped.organizationId)) return [];
    const requested = Object.keys(locationsById).filter((id) => has(id));
    return scoped.scopedLocationIds
      .filter((id) => requested.length === 0 || requested.includes(id))
      .map(locationRow);
  }
  if (table === sessions) {
    const requested = Object.keys(sessionsById).filter((id) => has(id));
    if (requested.length === 0) {
      state.domainReads.push("sessions:list");
      return [];
    }
    return requested
      .filter(
        (id) =>
          has(sessionsById[id].organizationId) && has(sessionsById[id].locationId)
      )
      .map((id) => ({
        id,
        locationId: sessionsById[id].locationId,
        classTemplateId: ids.entity,
        startsAt: new Date("2026-11-09T17:00:00.000Z"),
        timezone: locationsById[sessionsById[id].locationId].timezone,
        className: "Iniciación",
        status: "scheduled",
        cursorStartsAt: "2026-11-09T17:00:00.000000Z",
      }));
  }
  if (table === sessionStaff) {
    const assigned = Object.entries(state.sessionStaff).find(
      ([memberId, sessionIds]) =>
        has(memberId) && sessionIds.some((sessionId) => has(sessionId))
    );
    return assigned ? [{ id: ids.entity }] : [];
  }
  if (table === organizations || table === staffProfiles) {
    return [];
  }
  state.domainReads.push(tableName(table));
  return [];
}

/** A chainable Drizzle-like select that resolves on await or limit(). */
function selectChain(state: FakeDbState) {
  let table: unknown;
  const params: unknown[] = [];
  const resolve = () => Promise.resolve(selectRows(state, table, params));
  const chain: Record<string, unknown> = {
    from(value: unknown) {
      table = value;
      return chain;
    },
    innerJoin(_table: unknown, on: unknown) {
      params.push(...paramsOf(on));
      return chain;
    },
    leftJoin(_table: unknown, on: unknown) {
      params.push(...paramsOf(on));
      return chain;
    },
    where(clause: unknown) {
      params.push(...paramsOf(clause));
      return chain;
    },
    orderBy: () => chain,
    groupBy: () => chain,
    offset: () => chain,
    for: () => chain,
    limit: () => resolve(),
    then: (onFulfilled: (rows: unknown[]) => unknown, onRejected?: (error: unknown) => unknown) =>
      resolve().then(onFulfilled, onRejected),
  };
  return chain;
}

function executeRows(state: FakeDbState, statement: SQL): { rows: unknown[] } {
  const query = dialect.sqlToQuery(statement);
  const text = query.sql.replace(/\s+/g, " ").toLowerCase();
  const has = (value: string) => query.params.includes(value);

  if (text.includes("insert into zaltyko.audit_log")) {
    state.audits.push({ params: query.params });
    return { rows: [] };
  }
  if (text.startsWith("set ")) return { rows: [] };

  // resolveSaasOwnerScope: organization_members m joined to organizations o.
  if (text.includes("from zaltyko.organization_members m")) {
    const found = Object.values(members).find(
      (item) => has(item.userId) && has(item.organizationId)
    );
    return {
      rows: found
        ? [{
            organization_id: found.organizationId,
            organization_name: organizationsById[found.organizationId].name,
            country_code: "ES",
            member_id: found.memberId,
            role: found.role,
          }]
        : [],
    };
  }
  // Data export: organizations joined to organization_members as member.
  if (text.includes("zaltyko.organization_members as member")) {
    const found = Object.values(members).find(
      (item) => has(item.userId) && has(item.organizationId)
    );
    return {
      rows: found
        ? [{
            organization_status: organizationsById[found.organizationId].status,
            member_status: "active",
            role: found.role,
            location_scope_mode: found.locationScopeMode,
          }]
        : [],
    };
  }
  state.unknownStatements.push(text.slice(0, 120));
  return { rows: [] };
}

export function createFakeDb(state: FakeDbState) {
  const client = {
    select: () => selectChain(state),
    selectDistinct: () => selectChain(state),
    execute: async (statement: SQL) => executeRows(state, statement),
    insert: () => {
      throw new Error("Synthetic matrix: unexpected write (insert)");
    },
    update: () => {
      throw new Error("Synthetic matrix: unexpected write (update)");
    },
    delete: () => {
      throw new Error("Synthetic matrix: unexpected write (delete)");
    },
    transaction: async <T>(work: (tx: unknown) => Promise<T>) => work(client),
  };
  return client;
}
