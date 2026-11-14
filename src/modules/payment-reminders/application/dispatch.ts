import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { sendEmailWithLogging } from "@/lib/email/email-service";
import { withTransaction } from "@/lib/db-transactions";
import { logger } from "@/lib/logger";
import {
  loadOrganizationProfile,
  loadReminderCandidates,
  localeForCountry,
  lockCharges,
  type OrganizationProfile,
} from "@/modules/payment-reminders/application/candidates";
import {
  MAX_CHARGES_PER_BATCH,
  planReminders,
  type ReminderGroup,
  type ReminderPlan,
  type ReminderSkip,
} from "@/modules/payment-reminders/application/plan";
import type { PaymentReminderSettings } from "@/modules/payment-reminders/application/settings";
import { reminderDedupeKey, type ReminderOrigin } from "@/modules/payment-reminders/domain/reminder-policy";
import {
  maskEmail,
  renderReminder,
  type RenderedReminder,
  type TemplateDraft,
} from "@/modules/payment-reminders/domain/reminder-template";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { appendAuditEntry } from "@/modules/shared/infrastructure/transactional-records";

/** Cuotas leídas para planificar; el plan corta después en MAX_CHARGES_PER_BATCH. */
const CANDIDATE_READ_LIMIT = 1000;

export type ReminderSelection =
  | { kind: "charges"; chargeIds: string[] }
  | { kind: "overdue" }
  | { kind: "automatic" };

export interface DispatchInput {
  organizationId: string;
  locationIds: string[];
  selection: ReminderSelection;
  origin: ReminderOrigin;
  /** null en los recordatorios automáticos. */
  actor: { userId: string; memberId: string } | null;
  settings: PaymentReminderSettings;
  now?: Date;
}

export interface ReminderOutcome {
  chargeId: string;
  outcome: "sent" | "failed" | "skipped";
  reason?: ReminderSkip["reason"] | "not_delivered";
}

export interface DispatchResult {
  /** Cuotas recordadas. */
  sent: number;
  /** Correos enviados (una familia con varias cuotas recibe uno solo). */
  emails: number;
  failed: number;
  skipped: number;
  /** Cuotas aptas que no cupieron en este envío. */
  remaining: number;
  outcomes: ReminderOutcome[];
}

function loadFilter(input: DispatchInput, now: Date) {
  const base = { organizationId: input.organizationId, locationIds: input.locationIds, limit: CANDIDATE_READ_LIMIT };
  switch (input.selection.kind) {
    case "charges":
      return { ...base, chargeIds: input.selection.chargeIds, limit: MAX_CHARGES_PER_BATCH * 2 };
    case "overdue":
      return { ...base, dueBefore: now };
    case "automatic":
      return {
        ...base,
        dueBefore: new Date(now.getTime() - input.settings.autoAfterDays * 24 * 60 * 60 * 1000),
      };
  }
}

function planFor(input: DispatchInput, now: Date, candidates: Parameters<typeof planReminders>[0]["candidates"]): ReminderPlan {
  return planReminders({
    candidates,
    requestedChargeIds: input.selection.kind === "charges" ? input.selection.chargeIds : undefined,
    now,
    origin: input.origin,
    minIntervalDays: input.settings.minIntervalDays,
    autoAfterDays: input.settings.autoAfterDays,
    overdueOnly: input.selection.kind === "overdue",
  });
}

function renderGroup(
  group: ReminderGroup,
  draft: TemplateDraft,
  organization: OrganizationProfile
): RenderedReminder {
  return renderReminder(draft, {
    locale: localeForCountry(organization.countryCode),
    timeZone: group.timeZone,
    currency: group.currency,
    academyName: organization.name,
    payerFirstName: group.payerFirstName,
    charges: group.candidates.map((candidate) => ({
      servicePeriodStart: candidate.servicePeriodStart,
      outstandingCents: candidate.outstandingCents,
      dueAt: candidate.dueAt,
    })),
  });
}

