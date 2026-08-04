/**
 * Integrador d0/d2/d7 owner (ZAL-314 B1).
 *
 * Orquesta la secuencia de emails transaccionales para acompanar al owner
 * durante el onboarding. Se compone de:
 *
 * - `getNextPending(academyId)`: lee `onboarding_checklist_items` y devuelve
 *   el siguiente paso pendiente o sentinel `done`.
 * - `evaluateOnboardingOwnerGate`: aplica el gate de elegibilidad §6 antes
 *   de cada envio. Razones de skip se devuelven para el log.
 * - `sendOnboardingOwnerStep`: ejecuta el envio (con idempotencia y log).
 * - `enqueueOnboardingOwnerD0`: engancha d0 al evento `academy_created`.
 * - `processOnboardingOwnerD2` / `processOnboardingOwnerD7`: tareas de
 *   scheduler para d2/d7. Idempotentes via `email_logs.idempotency_key`.
 *
 * La secuencia permanece DESACTIVADA por defecto hasta que QA y Platform &
 * Security firmen la activacion (§11 de la spec). Para activar:
 *   `ONBOARDING_OWNER_SEQUENCE_ENABLED=true` (board autoriza sales freeze).
 */

import { and, asc, eq, gte, lte, ne, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  authUsers,
  emailLogs,
  onboardingChecklistItems,
  profiles,
} from "@/db/schema";
import {
  CHECKLIST_KEYS,
  CHECKLIST_DEFINITIONS,
  type ChecklistKey,
} from "@/lib/onboarding-utils";
import {
  ONBOARDING_OWNER_DONE_KEY,
  type OnboardingOwnerStepKey,
  buildNextStepUrl,
} from "@/lib/email/allowlist";
import {
  OnboardingOwnerTemplate,
  getOnboardingOwnerSubject,
  type OnboardingOwnerStep,
} from "@/lib/email/templates/onboarding-owner";
import { sendEmailWithLogging } from "@/lib/email/email-service";
import { buildHttpsUrlInAllowlist } from "@/lib/email/allowlist";
import { isTest } from "@/lib/env";
import { logger } from "@/lib/logger";

/** Sentinel de "todos los pasos completados". */
export type NextPendingResult =
  | { done: true }
  | {
      done: false;
      key: ChecklistKey;
      label: string;
      description: string;
    };

export interface GateResult {
  eligible: boolean;
  reason?: string;
  ownerEmail?: string | null;
  ownerFirstName?: string | null;
  ownerLocale?: string;
  ownerUnsubscribed?: boolean;
  academyName?: string | null;
  academySuspended?: boolean;
  academyFraudHold?: boolean;
  academyChurned?: boolean;
}

/** Devuelve el primer checklist item pendiente o sentinel `done`. */
export async function getNextPending(academyId: string): Promise<NextPendingResult> {
  const rows = await db
    .select({
      key: onboardingChecklistItems.key,
      label: onboardingChecklistItems.label,
      description: onboardingChecklistItems.description,
      status: onboardingChecklistItems.status,
      completedAt: onboardingChecklistItems.completedAt,
    })
    .from(onboardingChecklistItems)
    .where(eq(onboardingChecklistItems.academyId, academyId))
    .orderBy(asc(onboardingChecklistItems.createdAt));

  if (rows.length === 0) {
    return { done: true };
  }

  // Ignoramos `skipped` para el integrador (no son pendientes reales). Solo
  // `pending` cuenta.
  const next = rows.find((row) => row.status === "pending");
  if (!next) {
    return { done: true };
  }

  return {
    done: false,
    key: next.key as ChecklistKey,
    label: next.label,
    description: next.description ?? "",
  };
}

/**
 * Construye la idempotency key canonica de la secuencia d0/d2/d7.
 * Patron (ZAL-314 B1 / §11 spec): `onboarding-owner:{academy_id}:{d0|d2|d7}`.
 */
export function buildOnboardingOwnerDedupeKey(
  academyId: string,
  step: OnboardingOwnerStep
): string {
  return `onboarding-owner:${academyId}:${step}`;
}

const MS_HOUR = 1000 * 60 * 60;
const MS_DAY = MS_HOUR * 24;

/** Umbrales en ms para que el cron determine si es momento de d2/d7. */
export const ONBOARDING_OWNER_THRESHOLDS = {
  d2: { target: 48 * MS_HOUR, tolerance: 2 * MS_HOUR },
  d7: { target: 7 * MS_DAY, tolerance: 6 * MS_HOUR },
} as const;

