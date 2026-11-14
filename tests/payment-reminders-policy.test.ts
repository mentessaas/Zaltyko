import { describe, expect, it } from "vitest";

import type { ReminderCandidate } from "@/modules/payment-reminders/application/candidates";
import { MAX_CHARGES_PER_BATCH, planReminders } from "@/modules/payment-reminders/application/plan";
import {
  evaluateReminder,
  nextEligibleAt,
  type ReminderCandidateState,
} from "@/modules/payment-reminders/domain/reminder-policy";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-20T10:00:00Z");

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
  ...overrides,
});

describe("límite de un recordatorio por cuota cada N días", () => {
  it("permite el primero y bloquea hasta cumplir exactamente los días configurados", () => {
    expect(evaluateReminder(state())).toEqual({ eligible: true });
    const sentAt = new Date(NOW.getTime() - 6 * DAY - 23 * 60 * 60 * 1000);
    expect(evaluateReminder(state({ lastSentAt: sentAt, sentCount: 1 }))).toEqual({ eligible: false, reason: "recently_reminded" });
    const exactly = new Date(NOW.getTime() - 7 * DAY);
    expect(evaluateReminder(state({ lastSentAt: exactly, sentCount: 1 }))).toEqual({ eligible: true });
  });

  it("respeta un intervalo configurado distinto del de por defecto", () => {
    const sentAt = new Date(NOW.getTime() - 10 * DAY);
    expect(evaluateReminder(state({ lastSentAt: sentAt, sentCount: 1, minIntervalDays: 14 }))).toEqual({ eligible: false, reason: "recently_reminded" });
    expect(evaluateReminder(state({ lastSentAt: sentAt, sentCount: 1, minIntervalDays: 3 }))).toEqual({ eligible: true });
  });

  it("un envío fallido no consume el límite: sin lastSentAt se puede reintentar", () => {
    expect(evaluateReminder(state({ lastSentAt: null, sentCount: 0 }))).toEqual({ eligible: true });
  });

  it("una reserva en curso bloquea (doble clic, dos pestañas) y calcula la próxima fecha", () => {
    expect(evaluateReminder(state({ hasPendingReservation: true }))).toEqual({ eligible: false, reason: "in_progress" });
    expect(nextEligibleAt(new Date("2026-11-10T00:00:00Z"), 7)?.toISOString()).toBe("2026-11-17T00:00:00.000Z");
    expect(nextEligibleAt(null, 7)).toBeNull();
  });
});

describe("destinatario: solo el tutor pagador", () => {
  it("sin tutor pagador o sin su correo no se envía a nadie", () => {
    expect(evaluateReminder(state({ hasPayer: false, hasEmail: false }))).toEqual({ eligible: false, reason: "no_payer" });
    expect(evaluateReminder(state({ hasEmail: false }))).toEqual({ eligible: false, reason: "no_email" });
  });

  it("una cuota saldada no se recuerda", () => {
    expect(evaluateReminder(state({ outstandingCents: 0 }))).toEqual({ eligible: false, reason: "settled" });
  });
});

describe("recordatorio automático", () => {
  it("espera N días tras el vencimiento", () => {
    const dueAt = new Date(NOW.getTime() - 2 * DAY);
    expect(evaluateReminder(state({ origin: "automatic", dueAt }))).toEqual({ eligible: false, reason: "not_overdue_yet" });
    expect(evaluateReminder(state({ origin: "automatic", dueAt: new Date(NOW.getTime() - 3 * DAY) }))).toEqual({ eligible: true });
  });

  it("es único: no se envía si la cuota ya recibió cualquier recordatorio, manual o automático", () => {
    expect(
      evaluateReminder(state({ origin: "automatic", lastSentAt: new Date(NOW.getTime() - 30 * DAY), sentCount: 1 }))
    ).toEqual({ eligible: false, reason: "already_reminded" });
  });
});

function candidate(overrides: Partial<ReminderCandidate> = {}): ReminderCandidate {
  return {
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
    hasPendingReservation: false,
    ...overrides,
  };
}

const plan = (candidates: ReminderCandidate[], extra: Partial<Parameters<typeof planReminders>[0]> = {}) =>
  planReminders({ candidates, now: NOW, origin: "manual", minIntervalDays: 7, autoAfterDays: 3, ...extra });

