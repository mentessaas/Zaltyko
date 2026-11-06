import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  assertAccess: vi.fn(),
  assertWritable: vi.fn(),
  lock: vi.fn(),
  findEvent: vi.fn(),
  appendAudit: vi.fn(),
  appendOutbox: vi.fn(),
  createEnrollment: vi.fn(),
  transitionEnrollment: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/modules/saas-billing/application/organization-usage", async importOriginal => ({
  ...await importOriginal<typeof import("@/modules/saas-billing/application/organization-usage")>(),
  assertOrganizationOperationalWritable: mocks.assertWritable,
}));
vi.mock("@/modules/enrollments/application/enrollment-service", () => ({
  createEnrollmentInTransaction: mocks.createEnrollment,
  transitionEnrollmentInTransaction: mocks.transitionEnrollment,
}));
vi.mock("@/modules/shared/infrastructure/operational-authorization", async importOriginal => {
  const actual = await importOriginal<typeof import("@/modules/shared/infrastructure/operational-authorization")>();
  mocks.assertAccess.mockImplementation(actual.assertOperationalAccess);
  return { ...actual, assertOperationalAccess: mocks.assertAccess };
});
vi.mock("@/modules/shared/infrastructure/transactional-records", async importOriginal => {
  const actual = await importOriginal<typeof import("@/modules/shared/infrastructure/transactional-records")>();
  return {
    ...actual,
    appendAuditEntry: mocks.appendAudit,
    appendOutboxEvent: mocks.appendOutbox,
    assertIdempotencyPayload: actual.assertIdempotencyPayload,
    findOutboxEvent: mocks.findEvent,
    lockCommand: mocks.lock,
  };
});

import {
  memberLocationScopes,
  organizationMembers,
  waitlistEntries,
  waitlistOffers,
} from "@/db/zaltyko-schema";
import type { TransactionClient } from "@/lib/db-transactions";
import {
  acceptWaitlistOffer,
  expireWaitlistOffer,
  joinWaitlist,
  sendWaitlistOffer,
} from "@/modules/waitlists/application/waitlist-service";

const organizationId = "30000000-0000-4000-8000-000000000001";
const locationId = "30000000-0000-4000-8000-000000000002";
const entryId = "30000000-0000-4000-8000-000000000003";
const offerId = "30000000-0000-4000-8000-000000000004";
const athleteId = "30000000-0000-4000-8000-000000000005";
const classTemplateId = "30000000-0000-4000-8000-000000000006";
const guardianId = "30000000-0000-4000-8000-000000000009";
const userId = "30000000-0000-4000-8000-000000000007";
const memberId = "30000000-0000-4000-8000-000000000008";
const actor = { userId, memberId };
const idempotencyKey = "waitlist-replay-001";
const startsOn = "2026-10-24";
const expiresAt = "2026-10-25T12:00:00.000Z";
const dialect = new PgDialect();
const entry = {
  id: entryId,
  organizationId,
  locationId,
  athleteId,
  classTemplateId,
  programId: null,
  sourceTrialId: null,
  contactGuardianId: null,
  status: "waiting",
  contactable: false,
  contactConsentStatus: "unknown",
  contactConsentRecordedAt: null,
  priority: 0,
  preferences: { weekdays: [], timeBands: [] },
  version: 1,
} as unknown as import("@/db/zaltyko-schema").WaitlistEntry;
const offer = {
  id: offerId,
  organizationId,
  waitlistEntryId: entryId,
  classTemplateId,
  startsOn,
  expiresAt: new Date(expiresAt),
  status: "pending",
  version: 1,
} as unknown as import("@/db/zaltyko-schema").WaitlistOffer;

type ReplayKind = "join" | "offer" | "accept" | "expire";
const eventNames: Record<ReplayKind, string> = {
  join: "waitlist.joined",
  offer: "waitlist.offer_sent",
  accept: "waitlist.converted",
  expire: "waitlist.expired",
};
const joinReplayMismatchCases: Array<
  [string, Partial<Parameters<typeof joinWaitlist>[0]>]
