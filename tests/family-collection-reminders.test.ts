import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cobro automático (Fase 3): una cuota que se cobra sola no recibe
 * recordatorios mientras su cobro siga pendiente (razón `automatic_collection`);
 * sí tras el fallo final o la cancelación, y siempre con la bandera apagada.
 */

vi.mock("@/modules/family-collection/application/config", () => ({
  isFamilyAutomaticCollectionFlagEnabled: vi.fn(),
  resolveConnectEnvironment: vi.fn(),
  isProductionDatabase: vi.fn(),
}));
vi.mock("@/modules/family-collection/application/storage", () => ({
  isFamilyCollectionStorageAvailable: vi.fn(),
}));

import type { DatabaseClient } from "@/lib/db-transactions";
import {
  isFamilyAutomaticCollectionFlagEnabled,
  isProductionDatabase,
  resolveConnectEnvironment,
} from "@/modules/family-collection/application/config";
import { isFamilyCollectionStorageAvailable } from "@/modules/family-collection/application/storage";
import { loadReminderCandidates, type ReminderCandidate } from "@/modules/payment-reminders/application/candidates";
import { planReminders } from "@/modules/payment-reminders/application/plan";
import {
  AUTOMATIC_COLLECTION_REMINDER_GRACE_DAYS,
  automaticCollectionHolds,
  evaluateReminder,
  SKIP_REASON_LABELS,
  type ReminderCandidateState,
} from "@/modules/payment-reminders/domain/reminder-policy";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-20T10:00:00Z");
const dialect = new PgDialect();

const holds = (overrides: Partial<Parameters<typeof automaticCollectionHolds>[0]> = {}) =>
  automaticCollectionHolds({
    collectionMode: "automatic",
    automaticCollectionOpen: true,
    lastAttempt: null,
    collectionDateLocal: "2026-11-18",
    todayLocal: "2026-11-20",
    ...overrides,
  });

describe("automaticCollectionHolds", () => {
  it("una cuota manual o con el cobro automático cerrado (bandera apagada) nunca espera", () => {
    expect(holds({ collectionMode: "manual", lastAttempt: { status: "claimed", retryPending: false } })).toBe(false);
    expect(holds({ automaticCollectionOpen: false, lastAttempt: { status: "processing", retryPending: false } })).toBe(false);
  });

  it.each(["claimed", "created", "processing", "succeeded"])("con un intento %s espera", (status) => {
    expect(holds({ lastAttempt: { status, retryPending: false } })).toBe(true);
  });

  it("con un fallo con reintento pendiente espera; con un fallo final vuelve a los recordatorios", () => {
    expect(holds({ lastAttempt: { status: "failed", retryPending: true } })).toBe(true);
    expect(holds({ lastAttempt: { status: "failed", retryPending: false } })).toBe(false);
  });

  it("cancelado (puerta, academia, pago manual o revisión) vuelve a los recordatorios", () => {
    expect(holds({ lastAttempt: { status: "canceled", retryPending: false } })).toBe(false);
  });

  it(`sin intento espera hasta ${AUTOMATIC_COLLECTION_REMINDER_GRACE_DAYS} días después de la fecha de cobro`, () => {
    expect(holds({ collectionDateLocal: "2026-11-25", todayLocal: "2026-11-20" })).toBe(true);
    expect(holds({ collectionDateLocal: "2026-11-17", todayLocal: "2026-11-20" })).toBe(true);
    expect(holds({ collectionDateLocal: "2026-11-16", todayLocal: "2026-11-20" })).toBe(false);
  });
});

const state = (overrides: Partial<ReminderCandidateState> = {}): ReminderCandidateState => ({
  now: NOW,
  dueAt: new Date(NOW.getTime() - 10 * DAY),
  outstandingCents: 4500,
  hasPayer: true,
  hasEmail: true,
  lastSentAt: null,
  sentCount: 0,
  hasPendingReservation: false,
  minIntervalDays: 7,
  origin: "manual",
  autoAfterDays: 3,
  automaticCollectionHold: false,
  ...overrides,
});