describe("plan de envío", () => {
  it("agrupa en un solo correo las cuotas del mismo tutor y moneda, y separa monedas y tutores", () => {
    const result = plan([
      candidate({ chargeId: "00000000-0000-4000-8000-000000000001" }),
      candidate({ chargeId: "00000000-0000-4000-8000-000000000002", servicePeriodStart: "2026-10-01" }),
      candidate({ chargeId: "00000000-0000-4000-8000-000000000003", currency: "USD" }),
      candidate({ chargeId: "00000000-0000-4000-8000-000000000004", guardianId: "90000000-0000-4000-8000-000000000002", payerEmail: "otro@example.invalid" }),
    ]);
    expect(result.groups.map((group) => group.candidates.length).sort()).toEqual([1, 1, 2]);
  });

  it("omite con motivo las cuotas recordadas hace poco y no las incluye en ningún correo", () => {
    const result = plan([
      candidate({ chargeId: "00000000-0000-4000-8000-000000000001", lastSentAt: new Date(NOW.getTime() - 2 * DAY), sentCount: 1 }),
      candidate({ chargeId: "00000000-0000-4000-8000-000000000002" }),
    ]);
    expect(result.skipped).toEqual([{ chargeId: "00000000-0000-4000-8000-000000000001", reason: "recently_reminded" }]);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]!.candidates.map((item) => item.chargeId)).toEqual(["00000000-0000-4000-8000-000000000002"]);
  });

  it("un segundo envío inmediato no repite: con la reserva o el envío anterior ya registrado no queda nada que enviar", () => {
    const first = plan([candidate()]);
    expect(first.groups).toHaveLength(1);
    const second = plan([candidate({ lastSentAt: NOW, sentCount: 1 })]);
    expect(second.groups).toHaveLength(0);
    const concurrent = plan([candidate({ hasPendingReservation: true })]);
    expect(concurrent.groups).toHaveLength(0);
    expect(concurrent.skipped[0]!.reason).toBe("in_progress");
  });

  it("«todas las vencidas» deja fuera las que aún no vencieron", () => {
    const result = plan(
      [candidate({ dueAt: new Date(NOW.getTime() + 3 * DAY) }), candidate({ chargeId: "00000000-0000-4000-8000-000000000002" })],
      { overdueOnly: true }
    );
    expect(result.skipped).toEqual([{ chargeId: "00000000-0000-4000-8000-000000000001", reason: "not_overdue_yet" }]);
    expect(result.groups[0]!.candidates).toHaveLength(1);
  });

  it("avisa de las cuotas pedidas que no existen o ya no están abiertas", () => {
    const missing = "00000000-0000-4000-8000-0000000000ff";
    const result = plan([candidate()], { requestedChargeIds: [candidate().chargeId, missing] });
    expect(result.skipped).toContainEqual({ chargeId: missing, reason: "not_found" });
  });

  it("corta en el máximo por envío y cuenta lo que queda", () => {
    const many = Array.from({ length: MAX_CHARGES_PER_BATCH + 5 }, (_, index) =>
      candidate({
        chargeId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        guardianId: `90000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      })
    );
    const result = plan(many);
    expect(result.groups).toHaveLength(MAX_CHARGES_PER_BATCH);
    expect(result.remaining).toBe(5);
  });

  it("el automático solo toma cuotas vencidas hace N días que nunca recibieron aviso", () => {
    const result = plan(
      [
        candidate({ chargeId: "00000000-0000-4000-8000-000000000001", dueAt: new Date(NOW.getTime() - 4 * DAY) }),
        candidate({ chargeId: "00000000-0000-4000-8000-000000000002", dueAt: new Date(NOW.getTime() - 1 * DAY) }),
        candidate({ chargeId: "00000000-0000-4000-8000-000000000003", dueAt: new Date(NOW.getTime() - 20 * DAY), lastSentAt: new Date(NOW.getTime() - 15 * DAY), sentCount: 1 }),
      ],
      { origin: "automatic" }
    );
    expect(result.groups.flatMap((group) => group.candidates.map((item) => item.chargeId))).toEqual(["00000000-0000-4000-8000-000000000001"]);
    expect(result.skipped.map((skip) => skip.reason).sort()).toEqual(["already_reminded", "not_overdue_yet"]);
  });
});