> = [
  ["el tutor de contacto", { contactGuardianId: guardianId }],
  ["la fecha del consentimiento", { contactConsentRecordedAt: "2026-10-22T12:00:00.000Z" }],
  ["las preferencias", { preferences: { weekdays: [2], timeBands: ["morning"] } }],
];
let memberRole: string;
let memberScopeMode: string;
let scoped: boolean;
let currentEvent: {
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
} | null;
let currentKind: ReplayKind;
let writes: ReturnType<typeof vi.fn>;
let execute: ReturnType<typeof vi.fn>;
let tx: TransactionClient;

function priorPayload(kind: ReplayKind): Record<string, unknown> {
  if (kind === "join") {
    return {
      waitlistEntryId: entryId,
      athleteId,
      classTemplateId,
      programId: null,
      sourceTrialId: null,
      contactable: false,
      consentStatus: "unknown",
      priority: 0,
    };
  }
  if (kind === "offer") {
    return { offerId, waitlistEntryId: entryId, classTemplateId, startsOn, expiresAt };
  }
  return { offerId };
}

function run(
  kind: ReplayKind,
  joinOverrides: Partial<Parameters<typeof joinWaitlist>[0]> = {}
) {
  if (kind === "join") {
    return joinWaitlist({
      organizationId,
      locationId,
      athleteId,
      classTemplateId,
      idempotencyKey,
      actor,
      ...joinOverrides,
    });
  }
  if (kind === "offer") {
    return sendWaitlistOffer({
      organizationId,
      waitlistEntryId: entryId,
      expectedVersion: 1,
      classTemplateId,
      startsOn,
      expiresAt,
      idempotencyKey,
      actor,
    });
  }
  const command = { organizationId, offerId, expectedVersion: 1, idempotencyKey, actor };
  return kind === "accept" ? acceptWaitlistOffer(command) : expireWaitlistOffer(command);
}

function expectNoWrites() {
  expect(writes).not.toHaveBeenCalled();
  expect(execute).not.toHaveBeenCalled();
  expect(mocks.appendAudit).not.toHaveBeenCalled();
  expect(mocks.appendOutbox).not.toHaveBeenCalled();
  expect(mocks.createEnrollment).not.toHaveBeenCalled();
  expect(mocks.transitionEnrollment).not.toHaveBeenCalled();
}

function makeTransaction() {
  const select = vi.fn(() => {
    let table: unknown;
    let params: unknown[] = [];
    const query = {
      from: (value: unknown) => { table = value; return query; },
      where: (clause: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        params = dialect.sqlToQuery(clause).params;
        return query;
      },
      limit: async () => {
        if (table === organizationMembers) {
          return memberRole !== "none"
            && [organizationId, userId, memberId, "active"].every(value => params.includes(value))
            ? [{
                id: memberId,
                userId,
                organizationId,
                status: "active",
                role: memberRole,
                locationScopeMode: memberScopeMode,
              }]
            : [];
        }
        if (table === memberLocationScopes) {
          return scoped && [organizationId, memberId, locationId].every(value => params.includes(value))
            ? [{ id: "synthetic-scope" }]
            : [];
        }
        if (table === waitlistEntries) {
          return [organizationId, entryId].every(value => params.includes(value)) ? [entry] : [];
        }
        if (table === waitlistOffers) {
          return [organizationId, offerId].every(value => params.includes(value)) ? [offer] : [];
        }
        throw new Error("Consulta inesperada en replay de lista de espera");
      },
    };
    return query;
  });
  writes = vi.fn(() => { throw new Error("El replay no debe escribir"); });
  execute = vi.fn(() => { throw new Error("El replay no debe ejecutar SQL"); });
  tx = { select, execute, insert: writes, update: writes, delete: writes } as unknown as TransactionClient;
  mocks.transaction.mockImplementation(async callback => callback(tx));
}

beforeEach(() => {
  vi.clearAllMocks();
  memberRole = "owner";
  memberScopeMode = "all";
  scoped = true;
  currentEvent = null;
  currentKind = "join";
  mocks.lock.mockResolvedValue(undefined);
  mocks.assertWritable.mockRejectedValue(
    Object.assign(new Error("Academia de solo lectura"), {
      code: "PLAN_OVER_CAPACITY",
      status: 409,
    })
  );
  mocks.findEvent.mockImplementation(async (_tx, input) =>
    currentEvent
    && input.organizationId === organizationId
    && input.eventName === eventNames[currentKind]
    && input.idempotencyKey === idempotencyKey
      ? currentEvent
      : null
  );
  makeTransaction();
});

