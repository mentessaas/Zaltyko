import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cobro automático (Fase 3): una cuota que se cobra sola no recibe
 * recordatorios mientras su cobro siga pendiente (razón `automatic_collection`);
 * sí tras el fallo final o la cancelación. Con la bandera apagada (o los
 * cerrojos cerrados) solo la retiene un cobro que ya está en marcha.
 */

vi.mock("@/modules/family-collection/application/config", () => ({
  isFamilyAutomaticCollectionFlagEnabled: vi.fn(),
  isFamilyAutomaticSepaCollectionFlagEnabled: vi.fn(),
  resolveConnectEnvironment: vi.fn(),
  isProductionDatabase: vi.fn(),
}));
vi.mock("@/modules/family-collection/application/storage", () => ({
  isFamilyCollectionStorageAvailable: vi.fn(),
}));

import type { DatabaseClient } from "@/lib/db-transactions";
import {
  isFamilyAutomaticCollectionFlagEnabled,
  isFamilyAutomaticSepaCollectionFlagEnabled,
  isProductionDatabase,
  resolveConnectEnvironment,
} from "@/modules/family-collection/application/config";
import { isFamilyCollectionStorageAvailable } from "@/modules/family-collection/application/storage";
import { localCalendarDate } from "@/modules/family-collection/domain/collection-plan";
import { nextRetry } from "@/modules/family-collection/domain/retry-policy";
import { loadReminderCandidates, type ReminderCandidate } from "@/modules/payment-reminders/application/candidates";
import { planReminders } from "@/modules/payment-reminders/application/plan";
import {
  AUTOMATIC_COLLECTION_IN_PROGRESS_STATUSES,
  AUTOMATIC_COLLECTION_REMINDER_GRACE_DAYS,
  automaticCollectionHolds,
  evaluateReminder,
  isAutomaticCollectionInProgress,
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

const attempt = (status: string, dates: { retry?: string; completed?: string } = {}) => ({
  status,
  retryDateLocal: dates.retry ?? null,
  completedDateLocal: dates.completed ?? null,
});

describe("automaticCollectionHolds", () => {
  it("una cuota manual o con el cobro automático cerrado (bandera apagada) sin cobro en marcha no espera", () => {
    expect(holds({ collectionMode: "manual" })).toBe(false);
    expect(holds({ automaticCollectionOpen: false })).toBe(false);
    // Con la bandera apagada un reintento pendiente no saldrá: no retiene.
    expect(holds({ automaticCollectionOpen: false, lastAttempt: attempt("failed", { retry: "2026-11-21" }) })).toBe(false);
    expect(holds({ automaticCollectionOpen: false, lastAttempt: attempt("succeeded", { completed: "2026-11-20" }) })).toBe(false);
  });

  it.each(["claimed", "created", "processing"])(
    "un cobro %s retiene siempre: con la bandera apagada y aunque la cuota figure como manual",
    (status) => {
      expect(holds({ automaticCollectionOpen: false, lastAttempt: attempt(status) })).toBe(true);
      expect(holds({ collectionMode: "manual", lastAttempt: attempt(status) })).toBe(true);
      expect(holds({ collectionMode: "manual", automaticCollectionOpen: false, lastAttempt: attempt(status) })).toBe(true);
    }
  );

  it("isAutomaticCollectionInProgress: solo claimed, created y processing", () => {
    expect(AUTOMATIC_COLLECTION_IN_PROGRESS_STATUSES).toEqual(["claimed", "created", "processing"]);
    for (const status of ["succeeded", "failed", "canceled", "", null, undefined]) {
      expect(isAutomaticCollectionInProgress(status), String(status)).toBe(false);
    }
  });

  it.each(["claimed", "created", "processing"])("con un intento %s espera", (status) => {
    expect(holds({ lastAttempt: attempt(status) })).toBe(true);
  });

  it("con un reintento pendiente espera hasta tres días después de la fecha del reintento", () => {
    expect(holds({ lastAttempt: attempt("failed", { retry: "2026-11-23" }) })).toBe(true);
    expect(holds({ lastAttempt: attempt("failed", { retry: "2026-11-17" }) })).toBe(true);
    // Reintento que nunca llegó (proceso parado, puerta pasajera): vuelve a los recordatorios.
    expect(holds({ lastAttempt: attempt("failed", { retry: "2026-11-16" }) })).toBe(false);
  });

  it("con un fallo final vuelve a los recordatorios", () => {
    expect(holds({ lastAttempt: attempt("failed", { completed: "2026-11-19" }) })).toBe(false);
  });

  it("cancelado (puerta, academia, pago manual o revisión) vuelve a los recordatorios", () => {
    expect(holds({ lastAttempt: attempt("canceled", { completed: "2026-11-20" }) })).toBe(false);
  });

  it("cobrado pero con saldo pendiente: espera tres días desde el cobro y después vuelve", () => {
    expect(holds({ lastAttempt: attempt("succeeded", { completed: "2026-11-18" }) })).toBe(true);
    expect(holds({ lastAttempt: attempt("succeeded", { completed: "2026-11-17" }) })).toBe(true);
    expect(holds({ lastAttempt: attempt("succeeded", { completed: "2026-11-16" }) })).toBe(false);
  });

  it(`sin intento espera hasta ${AUTOMATIC_COLLECTION_REMINDER_GRACE_DAYS} días después de la fecha de cobro`, () => {
    expect(holds({ collectionDateLocal: "2026-11-25", todayLocal: "2026-11-20" })).toBe(true);
    expect(holds({ collectionDateLocal: "2026-11-17", todayLocal: "2026-11-20" })).toBe(true);
    expect(holds({ collectionDateLocal: "2026-11-16", todayLocal: "2026-11-20" })).toBe(false);
  });

  it("domiciliación sin activar (D2): ni la espera sin intento ni un reintento retienen; lo que ya se movió, sí", () => {
    const sepaOff = { paymentMethodCollectable: false };
    // Sin intento, aunque la fecha de cobro aún no haya llegado: nunca se cobrará sola.
    expect(holds({ ...sepaOff, collectionDateLocal: "2026-11-25" })).toBe(false);
    expect(holds({ ...sepaOff, lastAttempt: null })).toBe(false);
    expect(holds({ ...sepaOff, lastAttempt: attempt("failed", { retry: "2026-11-21" }) })).toBe(false);
    // Cobro en marcha (una domiciliación ya en el banco) o cobrado con saldo pendiente: siguen esperando.
    for (const status of ["claimed", "created", "processing"]) {
      expect(holds({ ...sepaOff, lastAttempt: attempt(status) })).toBe(true);
    }
    expect(holds({ ...sepaOff, lastAttempt: attempt("succeeded", { completed: "2026-11-19" }) })).toBe(true);
    // Por defecto (sin indicar) el método se puede cobrar: como hasta ahora.
    expect(holds({ collectionDateLocal: "2026-11-25" })).toBe(true);
    expect(holds({ paymentMethodCollectable: true, collectionDateLocal: "2026-11-25" })).toBe(true);
  });
});

describe("cadena de reintentos de tarjeta (D1): sin recordatorios mientras siga viva", () => {
  const timezone = "Europe/Madrid";
  // Primer intento el 10 (09:00 en Madrid), que es también la fecha de cobro.
  const firstAttemptClaimedAt = new Date("2026-11-10T08:00:00.000Z");
  const collectionDateLocal = "2026-11-10";

  /** Fecha local del reintento que deja un fallo blando del intento `attemptNumber` en `at`. */
  function retryAfter(attemptNumber: number, at: string): string | null {
    const retry = nextRetry({
      kind: "card",
      attemptNumber,
      code: "card_declined",
      declineCode: "insufficient_funds",
      firstAttemptClaimedAt,
      now: new Date(at),
      timezone,
    });
    return retry ? localCalendarDate(retry, timezone) : null;
  }

  it("retenidos del primer fallo al último; tras el 4.º fallo vuelven", () => {
    const retry2 = retryAfter(1, "2026-11-10T08:00:00.000Z");
    const retry3 = retryAfter(2, "2026-11-11T07:00:00.000Z");
    const retry4 = retryAfter(3, "2026-11-13T07:00:00.000Z");
    expect([retry2, retry3, retry4, retryAfter(4, "2026-11-17T07:00:00.000Z")]).toEqual([
      "2026-11-11",
      "2026-11-13",
      "2026-11-17",
      null,
    ]);

    // [hoy, reintento pendiente del último intento fallido]. Del 14 al 16 ya pasó
    // la espera de la fecha de cobro (10 + 3), pero la cadena sigue viva.
    const timeline: Array<[string, string]> = [
      ["2026-11-10", retry2!],
      ["2026-11-11", retry3!],
      ["2026-11-12", retry3!],
      ["2026-11-13", retry4!],
      ["2026-11-14", retry4!],
      ["2026-11-16", retry4!],
    ];
    for (const [todayLocal, retry] of timeline) {
      expect(holds({ collectionDateLocal, todayLocal, lastAttempt: attempt("failed", { retry }) }), todayLocal).toBe(true);
    }

    // El 4.º falla (fallo final, sin reintento): la cuota vuelve a los recordatorios ese día.
    expect(
      holds({ collectionDateLocal, todayLocal: "2026-11-17", lastAttempt: attempt("failed", { completed: "2026-11-17" }) })
    ).toBe(false);
  });

  it("si el último reintento no llega a salir, espera tres días desde su fecha y después vuelve", () => {
    const lastRetry = attempt("failed", { retry: "2026-11-17" });
    expect(holds({ collectionDateLocal, todayLocal: "2026-11-20", lastAttempt: lastRetry })).toBe(true);
    expect(holds({ collectionDateLocal, todayLocal: "2026-11-21", lastAttempt: lastRetry })).toBe(false);
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
    vi.mocked(isFamilyAutomaticSepaCollectionFlagEnabled).mockReturnValue(false);
  });

  /**
   * Filas de una lectura con el cobro automático cerrado: los cobros en
   * marcha retienen; ni un reintento pendiente, ni la espera de la fecha de
   * cobro, ni un cobro hecho con saldo pendiente.
   */
  function closedRows() {
    return [
      row({ chargeId: "c1", collectionMode: "automatic", lastAttemptStatus: "claimed", collectionDayOfMonth: null }),
      row({ chargeId: "c2", collectionMode: "automatic", lastAttemptStatus: "created", collectionDayOfMonth: null }),
      // SEPA en el banco: la relectura diaria sigue y puede completarse.
      row({ chargeId: "c3", collectionMode: "automatic", lastAttemptStatus: "processing", collectionDayOfMonth: null }),
      // Reintento pendiente mañana: con la bandera apagada no saldrá.
      row({
        chargeId: "c4",
        collectionMode: "automatic",
        lastAttemptStatus: "failed",
        lastAttemptNextRetryAt: "2026-11-21T07:00:00.000000Z",
        collectionDayOfMonth: null,
      }),
      // Sin intento y dentro de la espera de la fecha de cobro (vence el 18).
      row({ chargeId: "c5", collectionMode: "automatic", lastAttemptStatus: null, collectionDayOfMonth: null }),
      row({
        chargeId: "c6",
        collectionMode: "automatic",
        lastAttemptStatus: "succeeded",
        lastAttemptCompletedAt: "2026-11-19T07:00:00.000000Z",
        collectionDayOfMonth: null,
      }),
      row({
        chargeId: "c7",
        collectionMode: "automatic",
        lastAttemptStatus: "canceled",
        lastAttemptCompletedAt: "2026-11-19T09:00:00.000000Z",
        collectionDayOfMonth: null,
      }),
    ];
  }
  const closedHolds = [true, true, true, false, false, false, false];

  it("con la bandera apagada solo retiene un cobro en marcha (claimed, created, processing)", async () => {
    vi.mocked(isFamilyAutomaticCollectionFlagEnabled).mockReturnValue(false);
    const { client: fake, executed } = client(closedRows());

    const candidates = await loadReminderCandidates(fake, { organizationId, locationIds: [locationId], limit: 10, now: NOW });

    expect(candidates.map((candidate) => candidate.automaticCollectionHold)).toEqual(closedHolds);
    // Con las tablas de la Fase 3 se lee el último intento aunque la bandera esté apagada.
    expect(isFamilyCollectionStorageAvailable).toHaveBeenCalledWith(fake);
    expect(executed[0]).toContain("from zaltyko.family_collection_attempts a");
    expect(executed[0]).toContain("order by a.attempt_number desc");
  });

  it.each([
    [
      "clave de Live",
      () => {
        vi.mocked(resolveConnectEnvironment).mockReturnValue("live");
      },
    ],
    [
      "base de producción",
      () => {
        vi.mocked(isProductionDatabase).mockReturnValue(true);
      },
    ],
  ])("con los cerrojos cerrados (%s) solo retiene un cobro en marcha", async (_label, close) => {
    close();
    const { client: fake, executed } = client(closedRows());
    const candidates = await loadReminderCandidates(fake, { organizationId, locationIds: [locationId], limit: 10, now: NOW });
    expect(candidates.map((candidate) => candidate.automaticCollectionHold)).toEqual(closedHolds);
    expect(executed[0]).toContain("from zaltyko.family_collection_attempts a");
  });

  it("sin las tablas de la Fase 3 nada espera y la consulta es la de siempre", async () => {
    vi.mocked(isFamilyCollectionStorageAvailable).mockResolvedValue(false);
    const { client: fake, executed } = client([
      row(),
      // Aunque la fila trajera un estado, sin tablas no hay cobros automáticos.
      row({ chargeId: "c2", collectionMode: "automatic", lastAttemptStatus: "processing" }),
    ]);
    const candidates = await loadReminderCandidates(fake, { organizationId, locationIds: [locationId], limit: 10, now: NOW });
    expect(candidates.map((candidate) => candidate.automaticCollectionHold)).toEqual([false, false]);
    expect(executed[0]).not.toContain("family_collection_attempts");
  });

  it("bandera apagada con un SEPA en el banco: el plan de envío lo deja fuera (sin cobro doble)", async () => {
    vi.mocked(isFamilyAutomaticCollectionFlagEnabled).mockReturnValue(false);
    const { client: fake } = client([
      row({
        chargeId: "c1",
        guardianId: "10000000-0000-4000-8000-000000000009",
        payerFirstName: "María",
        payerEmail: "maria@example.invalid",
        collectionMode: "automatic",
        lastAttemptStatus: "processing",
        collectionDayOfMonth: null,
      }),
      row({
        chargeId: "c2",
        guardianId: "10000000-0000-4000-8000-000000000009",
        payerFirstName: "María",
        payerEmail: "maria@example.invalid",
        collectionMode: "automatic",
        lastAttemptStatus: null,
        collectionDayOfMonth: null,
      }),
    ]);
    const candidates = await loadReminderCandidates(fake, { organizationId, locationIds: [locationId], limit: 10, now: NOW });

    const plan = planReminders({ candidates, now: NOW, origin: "manual", minIntervalDays: 7, autoAfterDays: 3 });

    expect(plan.skipped).toEqual([{ chargeId: "c1", reason: "automatic_collection" }]);
    expect(plan.groups.flatMap((group) => group.candidates.map((item) => item.chargeId))).toEqual(["c2"]);
  });

  it("con el cobro abierto lee el último intento de la factura y el día de cobro", async () => {
    const { client: fake, executed } = client([
      row({ collectionMode: "automatic", lastAttemptStatus: "claimed", collectionDayOfMonth: null }),
      row({
        chargeId: "c2",
        collectionMode: "automatic",
        lastAttemptStatus: "canceled",
        lastAttemptCompletedAt: "2026-11-19T09:00:00.000000Z",
        collectionDayOfMonth: null,
      }),
      row({ chargeId: "c3", collectionMode: "manual", lastAttemptStatus: null, collectionDayOfMonth: null }),
      row({
        chargeId: "c4",
        collectionMode: "automatic",
        lastAttemptStatus: "failed",
        lastAttemptNextRetryAt: "2026-11-21T07:00:00.000000Z",
        collectionDayOfMonth: null,
      }),
      // Reintento del día 10 que nunca llegó: el 20 ya se recuerda.
      row({
        chargeId: "c5",
        collectionMode: "automatic",
        lastAttemptStatus: "failed",
        lastAttemptNextRetryAt: "2026-11-10T07:00:00.000000Z",
        collectionDayOfMonth: null,
      }),
      // Cobrada el 12 y con saldo pendiente: el 20 ya se recuerda.
      row({
        chargeId: "c6",
        collectionMode: "automatic",
        lastAttemptStatus: "succeeded",
        lastAttemptCompletedAt: "2026-11-12T07:00:00.000000Z",
        collectionDayOfMonth: null,
      }),
    ]);

    const candidates = await loadReminderCandidates(fake, { organizationId, locationIds: [locationId], limit: 10, now: NOW });

    expect(candidates.map((candidate) => candidate.automaticCollectionHold)).toEqual([
      true,
      false,
      false,
      true,
      false,
      false,
    ]);
    expect(executed[0]).toContain("from zaltyko.family_collection_attempts a");
    expect(executed[0]).toContain("last_attempt.next_retry_at");
    expect(executed[0]).toContain("last_attempt.completed_at");
    expect(executed[0]).toContain("order by a.attempt_number desc");
    expect(executed[0]).toContain("zaltyko.organization_collection_settings");
  });

  it("sin intento: espera hasta tres días después del día de cobro fijo de la academia", async () => {
    // Vence el 18 y la academia cobra el día 25: el 20 todavía espera.
    const fixed = row({ collectionMode: "automatic", lastAttemptStatus: null, collectionDayOfMonth: 25 });
    const { client: fake } = client([fixed]);
    const [waiting] = await loadReminderCandidates(fake, { organizationId, locationIds: [locationId], limit: 10, now: NOW });
    expect(waiting.automaticCollectionHold).toBe(true);

    // Por vencimiento (sin día fijo), el 18 + 3 = 21; el 22 ya se recuerda.
    const byDue = row({ collectionMode: "automatic", lastAttemptStatus: null, collectionDayOfMonth: null });
    const { client: fake2 } = client([byDue]);
    const [released] = await loadReminderCandidates(fake2, {
      organizationId,
      locationIds: [locationId],
      limit: 10,
      now: new Date("2026-11-22T10:00:00Z"),
    });
    expect(released.automaticCollectionHold).toBe(false);
  });

  describe("domiciliación sin activar (D2, «Primero solo tarjeta»)", () => {
    const payer = {
      guardianId: "10000000-0000-4000-8000-000000000009",
      payerFirstName: "María",
      payerEmail: "maria@example.invalid",
    };
    /** Con el cobro abierto: la misma cuota con tarjeta y con domiciliación, en cada situación. */
    function sepaRows(kind: string | null) {
      return [
        // Sin intento y antes de su espera (vence el 18; hoy es el 20).
        row({ chargeId: "s1", collectionMode: "automatic", lastAttemptStatus: null, collectionDayOfMonth: null, activeAuthorizationKind: kind }),
        // Reintento pendiente mañana.
        row({
          chargeId: "s2",
          collectionMode: "automatic",
          lastAttemptStatus: "failed",
          lastAttemptNextRetryAt: "2026-11-21T07:00:00.000000Z",
          collectionDayOfMonth: null,
          activeAuthorizationKind: kind,
        }),
        // Domiciliación ya en el banco: se sigue liquidando.
        row({ chargeId: "s3", collectionMode: "automatic", lastAttemptStatus: "processing", collectionDayOfMonth: null, activeAuthorizationKind: kind }),
        // Cobrada ayer con saldo pendiente.
        row({
          chargeId: "s4",
          collectionMode: "automatic",
          lastAttemptStatus: "succeeded",
          lastAttemptCompletedAt: "2026-11-19T07:00:00.000000Z",
          collectionDayOfMonth: null,
          activeAuthorizationKind: kind,
        }),
      ];
    }

    it("bandera de la domiciliación apagada: sin intento o con reintento no retiene; en el banco o cobrada, sí", async () => {
      const { client: fake, executed } = client(sepaRows("sepa_debit"));
      const candidates = await loadReminderCandidates(fake, { organizationId, locationIds: [locationId], limit: 10, now: NOW });

      expect(candidates.map((candidate) => candidate.automaticCollectionHold)).toEqual([false, false, true, true]);
      // La consulta lee el tipo de la autorización activa del pagador en la cuenta de test.
      expect(executed[0]).toContain("from zaltyko.family_payment_authorizations au");
      expect(executed[0]).toContain('as "activeAuthorizationKind"');
      expect(executed[0]).toContain("acc.environment = 'test'::zaltyko.stripe_environment");
    });

    it("con tarjeta (o sin autorización leída) retiene como siempre", async () => {
      for (const kind of ["card", null]) {
        const { client: fake } = client(sepaRows(kind));
        const candidates = await loadReminderCandidates(fake, { organizationId, locationIds: [locationId], limit: 10, now: NOW });
        expect(candidates.map((candidate) => candidate.automaticCollectionHold)).toEqual([true, true, true, true]);
      }
    });

    it("bandera de la domiciliación encendida: la domiciliación retiene como hoy", async () => {
      vi.mocked(isFamilyAutomaticSepaCollectionFlagEnabled).mockReturnValue(true);
      const { client: fake } = client(sepaRows("sepa_debit"));
      const candidates = await loadReminderCandidates(fake, { organizationId, locationIds: [locationId], limit: 10, now: NOW });
      expect(candidates.map((candidate) => candidate.automaticCollectionHold)).toEqual([true, true, true, true]);
    });

    it("el plan de envío recuerda la cuota de quien domicilia (nunca se queda en el limbo)", async () => {
      const { client: fake } = client([
        row({ chargeId: "s1", ...payer, collectionMode: "automatic", lastAttemptStatus: null, collectionDayOfMonth: null, activeAuthorizationKind: "sepa_debit" }),
        row({ chargeId: "c1", ...payer, collectionMode: "automatic", lastAttemptStatus: null, collectionDayOfMonth: null, activeAuthorizationKind: "card" }),
      ]);
      const candidates = await loadReminderCandidates(fake, { organizationId, locationIds: [locationId], limit: 10, now: NOW });

      const plan = planReminders({ candidates, now: NOW, origin: "manual", minIntervalDays: 7, autoAfterDays: 3 });

      expect(plan.groups.flatMap((group) => group.candidates.map((item) => item.chargeId))).toEqual(["s1"]);
      expect(plan.skipped).toEqual([{ chargeId: "c1", reason: "automatic_collection" }]);
    });
  });
});