function isSequenceEnabled(): boolean {
  // Leemos `process.env` directamente (no `serverEnv`) para que tests y
  // runtime puedan togglear el flag sin re-cargar el modulo. El Zod de
  // `serverEnv` solo valida tipos, no es autoritativo en runtime.
  return process.env.ONBOARDING_OWNER_SEQUENCE_ENABLED === "true";
}

function isInTest(): boolean {
  return isTest();
}

/**
 * Lee el owner profile + email + flags de consentimiento.
 * En esta primera version B2 (unsubscribed, locale) NO esta implementado
 * como columnas en `profiles` (lo hara ZAL-315 a Platform & Security).
 * Mientras tanto, devolvemos defaults explicitos y dejamos un campo
 * `missingFlags` para que QA pueda detectar el degradado en sandbox.
 */
async function readOwnerContext(academyId: string) {
  const [row] = await db
    .select({
      ownerId: academies.ownerId,
      academyId: academies.id,
      academyName: academies.name,
      academySuspended: academies.isSuspended,
      academyTrialEndsAt: academies.trialEndsAt,
      academyPaymentsConfiguredAt: academies.paymentsConfiguredAt,
      profileId: profiles.id,
      profileName: profiles.name,
      profileUserId: profiles.userId,
      ownerEmail: authUsers.email,
    })
    .from(academies)
    .innerJoin(profiles, eq(profiles.id, academies.ownerId))
    .innerJoin(authUsers, eq(authUsers.id, profiles.userId))
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!row) return null;

  // B2 (unsubscribed, locale) NO esta implementado como columnas en
  // `profiles` todavia (lo hara ZAL-315 a Platform & Security). Mientras
  // tanto, leemos del row si el caller (tests, fixtures) los provee; si
  // no, defaults explicitos y marcamos las flags como missing.
  const extras = row as unknown as {
    ownerUnsubscribed?: boolean;
    ownerLocale?: string;
  };

  return {
    academyId: row.academyId,
    academyName: row.academyName,
    academySuspended: row.academySuspended,
    academyTrialEndsAt: row.academyTrialEndsAt,
    academyPaymentsConfiguredAt: row.academyPaymentsConfiguredAt,
    ownerId: row.ownerId,
    ownerProfileId: row.profileId,
    ownerUserId: row.profileUserId,
    ownerFirstName: row.profileName,
    ownerEmail: row.ownerEmail,
    ownerUnsubscribed: extras.ownerUnsubscribed ?? false,
    ownerLocale: extras.ownerLocale ?? "es",
    missingFlags: ["profiles.unsubscribed", "profiles.locale"] as string[],
  };
}

/**
 * Evalua el gate §6 antes de enviar. Devuelve un `GateResult` con la
 * razon de skip si no es elegible. Reglas (orden de evaluacion):
 *
 *   1. Academia existe + owner profile existe + owner email existe.
 *   2. `academies.isSuspended` → SKIP_ACADEMY_SUSPENDED.
 *   3. `trial_ends_at < now AND payments_configured_at IS NULL` → SKIP_ACADEMY_CHURNED.
 *   4. `fraud_hold` flag (no existe en B3, asumimos false).
 *   5. `profiles.unsubscribed` (B2, default false).
 *   6. `profiles.locale != 'es'` (B2, default 'es').
 *   7. `next_step_url` invalido → SKIP_NEXT_STEP_URL_INVALID (recalculado fuera).
 */