describe("evaluateReminder con el cobro automático", () => {
  it("una cuota que espera a su cobro se omite con la razón automatic_collection", () => {
    expect(evaluateReminder(state({ automaticCollectionHold: true }))).toEqual({
      eligible: false,
      reason: "automatic_collection",
    });
    expect(evaluateReminder(state({ automaticCollectionHold: true, origin: "automatic" }))).toEqual({
      eligible: false,
      reason: "automatic_collection",
    });
    expect(SKIP_REASON_LABELS.automatic_collection).toBe("Se cobrará automáticamente");
  });

  it("una cuota saldada sigue diciendo «settled»", () => {
    expect(evaluateReminder(state({ automaticCollectionHold: true, outstandingCents: 0 }))).toEqual({
      eligible: false,
      reason: "settled",
    });
  });

  it("el plan de envío deja fuera las cuotas que esperan", () => {
    const base: ReminderCandidate = {
      chargeId: "00000000-0000-4000-8000-000000000001",
      familyId: "f0000000-0000-4000-8000-000000000001",
      locationId: "10000000-0000-4000-8000-000000000001",
      locationName: "Sede",
      locationTimezone: "Europe/Madrid",
      invoiceReference: "MENSUAL-202611-1",
      currency: "EUR",
      dueAt: new Date(NOW.getTime() - 5 * DAY),
      servicePeriodStart: "2026-11-01",
      outstandingCents: 4500,
      guardianId: "90000000-0000-4000-8000-000000000001",
      payerFirstName: "María",
      payerEmail: "maria@example.invalid",
      lastSentAt: null,
      sentCount: 0,
      failedCount: 0,
      hasPendingReservation: false,
      automaticCollectionHold: false,
    };
    const result = planReminders({
      candidates: [base, { ...base, chargeId: "00000000-0000-4000-8000-000000000002", automaticCollectionHold: true }],
      now: NOW,
      origin: "automatic",
      minIntervalDays: 7,
      autoAfterDays: 3,
    });
    expect(result.groups.flatMap((group) => group.candidates.map((item) => item.chargeId))).toEqual([base.chargeId]);
    expect(result.skipped).toEqual([
      { chargeId: "00000000-0000-4000-8000-000000000002", reason: "automatic_collection" },
    ]);
  });
});

