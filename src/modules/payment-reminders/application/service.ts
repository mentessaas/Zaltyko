import { sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { logger } from "@/lib/logger";
import { loadReminderCandidates } from "@/modules/payment-reminders/application/candidates";
import {
  dispatchReminders,
  previewReminders,
  type DispatchResult,
  type ReminderPreview,
  type ReminderSelection,
} from "@/modules/payment-reminders/application/dispatch";
import { MAX_CHARGES_PER_BATCH } from "@/modules/payment-reminders/application/plan";
import {
  readSettings,
  ReminderValidationError,
  type PaymentReminderSettings,
} from "@/modules/payment-reminders/application/settings";
import { requireReminderRole, visibleLocationIds } from "@/modules/payment-reminders/application/access";
import {
  assertPaymentRemindersAvailable,
  isAutomaticPaymentRemindersFlagEnabled,
} from "@/modules/payment-reminders/application/storage";
import {
  evaluateReminder,
  isOverdue,
  nextEligibleAt,
  type ReminderSkipReason,
} from "@/modules/payment-reminders/domain/reminder-policy";
import {
  maskEmail,
  validateTemplateDraft,
  type TemplateDraft,
} from "@/modules/payment-reminders/domain/reminder-template";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";

const LIST_LIMIT = 300;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReminderListItem {
  chargeId: string;
  locationName: string;
  invoiceReference: string;
  /** Primer día del periodo de servicio, YYYY-MM-DD. */
  servicePeriodStart: string;
  outstandingCents: number;
  currency: string;
  dueAt: string;
  overdue: boolean;
  daysOverdue: number;
  payerFirstName: string | null;
  payerEmailMasked: string | null;
  lastRemindedAt: string | null;
  reminderCount: number;
  nextEligibleAt: string | null;
  canRemind: boolean;
  blockedReason: ReminderSkipReason | null;
}

export interface ReminderOverview {
  settings: PaymentReminderSettings;
  items: ReminderListItem[];
  truncated: boolean;
  overdueCount: number;
  /** Vencidas que recibirían recordatorio ahora mismo. */
  remindableOverdueCount: number;
  maxChargesPerBatch: number;
}

export const selectionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("charges"), chargeIds: z.array(z.guid()).min(1).max(MAX_CHARGES_PER_BATCH) }).strict(),
  z.object({ kind: z.literal("overdue") }).strict(),
]);
export type ManualSelection = z.infer<typeof selectionSchema>;

async function resolveContext(input: { userId: string; organizationId: string; locationId?: string }) {
  await assertPaymentRemindersAvailable(db);
  const scope = await resolveOwnerScope({
    userId: input.userId,
    organizationId: input.organizationId,
    locationId: input.locationId,
  });
  requireReminderRole(scope.member.role);
  const settings = await readSettings(db, scope.organization.id);
  return { scope, settings, locationIds: visibleLocationIds(scope) };
}

/** Lista de cuotas abiertas con su estado de recordatorio, para `/owner/payments`. */
export async function getPaymentReminderOverview(input: {
  userId: string;
  organizationId: string;
  locationId?: string;
  now?: Date;
}): Promise<ReminderOverview> {
  const now = input.now ?? new Date();
  const { scope, settings, locationIds } = await resolveContext(input);
  const candidates = await loadReminderCandidates(db, {
    organizationId: scope.organization.id,
    locationIds,
    limit: LIST_LIMIT,
  });

  const items = candidates.map((candidate): ReminderListItem => {
    const overdue = isOverdue(candidate.dueAt, now);
    const decision = evaluateReminder({
      now,
      dueAt: candidate.dueAt,
      outstandingCents: candidate.outstandingCents,
      hasPayer: candidate.guardianId !== null,
      hasEmail: candidate.payerEmail !== null,
      lastSentAt: candidate.lastSentAt,
      sentCount: candidate.sentCount,
      hasPendingReservation: candidate.hasPendingReservation,
      minIntervalDays: settings.minIntervalDays,
      origin: "manual",
      autoAfterDays: settings.autoAfterDays,
    });
    const next = nextEligibleAt(candidate.lastSentAt, settings.minIntervalDays);
    return {
      chargeId: candidate.chargeId,
      locationName: candidate.locationName,
      invoiceReference: candidate.invoiceReference,
      servicePeriodStart: candidate.servicePeriodStart,
      outstandingCents: candidate.outstandingCents,
      currency: candidate.currency,
      dueAt: candidate.dueAt.toISOString(),
      overdue,
      daysOverdue: overdue ? Math.floor((now.getTime() - candidate.dueAt.getTime()) / DAY_MS) : 0,
      payerFirstName: candidate.payerFirstName,
      payerEmailMasked: candidate.payerEmail ? maskEmail(candidate.payerEmail) : null,
      lastRemindedAt: candidate.lastSentAt ? candidate.lastSentAt.toISOString() : null,
      reminderCount: candidate.sentCount,
      nextEligibleAt: next && next.getTime() > now.getTime() ? next.toISOString() : null,
      canRemind: decision.eligible,
      blockedReason: decision.eligible ? null : decision.reason,
    };
  });

  return {
    settings,
    items,
    truncated: candidates.length >= LIST_LIMIT,
    overdueCount: items.filter((item) => item.overdue).length,
    remindableOverdueCount: items.filter((item) => item.overdue && item.canRemind).length,
    maxChargesPerBatch: MAX_CHARGES_PER_BATCH,
  };
}