function settingsDraft(settings: PaymentReminderSettings): TemplateDraft {
  return {
    subject: settings.subjectTemplate,
    body: settings.bodyTemplate,
    paymentInstructions: settings.paymentInstructions,
  };
}

/**
 * Las respuestas de las familias deben llegar a la academia, no al soporte de
 * Zaltyko: sin correo de respuesta configurado no se envía nada.
 */
export const REPLY_TO_REQUIRED_REASON = "reply_to_required";

export function assertReplyToConfigured(settings: PaymentReminderSettings): string {
  if (!settings.replyToEmail) {
    throw new OperationalError(
      "INVALID_STATE_TRANSITION",
      "Antes de enviar, indica el correo de la academia al que deben responder las familias.",
      409,
      { reason: REPLY_TO_REQUIRED_REASON }
    );
  }
  return settings.replyToEmail;
}

function assertOrganizationCanSend(organization: OrganizationProfile | null): OrganizationProfile {
  if (!organization || organization.status === "suspended" || organization.status === "closed") {
    throw new OperationalError(
      "FORBIDDEN",
      "La academia no puede enviar correos en este momento",
      403
    );
  }
  return organization;
}

export interface ReminderPreview {
  totalCharges: number;
  totalEmails: number;
  remaining: number;
  /** Hasta tres correos de ejemplo, con el destinatario enmascarado. */
  samples: Array<{
    recipient: string;
    chargeCount: number;
    subject: string;
    text: string;
  }>;
  skipped: ReminderSkip[];
}

const PREVIEW_SAMPLES = 3;

/** Vista previa exacta de lo que se enviaría, sin reservar ni enviar nada. */
export async function previewReminders(
  input: DispatchInput & { draft?: TemplateDraft }
): Promise<ReminderPreview> {
  const now = input.now ?? new Date();
  const organization = assertOrganizationCanSend(await loadOrganizationProfile(db, input.organizationId));
  const candidates = await loadReminderCandidates(db, loadFilter(input, now));
  const plan = planFor(input, now, candidates);
  const draft = input.draft ?? settingsDraft(input.settings);
  return {
    totalCharges: plan.groups.reduce((sum, group) => sum + group.candidates.length, 0),
    totalEmails: plan.groups.length,
    remaining: plan.remaining,
    samples: plan.groups.slice(0, PREVIEW_SAMPLES).map((group) => {
      const rendered = renderGroup(group, draft, organization);
      return {
        recipient: maskEmail(group.email),
        chargeCount: group.candidates.length,
        subject: rendered.subject,
        text: rendered.text,
      };
    }),
    skipped: plan.skipped,
  };
}

/**
 * Envía los recordatorios. En una transacción bloquea las cuotas, vuelve a leer
 * su historial y reserva una fila `pending` por cuota apta: dos envíos
 * simultáneos no pueden recordar la misma cuota. Luego envía un correo por
 * tutor pagador y moneda y deja cada fila en `sent` o `failed`; un fallo no
 * consume el límite de días.
 */