describe("loadReminderCandidates con el cobro automático", () => {
  const organizationId = "10000000-0000-4000-8000-000000000001";
  const locationId = "10000000-0000-4000-8000-000000000002";

  function row(overrides: Record<string, unknown> = {}) {
    return {
      chargeId: "10000000-0000-4000-8000-000000000007",
      familyId: "10000000-0000-4000-8000-000000000003",
      locationId,
      locationName: "Sede",
      locationTimezone: "Europe/Madrid",
      invoiceReference: "MENSUAL-202611-1",
      currency: "EUR",
      dueAt: "2026-11-18T09:00:00.000000Z",
      servicePeriodStart: "2026-11-01",
      outstandingCents: "4500",
      guardianId: null,
      payerFirstName: null,
      payerEmail: null,
      lastSentAt: null,
      sentCount: 0,
      failedCount: 0,
      hasPendingReservation: false,
      ...overrides,
    };
  }

  function client(rows: Array<Record<string, unknown>>) {
    const executed: string[] = [];
    const execute = vi.fn(async (statement: Parameters<PgDialect["sqlToQuery"]>[0]) => {
      executed.push(dialect.sqlToQuery(statement).sql.replace(/\s+/g, " "));
      return { rows };
    });
    return { client: { execute } as unknown as DatabaseClient, executed };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isFamilyAutomaticCollectionFlagEnabled).mockReturnValue(true);
    vi.mocked(resolveConnectEnvironment).mockReturnValue("test");
    vi.mocked(isProductionDatabase).mockReturnValue(false);
    vi.mocked(isFamilyCollectionStorageAvailable).mockResolvedValue(true);
  });

  it("con la bandera apagada la consulta es la de siempre y nada espera", async () => {
    vi.mocked(isFamilyAutomaticCollectionFlagEnabled).mockReturnValue(false);
    const { client: fake, executed } = client([row()]);

    const [candidate] = await loadReminderCandidates(fake, { organizationId, locationIds: [locationId], limit: 10, now: NOW });

    expect(candidate.automaticCollectionHold).toBe(false);
    expect(isFamilyCollectionStorageAvailable).not.toHaveBeenCalled();
    expect(executed[0]).not.toContain("family_collection_attempts");
  });

  it("con los cerrojos cerrados (Live o base de producción) nada espera", async () => {
    vi.mocked(isProductionDatabase).mockReturnValue(true);
    const { client: fake, executed } = client([row()]);
    const [candidate] = await loadReminderCandidates(fake, { organizationId, locationIds: [locationId], limit: 10, now: NOW });
    expect(candidate.automaticCollectionHold).toBe(false);
    expect(executed[0]).not.toContain("family_collection_attempts");
  });

  it("sin las tablas de la Fase 3 nada espera", async () => {
    vi.mocked(isFamilyCollectionStorageAvailable).mockResolvedValue(false);
    const { client: fake, executed } = client([row()]);
    const [candidate] = await loadReminderCandidates(fake, { organizationId, locationIds: [locationId], limit: 10, now: NOW });
    expect(candidate.automaticCollectionHold).toBe(false);
    expect(executed[0]).not.toContain("family_collection_attempts");
  });

  it("con el cobro abierto lee el último intento de la factura y el día de cobro", async () => {
    const { client: fake, executed } = client([
      row({ collectionMode: "automatic", lastAttemptStatus: "claimed", lastAttemptRetryPending: false, collectionDayOfMonth: null }),
      row({ chargeId: "c2", collectionMode: "automatic", lastAttemptStatus: "canceled", lastAttemptRetryPending: false, collectionDayOfMonth: null }),
      row({ chargeId: "c3", collectionMode: "manual", lastAttemptStatus: null, lastAttemptRetryPending: null, collectionDayOfMonth: null }),
      row({ chargeId: "c4", collectionMode: "automatic", lastAttemptStatus: "failed", lastAttemptRetryPending: true, collectionDayOfMonth: null }),
    ]);

    const candidates = await loadReminderCandidates(fake, { organizationId, locationIds: [locationId], limit: 10, now: NOW });

    expect(candidates.map((candidate) => candidate.automaticCollectionHold)).toEqual([true, false, false, true]);
    expect(executed[0]).toContain("from zaltyko.family_collection_attempts a");
    expect(executed[0]).toContain("order by a.attempt_number desc");
    expect(executed[0]).toContain("zaltyko.organization_collection_settings");
  });

  it("sin intento: espera hasta tres días después del día de cobro fijo de la academia", async () => {
    // Vence el 18 y la academia cobra el día 25: el 20 todavía espera.
    const fixed = row({ collectionMode: "automatic", lastAttemptStatus: null, lastAttemptRetryPending: null, collectionDayOfMonth: 25 });
    const { client: fake } = client([fixed]);
    const [waiting] = await loadReminderCandidates(fake, { organizationId, locationIds: [locationId], limit: 10, now: NOW });
    expect(waiting.automaticCollectionHold).toBe(true);

    // Por vencimiento (sin día fijo), el 18 + 3 = 21; el 22 ya se recuerda.
    const byDue = row({ collectionMode: "automatic", lastAttemptStatus: null, lastAttemptRetryPending: null, collectionDayOfMonth: null });
    const { client: fake2 } = client([byDue]);
    const [released] = await loadReminderCandidates(fake2, {
      organizationId,
      locationIds: [locationId],
      limit: 10,
      now: new Date("2026-11-22T10:00:00Z"),
    });
    expect(released.automaticCollectionHold).toBe(false);
  });
});