function toSelection(selection: ManualSelection): ReminderSelection {
  return selection;
}

export async function previewPaymentReminders(input: {
  userId: string;
  organizationId: string;
  locationId?: string;
  selection: ManualSelection;
  /** Cambios sin guardar de la plantilla, para ver el efecto antes de guardarlos. */
  draft?: TemplateDraft;
}): Promise<ReminderPreview> {
  const { scope, settings, locationIds } = await resolveContext(input);
  if (input.draft) {
    const issues = validateTemplateDraft(input.draft);
    if (issues.length > 0) throw new ReminderValidationError(issues);
  }
  return previewReminders({
    organizationId: scope.organization.id,
    locationIds,
    selection: toSelection(input.selection),
    origin: "manual",
    actor: { userId: input.userId, memberId: scope.member.id },
    settings,
    draft: input.draft,
  });
}

export async function sendPaymentReminders(input: {
  userId: string;
  organizationId: string;
  locationId?: string;
  selection: ManualSelection;
}): Promise<DispatchResult> {
  const { scope, settings, locationIds } = await resolveContext(input);
  return dispatchReminders({
    organizationId: scope.organization.id,
    locationIds,
    selection: toSelection(input.selection),
    origin: "manual",
    actor: { userId: input.userId, memberId: scope.member.id },
    settings,
  });
}

export interface AutomaticRunResult {
  enabled: boolean;
  organizations: number;
  sent: number;
  failed: number;
  /** false si se agotó el tiempo antes de recorrer todas las academias. */
  complete: boolean;
}

const AUTOMATIC_PAGE_SIZE = 200;
/** Margen bajo el límite de 300 s de las rutas cron; lo que falte sigue en la siguiente pasada. */
const AUTOMATIC_DEADLINE_MS = 240_000;

/**
 * Recordatorio automático: solo si hay bandera global, la academia lo activó,
 * tiene correo de respuesta y la cuota lleva `autoAfterDays` días vencida sin
 * haber recibido ningún recordatorio. Apagado por defecto en los dos niveles.
 * Recorre todas las academias con el automático activado, de 200 en 200 por
 * orden de id; si se agota el tiempo marca `complete: false` y la siguiente
 * pasada continúa (las ya avisadas no se repiten).
 */
export async function runAutomaticPaymentReminders(
  now: Date = new Date(),
  options: { deadlineMs?: number; pageSize?: number } = {}
): Promise<AutomaticRunResult> {
  if (!isAutomaticPaymentRemindersFlagEnabled()) {
    return { enabled: false, organizations: 0, sent: 0, failed: 0, complete: true };
  }
  await assertPaymentRemindersAvailable(db);

  const pageSize = options.pageSize ?? AUTOMATIC_PAGE_SIZE;
  const deadline = Date.now() + (options.deadlineMs ?? AUTOMATIC_DEADLINE_MS);
  let sent = 0;
  let failed = 0;
  let processed = 0;
  let cursor: string | null = null;
  let complete = true;

  for (;;) {
    const page = await db.execute(sql`
      select s.organization_id::text as "organizationId"
        from zaltyko.payment_reminder_settings s
        inner join zaltyko.organizations o on o.id = s.organization_id
       where s.is_auto_enabled and o.status in ('trial', 'active')
         and (${cursor}::uuid is null or s.organization_id > ${cursor}::uuid)
       order by s.organization_id
       limit ${pageSize}
    `);
    const rows = page.rows as Array<{ organizationId: string }>;
    for (const row of rows) {
      if (Date.now() > deadline) {
        complete = false;
        break;
      }
      cursor = row.organizationId;
      try {
        const settings = await readSettings(db, row.organizationId);
        // Sin correo de respuesta no se envía nada (las respuestas deben llegar a la academia).
        if (!settings.autoEnabled || !settings.replyToEmail) continue;
        const locations = await db.execute(sql`
          select id::text as id from zaltyko.locations
           where organization_id = ${row.organizationId}::uuid and is_active
        `);
        const locationIds = (locations.rows as Array<{ id: string }>).map((location) => location.id);
        const result = await dispatchReminders({
          organizationId: row.organizationId,
          locationIds,
          selection: { kind: "automatic" },
          origin: "automatic",
          actor: null,
          settings,
          now,
        });
        processed += 1;
        sent += result.sent;
        failed += result.failed;
      } catch (error) {
        // Una academia con problemas no frena a las demás.
        logger.error("Falló el recordatorio automático de una academia", error, {
          organizationId: row.organizationId,
        });
      }
    }
    if (!complete || rows.length < pageSize) break;
    cursor = rows[rows.length - 1]!.organizationId;
  }
  return { enabled: true, organizations: processed, sent, failed, complete };
}