export async function dispatchReminders(input: DispatchInput): Promise<DispatchResult> {
  const now = input.now ?? new Date();
  const replyTo = assertReplyToConfigured(input.settings);
  const organization = assertOrganizationCanSend(await loadOrganizationProfile(db, input.organizationId));
  const filter = loadFilter(input, now);

  const firstRead = await loadReminderCandidates(db, filter);
  const reserved = await withTransaction(async (tx) => {
    await lockCharges(tx, input.organizationId, firstRead.map((candidate) => candidate.chargeId));
    // Lectura definitiva ya con el bloqueo: es la que decide.
    const fresh = await loadReminderCandidates(tx, {
      ...filter,
      chargeIds: input.selection.kind === "charges" ? input.selection.chargeIds : firstRead.map((c) => c.chargeId),
      limit: CANDIDATE_READ_LIMIT,
    });
    const plan = planFor(input, now, fresh);
    const groups = plan.groups.map((group) => ({ group, emailGroupId: randomUUID() }));
    for (const { group, emailGroupId } of groups) {
      for (const candidate of group.candidates) {
        await tx.execute(sql`
          insert into zaltyko.payment_reminders (
            organization_id, charge_id, guardian_id, email_group_id, origin, status,
            outstanding_cents, currency, requested_by_member_id
          ) values (
            ${input.organizationId}::uuid, ${candidate.chargeId}::uuid, ${group.guardianId}::uuid,
            ${emailGroupId}::uuid, ${input.origin}, 'pending',
            ${candidate.outstandingCents}, ${candidate.currency}, ${input.actor?.memberId ?? null}::uuid
          )
        `);
      }
    }
    return { plan, groups };
  });

  const outcomes: ReminderOutcome[] = reserved.plan.skipped.map((skip) => ({
    chargeId: skip.chargeId,
    outcome: "skipped",
    reason: skip.reason,
  }));
  let emails = 0;
  let sent = 0;
  let failed = 0;
  const draft = settingsDraft(input.settings);

  for (const { group, emailGroupId } of reserved.groups) {
    const rendered = renderGroup(group, draft, organization);
    let accepted = false;
    try {
      accepted = await sendEmailWithLogging({
        purpose: "transactional",
        to: group.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        replyTo,
        template: "payment-reminder",
        // El emisor común enlaza academyId con la tabla antigua `academies`; la
        // organización canónica va como tenant, que no tiene clave foránea.
        tenantId: input.organizationId,
        metadata: { kind: "payment_reminder", origin: input.origin, chargeCount: group.candidates.length },
        dedupeKey: reminderDedupeKey(
          group.candidates.map((candidate) => candidate.chargeId),
          input.settings.minIntervalDays,
          now,
          Math.max(...group.candidates.map((candidate) => candidate.failedCount)),
          (value) => createHash("sha256").update(value).digest("hex")
        ),
      });
    } catch (error) {
      logger.error("No se pudo enviar un recordatorio de cuota", error, {
        organizationId: input.organizationId,
        emailGroupId,
      });
    }

    const status = accepted ? "sent" : "failed";
    try {
      await withTransaction(async (tx) => {
        await tx.execute(sql`
          update zaltyko.payment_reminders
             set status = ${status}::text, sent_at = case when ${status}::text = 'sent' then now() else null end
           where organization_id = ${input.organizationId}::uuid
             and email_group_id = ${emailGroupId}::uuid
             and status = 'pending'
        `);
        await appendAuditEntry(tx, {
          organizationId: input.organizationId,
          locationId: group.candidates[0]?.locationId ?? null,
          actorUserId: input.actor?.userId ?? null,
          action: accepted ? "payment_reminder.sent" : "payment_reminder.failed",
          targetType: "payment_reminder",
          targetId: emailGroupId,
          idempotencyKey: `payment-reminder:${emailGroupId}`,
          // Sin correo ni nombre: solo cuántas cuotas y de qué origen.
          after: { origin: input.origin, chargeCount: group.candidates.length, status },
        });
      });
    } catch (error) {
      // El correo ya salió o no; la fila queda `pending` y caduca sola.
      logger.error("No se pudo registrar el resultado de un recordatorio", error, {
        organizationId: input.organizationId,
        emailGroupId,
      });
    }

    if (accepted) emails += 1;
    for (const candidate of group.candidates) {
      if (accepted) {
        sent += 1;
        outcomes.push({ chargeId: candidate.chargeId, outcome: "sent" });
      } else {
        failed += 1;
        outcomes.push({ chargeId: candidate.chargeId, outcome: "failed", reason: "not_delivered" });
      }
    }
  }

  return {
    sent,
    emails,
    failed,
    skipped: reserved.plan.skipped.length,
    remaining: reserved.plan.remaining,
    outcomes,
  };
}