describe("replay de lista de espera cuando la academia está en solo lectura", () => {
  it.each(["join", "offer", "accept", "expire"] as const)("recupera %s con autorización de lectura y sin DML", async kind => {
    currentKind = kind;
    currentEvent = { aggregateType: "waitlist_entry", aggregateId: entryId, payload: priorPayload(kind) };

    const result = await run(kind);

    expect(result).toEqual(kind === "join" ? entry : { entry, offer });
    expect(mocks.assertAccess).toHaveBeenCalledWith(tx, {
      organizationId,
      locationId,
      actor,
      allowedRoles: ["owner", "manager", "admin"],
    });
    expect(mocks.assertWritable).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("sigue denegando el replay a un rol no autorizado", async () => {
    currentKind = "join";
    currentEvent = { aggregateType: "waitlist_entry", aggregateId: entryId, payload: priorPayload("join") };
    memberRole = "coach";

    await expect(run("join")).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });

    expect(mocks.assertWritable).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("sigue denegando el replay fuera del alcance de sede", async () => {
    currentKind = "join";
    currentEvent = { aggregateType: "waitlist_entry", aggregateId: entryId, payload: priorPayload("join") };
    memberScopeMode = "selected";
    scoped = false;

    await expect(run("join")).rejects.toMatchObject({ code: "LOCATION_SCOPE_DENIED", status: 403 });

    expect(mocks.assertWritable).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("mantiene el límite de escritura para un alta nueva", async () => {
    currentKind = "join";
    currentEvent = null;

    await expect(run("join")).rejects.toMatchObject({ code: "PLAN_OVER_CAPACITY", status: 409 });

    expect(mocks.assertAccess).toHaveBeenCalledWith(tx, {
      organizationId,
      locationId,
      actor,
      intent: "write",
      allowedRoles: ["owner", "manager", "admin"],
    });
    expectNoWrites();
  });

  it.each(["join", "offer", "accept", "expire"] as const)("rechaza un evento %s sin resultado válido antes de cualquier escritura", async kind => {
    currentKind = kind;
    const payload = priorPayload(kind);
    if (kind === "join") delete payload.waitlistEntryId;
    else delete payload.offerId;
    currentEvent = { aggregateType: "waitlist_entry", aggregateId: entryId, payload };

    await expect(run(kind)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });

    expect(mocks.assertWritable).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it.each(["join", "offer", "accept", "expire"] as const)("rechaza un agregado %s que no coincide con el resultado persistido", async kind => {
    currentKind = kind;
    currentEvent = {
      aggregateType: "waitlist_entry",
      aggregateId: "30000000-0000-4000-8000-000000000099",
      payload: priorPayload(kind),
    };

    await expect(run(kind)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });

    expect(mocks.assertWritable).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it.each(["join", "offer"] as const)("rechaza un evento %s con tipo de agregado incorrecto", async kind => {
    currentKind = kind;
    currentEvent = {
      aggregateType: "attendance",
      aggregateId: entryId,
      payload: priorPayload(kind),
    };

    await expect(run(kind)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });

    expect(mocks.assertWritable).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it.each(["join", "offer"] as const)("rechaza un replay %s con un payload distinto", async kind => {
    currentKind = kind;
    const payload = priorPayload(kind);
    if (kind === "join") payload.athleteId = "30000000-0000-4000-8000-000000000099";
    else payload.startsOn = "2026-10-26";
    currentEvent = { aggregateType: "waitlist_entry", aggregateId: entryId, payload };

    await expect(run(kind)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });

    expect(mocks.assertWritable).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it.each(joinReplayMismatchCases)(
    "rechaza el replay de alta si cambia %s, sin añadir datos sensibles al evento",
    async (_field, overrides) => {
      currentKind = "join";
      currentEvent = {
        aggregateType: "waitlist_entry",
        aggregateId: entryId,
        payload: priorPayload("join"),
      };

      await expect(run("join", overrides)).rejects.toMatchObject({
        code: "IDEMPOTENCY_CONFLICT",
        status: 409,
      });

      expect(mocks.assertAccess).not.toHaveBeenCalled();
      expect(mocks.assertWritable).not.toHaveBeenCalled();
      expectNoWrites();
    }
  );
});