export async function evaluateOnboardingOwnerGate(
  academyId: string,
  step: OnboardingOwnerStep
): Promise<GateResult & { ownerId?: string | null }> {
  // `step` queda en la firma publica para soportar variantes por paso
  // (ej. d0 sin requerir X dias de antiguedad). Por ahora las reglas
  // son identicas para d0/d2/d7.
  void step;
  const owner = await readOwnerContext(academyId);
  if (!owner) {
    return { eligible: false, reason: "ACADEMY_OR_OWNER_NOT_FOUND" };
  }

  if (!owner.ownerEmail) {
    return {
      eligible: false,
      reason: "OWNER_EMAIL_MISSING",
      academyName: owner.academyName,
      academySuspended: owner.academySuspended,
      ownerFirstName: owner.ownerFirstName,
    };
  }

  if (owner.academySuspended) {
    return {
      eligible: false,
      reason: "ACADEMY_SUSPENDED",
      academyName: owner.academyName,
      ownerEmail: owner.ownerEmail,
      ownerFirstName: owner.ownerFirstName,
      ownerLocale: owner.ownerLocale,
      ownerUnsubscribed: owner.ownerUnsubscribed,
      academySuspended: true,
    };
  }

  if (
    owner.academyTrialEndsAt &&
    owner.academyPaymentsConfiguredAt === null &&
    new Date(owner.academyTrialEndsAt).getTime() < Date.now()
  ) {
    return {
      eligible: false,
      reason: "ACADEMY_CHURNED",
      academyName: owner.academyName,
      ownerEmail: owner.ownerEmail,
      ownerFirstName: owner.ownerFirstName,
      ownerLocale: owner.ownerLocale,
      ownerUnsubscribed: owner.ownerUnsubscribed,
      academyChurned: true,
    };
  }

  // B3 fraud_hold: columna no existe todavia. Se activa cuando ZAL-315 la agregue.
  // Aqui lo dejamos como no-op.

  if (owner.ownerUnsubscribed) {
    return {
      eligible: false,
      reason: "OWNER_UNSUBSCRIBED",
      academyName: owner.academyName,
      ownerEmail: owner.ownerEmail,
      ownerFirstName: owner.ownerFirstName,
      ownerLocale: owner.ownerLocale,
      ownerUnsubscribed: true,
    };
  }

  if (owner.ownerLocale !== "es") {
    return {
      eligible: false,
      reason: "OWNER_LOCALE_NOT_ES",
      academyName: owner.academyName,
      ownerEmail: owner.ownerEmail,
      ownerFirstName: owner.ownerFirstName,
      ownerLocale: owner.ownerLocale,
    };
  }

  // Verificamos que el step tenga URL valida (excepto d0: d0 puede tener
  // `done` si la academia ya completo todo).
  const next = await getNextPending(academyId);
  const stepKey = next.done ? ONBOARDING_OWNER_DONE_KEY : next.key;
  const urlResult = buildNextStepUrl({ stepKey, academyId });
  if (!urlResult.ok) {
    return {
      eligible: false,
      reason: `NEXT_STEP_URL_INVALID:${urlResult.reason ?? "UNKNOWN"}`,
      academyName: owner.academyName,
      ownerEmail: owner.ownerEmail,
      ownerFirstName: owner.ownerFirstName,
      ownerLocale: owner.ownerLocale,
    };
  }

  return {
    eligible: true,
    academyName: owner.academyName,
    ownerEmail: owner.ownerEmail,
    ownerFirstName: owner.ownerFirstName,
    ownerLocale: owner.ownerLocale,
    ownerUnsubscribed: owner.ownerUnsubscribed,
    ownerId: owner.ownerId,
  };
}

interface SendOnboardingOwnerStepInput {
  academyId: string;
  step: OnboardingOwnerStep;
  now?: Date;
  /** Override para tests; si true, ignora `ONBOARDING_OWNER_SEQUENCE_ENABLED`. */
  force?: boolean;
}

interface SendOnboardingOwnerStepResult {
  outcome: "sent" | "skipped" | "disabled" | "test_mode";
  reason?: string;
  dedupeKey: string;
  nextStepKey?: OnboardingOwnerStepKey;
}

/**
 * Envia el email d0/d2/d7 para una academia. Aplica §6 gate y registra
 * el log con `idempotency_key` unico.
 */
