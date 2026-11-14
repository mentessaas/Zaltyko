import type { ReminderCandidate } from "@/modules/payment-reminders/application/candidates";
import {
  evaluateReminder,
  type ReminderOrigin,
  type ReminderSkipReason,
} from "@/modules/payment-reminders/domain/reminder-policy";

/**
 * Plan de envío: qué cuotas reciben recordatorio y cómo se agrupan en correos.
 * Puro y sin base de datos, para poder probar límites y agrupación solos.
 */

/** Tope de cuotas por envío: un clic no debe lanzar cientos de correos. */
export const MAX_CHARGES_PER_BATCH = 100;

export interface ReminderSkip {
  chargeId: string;
  reason: ReminderSkipReason | "not_found";
}

export interface ReminderGroup {
  /** Una por correo; comparten emailGroupId las filas del registro. */
  guardianId: string;
  email: string;
  payerFirstName: string | null;
  currency: string;
  timeZone: string;
  candidates: ReminderCandidate[];
}

export interface ReminderPlan {
  groups: ReminderGroup[];
  skipped: ReminderSkip[];
  /** Cuotas aptas que no caben en este envío (por MAX_CHARGES_PER_BATCH). */
  remaining: number;
}

export function planReminders(input: {
  candidates: ReminderCandidate[];
  requestedChargeIds?: string[];
  now: Date;
  origin: ReminderOrigin;
  minIntervalDays: number;
  autoAfterDays: number;
  /** Para el envío «a todas las vencidas»: solo las que ya vencieron. */
  overdueOnly?: boolean;
  maxCharges?: number;
}): ReminderPlan {
  const max = input.maxCharges ?? MAX_CHARGES_PER_BATCH;
  const skipped: ReminderSkip[] = [];
  const eligible: ReminderCandidate[] = [];

  if (input.requestedChargeIds) {
    const found = new Set(input.candidates.map((candidate) => candidate.chargeId));
    for (const chargeId of new Set(input.requestedChargeIds)) {
      if (!found.has(chargeId)) skipped.push({ chargeId, reason: "not_found" });
    }
  }

  for (const candidate of input.candidates) {
    if (input.overdueOnly && candidate.dueAt.getTime() >= input.now.getTime()) {
      skipped.push({ chargeId: candidate.chargeId, reason: "not_overdue_yet" });
      continue;
    }
    const decision = evaluateReminder({
      now: input.now,
      dueAt: candidate.dueAt,
      outstandingCents: candidate.outstandingCents,
      hasPayer: candidate.guardianId !== null,
      hasEmail: candidate.payerEmail !== null,
      lastSentAt: candidate.lastSentAt,
      sentCount: candidate.sentCount,
      hasPendingReservation: candidate.hasPendingReservation,
      minIntervalDays: input.minIntervalDays,
      origin: input.origin,
      autoAfterDays: input.autoAfterDays,
    });
    if (decision.eligible) eligible.push(candidate);
    else skipped.push({ chargeId: candidate.chargeId, reason: decision.reason });
  }

  const selected = eligible.slice(0, max);
  const groups = new Map<string, ReminderGroup>();
  for (const candidate of selected) {
    // Eligible implica tutor y correo presentes.
    const guardianId = candidate.guardianId as string;
    const key = `${guardianId}|${candidate.currency}`;
    const group = groups.get(key);
    if (group) {
      group.candidates.push(candidate);
    } else {
      groups.set(key, {
        guardianId,
        email: candidate.payerEmail as string,
        payerFirstName: candidate.payerFirstName,
        currency: candidate.currency,
        timeZone: candidate.locationTimezone,
        candidates: [candidate],
      });
    }
  }
  return { groups: [...groups.values()], skipped, remaining: eligible.length - selected.length };
}
