import { sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { type DatabaseClient, withTransaction } from "@/lib/db-transactions";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import {
  AUTO_AFTER_DAYS_RANGE,
  DEFAULT_AUTO_AFTER_DAYS,
  DEFAULT_MIN_INTERVAL_DAYS,
  MIN_INTERVAL_DAYS_RANGE,
} from "@/modules/payment-reminders/domain/reminder-policy";
import {
  BODY_MAX_LENGTH,
  PAYMENT_INSTRUCTIONS_MAX_LENGTH,
  SUBJECT_MAX_LENGTH,
  type TemplateIssue,
  normalizeTemplateDraft,
  validateTemplateDraft,
} from "@/modules/payment-reminders/domain/reminder-template";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { appendAuditEntry } from "@/modules/shared/infrastructure/transactional-records";

import { requireReminderRole } from "./access";
import { assertPaymentRemindersAvailable } from "./storage";

export interface PaymentReminderSettings {
  subjectTemplate: string | null;
  bodyTemplate: string | null;
  paymentInstructions: string | null;
  replyToEmail: string | null;
  minIntervalDays: number;
  autoEnabled: boolean;
  autoAfterDays: number;
  version: number;
  /** true si la academia aún no ha guardado nada: se usan los valores por defecto. */
  isDefault: boolean;
}

export const DEFAULT_SETTINGS: PaymentReminderSettings = {
  subjectTemplate: null,
  bodyTemplate: null,
  paymentInstructions: null,
  replyToEmail: null,
  minIntervalDays: DEFAULT_MIN_INTERVAL_DAYS,
  autoEnabled: false,
  autoAfterDays: DEFAULT_AUTO_AFTER_DAYS,
  version: 0,
  isDefault: true,
};

/** Error de validación con mensajes por campo (el borde HTTP lo devuelve como 422). */
export class ReminderValidationError extends Error {
  constructor(public readonly issues: TemplateIssue[]) {
    super("La plantilla del recordatorio no es válida");
    this.name = "ReminderValidationError";
  }
}

export const settingsInputSchema = z
  .object({
    subjectTemplate: z.string().max(SUBJECT_MAX_LENGTH * 2).nullable().optional(),
    bodyTemplate: z.string().max(BODY_MAX_LENGTH * 2).nullable().optional(),
    paymentInstructions: z.string().max(PAYMENT_INSTRUCTIONS_MAX_LENGTH * 2).nullable().optional(),
    replyToEmail: z.string().trim().max(254).email().nullable().optional().or(z.literal("")),
    minIntervalDays: z.number().int().min(MIN_INTERVAL_DAYS_RANGE.min).max(MIN_INTERVAL_DAYS_RANGE.max),
    autoEnabled: z.boolean(),
    autoAfterDays: z.number().int().min(AUTO_AFTER_DAYS_RANGE.min).max(AUTO_AFTER_DAYS_RANGE.max),
  })
  .strict();
export type PaymentReminderSettingsInput = z.infer<typeof settingsInputSchema>;

interface SettingsRow {
  subject_template: string | null;
  body_template: string | null;
  payment_instructions: string | null;
  reply_to_email: string | null;
  min_interval_days: number | string;
  is_auto_enabled: boolean;
  auto_after_days: number | string;
  version: number | string;
}

export async function readSettings(client: DatabaseClient, organizationId: string): Promise<PaymentReminderSettings> {
  const result = await client.execute(sql`
    select subject_template, body_template, payment_instructions, reply_to_email,
           min_interval_days, is_auto_enabled, auto_after_days, version
      from zaltyko.payment_reminder_settings
     where organization_id = ${organizationId}::uuid
  `);
  const row = result.rows[0] as SettingsRow | undefined;
  if (!row) return { ...DEFAULT_SETTINGS };
  return {
    subjectTemplate: row.subject_template,
    bodyTemplate: row.body_template,
    paymentInstructions: row.payment_instructions,
    replyToEmail: row.reply_to_email,
    minIntervalDays: Number(row.min_interval_days),
    autoEnabled: row.is_auto_enabled,
    autoAfterDays: Number(row.auto_after_days),
    version: Number(row.version),
    isDefault: false,
  };
}

export async function getPaymentReminderSettings(input: {
  userId: string;
  organizationId: string;
}): Promise<PaymentReminderSettings> {
  await assertPaymentRemindersAvailable(db);
  const scope = await resolveOwnerScope({ userId: input.userId, organizationId: input.organizationId });
  requireReminderRole(scope.member.role);
  return readSettings(db, scope.organization.id);
}

export async function updatePaymentReminderSettings(input: {
  userId: string;
  organizationId: string;
  settings: PaymentReminderSettingsInput;
}): Promise<PaymentReminderSettings> {
  await assertPaymentRemindersAvailable(db);
  const scope = await resolveOwnerScope({ userId: input.userId, organizationId: input.organizationId });
  requireReminderRole(scope.member.role);
  // La plantilla y los límites son de toda la academia, no de una sede.
  if (!scope.canViewOrganizationAggregate) {
    throw new OperationalError(
      "LOCATION_SCOPE_DENIED",
      "Cambiar la plantilla de recordatorios requiere acceso a todas las sedes de la academia",
      403
    );
  }

  const template = normalizeTemplateDraft({
    subject: input.settings.subjectTemplate,
    body: input.settings.bodyTemplate,
    paymentInstructions: input.settings.paymentInstructions,
  });
  const issues = validateTemplateDraft(template);
  if (issues.length > 0) throw new ReminderValidationError(issues);
  const replyTo = input.settings.replyToEmail ? input.settings.replyToEmail.trim().toLowerCase() : null;

  await withTransaction(async (tx) => {
    await tx.execute(sql`
      insert into zaltyko.payment_reminder_settings (
        organization_id, subject_template, body_template, payment_instructions, reply_to_email,
        min_interval_days, is_auto_enabled, auto_after_days, updated_by_member_id
      ) values (
        ${scope.organization.id}::uuid, ${template.subject}, ${template.body}, ${template.paymentInstructions}, ${replyTo},
        ${input.settings.minIntervalDays}, ${input.settings.autoEnabled}, ${input.settings.autoAfterDays}, ${scope.member.id}::uuid
      )
      on conflict (organization_id) do update set
        subject_template = excluded.subject_template,
        body_template = excluded.body_template,
        payment_instructions = excluded.payment_instructions,
        reply_to_email = excluded.reply_to_email,
        min_interval_days = excluded.min_interval_days,
        is_auto_enabled = excluded.is_auto_enabled,
        auto_after_days = excluded.auto_after_days,
        updated_by_member_id = excluded.updated_by_member_id,
        version = zaltyko.payment_reminder_settings.version + 1,
        updated_at = now()
    `);
    // Solo se audita qué cambió de configuración, nunca el texto de la plantilla.
    await appendAuditEntry(tx, {
      organizationId: scope.organization.id,
      locationId: null,
      actorUserId: input.userId,
      action: "payment_reminder_settings.updated",
      targetType: "payment_reminder_settings",
      targetId: scope.organization.id,
      idempotencyKey: `payment-reminder-settings:${scope.organization.id}:${Date.now()}:${scope.member.id}`,
      after: {
        minIntervalDays: input.settings.minIntervalDays,
        autoEnabled: input.settings.autoEnabled,
        autoAfterDays: input.settings.autoAfterDays,
        customSubject: template.subject !== null,
        customBody: template.body !== null,
        hasPaymentInstructions: template.paymentInstructions !== null,
        hasReplyTo: replyTo !== null,
      },
    });
  });
  return readSettings(db, scope.organization.id);
}