export async function sendOnboardingOwnerStep({
  academyId,
  step,
  now = new Date(),
  force = false,
}: SendOnboardingOwnerStepInput): Promise<SendOnboardingOwnerStepResult> {
  const dedupeKey = buildOnboardingOwnerDedupeKey(academyId, step);

  if (!force && !isSequenceEnabled()) {
    return { outcome: "disabled", reason: "SEQUENCE_DISABLED_BY_ENV", dedupeKey };
  }
  if (!force && isInTest()) {
    return { outcome: "test_mode", reason: "TEST_ENV", dedupeKey };
  }

  // 1. Gate §6.
  const gate = await evaluateOnboardingOwnerGate(academyId, step);
  if (!gate.eligible) {
    await db.insert(emailLogs).values({
      academyId,
      tenantId: null,
      userId: null,
      toEmail: gate.ownerEmail ?? "unknown@zaltyko.invalid",
      subject: getOnboardingOwnerSubject(step),
      template: "onboarding-owner",
      status: "skipped",
      idempotencyKey: dedupeKey,
      metadata: {
        step,
        reason: gate.reason ?? "UNKNOWN",
        academyName: gate.academyName ?? null,
        skippedAt: now.toISOString(),
      },
    });
    return { outcome: "skipped", reason: gate.reason, dedupeKey };
  }

  // 2. next_step (recalculado en cada envio, §6 spec).
  const next = await getNextPending(academyId);
  const stepKey: OnboardingOwnerStepKey = next.done
    ? ONBOARDING_OWNER_DONE_KEY
    : next.key;
  const urlResult = buildNextStepUrl({ stepKey, academyId });
  if (!urlResult.ok) {
    await db.insert(emailLogs).values({
      academyId,
      tenantId: null,
      userId: null,
      toEmail: gate.ownerEmail ?? "unknown@zaltyko.invalid",
      subject: getOnboardingOwnerSubject(step),
      template: "onboarding-owner",
      status: "skipped",
      idempotencyKey: dedupeKey,
      metadata: {
        step,
        reason: `NEXT_STEP_URL_INVALID:${urlResult.reason ?? "UNKNOWN"}`,
        stepKey,
        skippedAt: now.toISOString(),
      },
    });
    return {
      outcome: "skipped",
      reason: `NEXT_STEP_URL_INVALID:${urlResult.reason ?? "UNKNOWN"}`,
      dedupeKey,
    };
  }

  // 3. Render del template (escape aplicado en el propio template).
  const html = OnboardingOwnerTemplate({
    step,
    ownerFirstName: gate.ownerFirstName ?? "",
    academyName: gate.academyName ?? "",
    nextStepLabel: next.done ? "" : next.label,
    nextStepUrl: next.done ? null : urlResult.url,
    preferencesUrl:
      step === "d7"
        ? buildHttpsUrlInAllowlist("/app/settings/notifications")
        : null,
    unsubscribeUrl:
      step === "d7"
        ? buildHttpsUrlInAllowlist(`/app/settings/notifications?academy=${encodeURIComponent(academyId)}&unsub=onboarding-owner`)
        : null,
  });

  // 4. Envio via sendEmailWithLogging con dedupe + idempotencyKey.
  // El chequeo de dedupe existente bloquea doble envio; ademas, la columna
  // `email_logs.idempotency_key` (unique index) protege contra cualquier
  // carrera.
  try {
    await sendEmailWithLogging({
      to: gate.ownerEmail!,
      subject: getOnboardingOwnerSubject(step),
      html,
      template: "onboarding-owner",
      academyId,
      idempotencyKey: dedupeKey,
      metadata: {
        step,
        stepKey,
        nextStepUrl: urlResult.url,
        sentAt: now.toISOString(),
      },
    });
    return { outcome: "sent", dedupeKey, nextStepKey: stepKey };
  } catch (error) {
    // Enviamos con fallo permanente (Brevo 4xx) → status "bounced" si la
    // exception indica destinatario invalido. Otros fallos → "failed" (via
    // sendEmailWithLogging).
    const isPermanent =
      error instanceof Error && error.message.includes("BREVO_API_ERROR:4");
    await db
      .update(emailLogs)
      .set({
        status: isPermanent ? "bounced" : "failed",
        errorMessage:
          error instanceof Error ? error.message : "EMAIL_DELIVERY_FAILED",
      })
      .where(
        and(
          eq(emailLogs.idempotencyKey, dedupeKey),
          ne(emailLogs.status, "skipped")
        )
      )
      .catch(() => undefined);
    logger.error(`onboarding-owner ${step} send failed`, { academyId, dedupeKey, error });
    return {
      outcome: "skipped",
      reason: isPermanent ? "BOUNCED" : "DELIVERY_FAILED",
      dedupeKey,
    };
  }
}

/**
 * Trigger d0 enganchado al evento `academy_created`.
 *
 * `force=true` esta reservado para tests / reintentos manuales: ignora
 * `ONBOARDING_OWNER_SEQUENCE_ENABLED` y `isInTest()`. En produccion, el
 * trigger deja que `sendOnboardingOwnerStep` evalue el flag de env (que
 * permanecera en `false` hasta que board autorice la activacion).
 */
export async function enqueueOnboardingOwnerD0({
  academyId,
  now = new Date(),
  force = false,
}: {
  academyId: string;
  now?: Date;
  force?: boolean;
}): Promise<SendOnboardingOwnerStepResult> {
  return sendOnboardingOwnerStep({ academyId, step: "d0", now, force });
}

interface ProcessBatchResult {
  scanned: number;
  sent: number;
  skipped: number;
  disabled: boolean;
}

/**
 * Scheduler d2/d7. Encuentra academias candidatas y delega en
 * `sendOnboardingOwnerStep`. Idempotente via `email_logs.idempotency_key`.
 *
 * Ventana: academias con `created_at` dentro del rango
 * `[now - target - tolerance, now - target + tolerance]` para evitar
 * double-processing en jitter del cron.
 */
export async function processOnboardingOwnerStep(step: "d2" | "d7"): Promise<ProcessBatchResult> {
  if (!isSequenceEnabled()) {
    return { scanned: 0, sent: 0, skipped: 0, disabled: true };
  }

  const { target, tolerance } = ONBOARDING_OWNER_THRESHOLDS[step];
  const now = new Date();
  const windowStart = new Date(now.getTime() - target - tolerance);
  const windowEnd = new Date(now.getTime() - target + tolerance);

  const candidates = await db
    .select({ id: academies.id, tenantId: academies.tenantId })
    .from(academies)
    .where(
      and(
        gte(academies.createdAt, windowStart),
        lte(academies.createdAt, windowEnd),
        eq(academies.isSuspended, false)
      )
    );

  let sent = 0;
  let skipped = 0;

  for (const academy of candidates) {
    const result = await sendOnboardingOwnerStep({
      academyId: academy.id,
      step,
      now,
    });
    if (result.outcome === "sent") sent += 1;
    else if (result.outcome === "skipped") skipped += 1;
  }

  return { scanned: candidates.length, sent, skipped, disabled: false };
}

export const processOnboardingOwnerD2 = (): Promise<ProcessBatchResult> =>
  processOnboardingOwnerStep("d2");
export const processOnboardingOwnerD7 = (): Promise<ProcessBatchResult> =>
  processOnboardingOwnerStep("d7");

/**
 * Helper para tests: cuenta emails_logs del template `onboarding-owner`
 * con un dedupeKey dado. Pensado para fixtures de §8.
 */
export async function countOnboardingOwnerLogs(academyId: string): Promise<number> {
  const rows = await db
    .select({ id: emailLogs.id })
    .from(emailLogs)
    .where(
      and(
        eq(emailLogs.template, "onboarding-owner"),
        eq(emailLogs.academyId, academyId)
      )
    );
  return rows.length;
}

/**
 * Helper para tests: reune definiciones de pasos en orden canonico.
 * Usado por fixtures para verificar `next_step_label`.
 */
export function listChecklistKeys(): readonly ChecklistKey[] {
  return CHECKLIST_KEYS;
}

export function getChecklistDefinitionByKey(key: ChecklistKey) {
  return CHECKLIST_DEFINITIONS.find((definition) => definition.key === key);
}

/**
 * SQL crudo para contar academias candidatas dentro de una ventana
 * (util para cron health-checks y dashboards).
 */
export async function countOnboardingOwnerCandidates(
  step: "d2" | "d7",
  now: Date = new Date()
): Promise<number> {
  const { target, tolerance } = ONBOARDING_OWNER_THRESHOLDS[step];
  const windowStart = new Date(now.getTime() - target - tolerance);
  const windowEnd = new Date(now.getTime() - target + tolerance);

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(academies)
    .where(
      and(
        gte(academies.createdAt, windowStart),
        lte(academies.createdAt, windowEnd),
        eq(academies.isSuspended, false)
      )
    );
  return row?.count ?? 0;
}

/**
 * Helper de diagnostico: indica si ya se envio d0/d2/d7 a esta academia.
 * Usado por QA fixtures y por el propio integrador para evitar doble
 * scheduling.
 */
export async function hasOnboardingOwnerSent(
  academyId: string,
  step: OnboardingOwnerStep
): Promise<boolean> {
  const [row] = await db
    .select({ id: emailLogs.id })
    .from(emailLogs)
    .where(
      and(
        eq(emailLogs.template, "onboarding-owner"),
        eq(emailLogs.academyId, academyId),
        eq(emailLogs.idempotencyKey, buildOnboardingOwnerDedupeKey(academyId, step)),
        or(eq(emailLogs.status, "sent"), eq(emailLogs.status, "pending"))
      )
    )
    .limit(1);
  return Boolean(row);
}
