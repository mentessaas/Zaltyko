import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  authUsers,
  emailLogs,
  onboardingChecklistItems,
  profiles,
  userPreferences,
} from "@/db/schema";
import {
  CHECKLIST_DEFINITIONS,
  CHECKLIST_KEYS,
  type ChecklistKey,
} from "@/lib/onboarding-utils";
import { isAcademyBlockedFromSending } from "@/lib/academy-status";
import {
  buildHttpsUrlInAllowlist,
  buildNextStepUrl,
  getAllowlistedAppOrigin,
  ONBOARDING_OWNER_DONE_KEY,
  type OnboardingOwnerStepKey,
} from "@/lib/email/allowlist";
import { buildSignedEmailLinkUrl } from "@/lib/onboarding/email-link-token";
import { resolveOwnerLocale } from "@/lib/onboarding/template-helpers";
import {
  OnboardingOwnerTemplate,
  getOnboardingOwnerSubject,
  type OnboardingOwnerStep,
} from "@/lib/email/templates/onboarding-owner";
import { sendEmailWithLogging } from "@/lib/email/email-service";
import { isTest } from "@/lib/env";
import { logger } from "@/lib/logger";

export type NextPendingResult =
  | { done: true }
  | { done: false; key: ChecklistKey; label: string; description: string };
export const ONBOARDING_OWNER_THRESHOLDS = {
  d2: { target: 48 * 60 * 60 * 1000, tolerance: 2 * 60 * 60 * 1000 },
  d7: { target: 7 * 24 * 60 * 60 * 1000, tolerance: 6 * 60 * 60 * 1000 },
} as const;

export function buildOnboardingOwnerDedupeKey(
  academyId: string,
  step: OnboardingOwnerStep
): string {
  return `onboarding-owner:${academyId}:${step}`;
}

export async function getNextPending(
  academyId: string
): Promise<NextPendingResult> {
  const rows = await db
    .select({
      key: onboardingChecklistItems.key,
      label: onboardingChecklistItems.label,
      description: onboardingChecklistItems.description,
      status: onboardingChecklistItems.status,
    })
    .from(onboardingChecklistItems)
    .where(eq(onboardingChecklistItems.academyId, academyId))
    .orderBy(asc(onboardingChecklistItems.createdAt));
  // Solo claves conocidas cuentan como pendientes: una fila con key
  // desconocido se salta (no cierra la secuencia por error de datos).
  const row = rows.find(
    (candidate) =>
      candidate.status === "pending" &&
      CHECKLIST_KEYS.includes(candidate.key as ChecklistKey)
  );
  if (!row) return { done: true };
  return {
    done: false,
    key: row.key as ChecklistKey,
    label:
      row.label ||
      CHECKLIST_DEFINITIONS.find((d) => d.key === row.key)?.label ||
      row.key,
    description: row.description ?? "",
  };
}

export function resolveOnboardingOwnerNextStepUrl(
  next: NextPendingResult,
  academyId: string
): { ok: boolean; url?: string | null; reason?: string } {
  if (next.done) {
    // Secuencia completa: email final sin enlace de siguiente paso.
    return { ok: true, url: null };
  }
  return buildNextStepUrl({ stepKey: next.key, academyId });
}

async function readOwnerContext(academyId: string) {
  const [row] = await db
    .select({
      academyId: academies.id,
      tenantId: academies.tenantId,
      academyName: academies.name,
      ownerId: academies.ownerId,
      ownerProfileId: profiles.id,
      ownerFirstName: profiles.name,
      ownerUserId: profiles.userId,
      ownerEmail: authUsers.email,
      ownerLanguage: userPreferences.language,
    })
    .from(academies)
    .innerJoin(profiles, eq(profiles.id, academies.ownerId))
    .innerJoin(authUsers, eq(authUsers.id, profiles.userId))
    .leftJoin(userPreferences, eq(userPreferences.userId, profiles.id))
    .where(eq(academies.id, academyId))
    .limit(1);
  return row ?? null;
}

async function hasUnsubscribed(ownerEmail: string): Promise<boolean> {
  const normalizedEmail = ownerEmail.trim().toLowerCase();
  const [row] = await db
    .select({ id: emailLogs.id })
    .from(emailLogs)
    .where(
      and(
        sql`lower(${emailLogs.toEmail}) = ${normalizedEmail}`,
        eq(emailLogs.template, "unsubscribe_confirmation"),
        eq(emailLogs.status, "sent")
      )
    )
    .orderBy(desc(emailLogs.createdAt))
    .limit(1);
  return Boolean(row);
}

async function writeSkipLog(
  academyId: string,
  ownerEmail: string,
  step: OnboardingOwnerStep,
  dedupeKey: string,
  reason: string
) {
  await db
    .insert(emailLogs)
    .values({
      academyId,
      tenantId: null,
      userId: null,
      toEmail: ownerEmail || "unknown@zaltyko.invalid",
      subject: getOnboardingOwnerSubject(step),
      template: "onboarding-owner",
      status: "skipped",
      idempotencyKey: dedupeKey,
      metadata: { step, reason },
    })
    .onConflictDoNothing();
}

export async function evaluateOnboardingOwnerGate(
  academyId: string,
  step: OnboardingOwnerStep
) {
  const owner = await readOwnerContext(academyId);
  if (!owner?.ownerEmail)
    return { eligible: false, reason: "OWNER_OR_EMAIL_MISSING" as const };
  const semantic = await isAcademyBlockedFromSending(academyId);
  if (semantic.blocked)
    return {
      eligible: false,
      reason: `ACADEMY_${semantic.reason?.toUpperCase() ?? "BLOCKED"}`,
      owner,
    };
  if (await hasUnsubscribed(owner.ownerEmail))
    return { eligible: false, reason: "OWNER_UNSUBSCRIBED", owner };
  const next = await getNextPending(academyId);
  const url = resolveOnboardingOwnerNextStepUrl(next, academyId);
  if (!url.ok)
    return {
      eligible: false,
      reason: `NEXT_STEP_URL_INVALID:${url.reason}`,
      owner,
    };
  return { eligible: true, owner, next, step };
}

export interface SendOnboardingOwnerStepResult {
  outcome: "sent" | "skipped" | "disabled" | "test_mode";
  reason?: string;
  dedupeKey: string;
  nextStepKey?: OnboardingOwnerStepKey;
}

export async function sendOnboardingOwnerStep({
  academyId,
  step,
  now = new Date(),
  force = false,
}: {
  academyId: string;
  step: OnboardingOwnerStep;
  now?: Date;
  force?: boolean;
}): Promise<SendOnboardingOwnerStepResult> {
  const dedupeKey = buildOnboardingOwnerDedupeKey(academyId, step);
  if (!force && process.env.ONBOARDING_OWNER_SEQUENCE_ENABLED !== "true")
    return {
      outcome: "disabled",
      reason: "SEQUENCE_DISABLED_BY_ENV",
      dedupeKey,
    };
  if (!force && isTest())
    return { outcome: "test_mode", reason: "TEST_ENV", dedupeKey };
  const gate = await evaluateOnboardingOwnerGate(academyId, step);
  if (!gate.eligible || !gate.owner) {
    await writeSkipLog(
      academyId,
      gate.owner?.ownerEmail ?? "",
      step,
      dedupeKey,
      gate.reason ?? "NOT_ELIGIBLE"
    );
    return { outcome: "skipped", reason: gate.reason, dedupeKey };
  }
  // Estrechar ownerEmail (authUsers.email es nullable): el gate valida
  // elegibilidad pero TS no propaga el estrechamiento hasta aqui.
  const ownerEmail = gate.owner.ownerEmail;
  if (!ownerEmail) {
    await writeSkipLog(academyId, "", step, dedupeKey, "OWNER_EMAIL_MISSING");
    return { outcome: "skipped", reason: "OWNER_EMAIL_MISSING", dedupeKey };
  }
  const next = gate.next ?? (await getNextPending(academyId));
  const stepKey = next.done ? ONBOARDING_OWNER_DONE_KEY : next.key;
  const nextUrl = resolveOnboardingOwnerNextStepUrl(next, academyId);
  if (!nextUrl.ok)
    return {
      outcome: "skipped",
      reason: `NEXT_STEP_URL_INVALID:${nextUrl.reason}`,
      dedupeKey,
    };
  try {
    const appUrl = getAllowlistedAppOrigin();
    if (!appUrl) {
      return {
        outcome: "skipped",
        reason: "APP_URL_INVALID",
        dedupeKey,
      };
    }
    const preferences = buildSignedEmailLinkUrl({
      email: ownerEmail,
      purpose: "preferences",
      appUrl,
      path: "/preferences",
      nowMs: now.getTime(),
    }).url;
    const unsubscribe = buildSignedEmailLinkUrl({
      email: ownerEmail,
      purpose: "unsubscribe",
      appUrl,
      path: "/unsubscribe",
      nowMs: now.getTime(),
    }).url;
    const html = OnboardingOwnerTemplate({
      step,
      locale: resolveOwnerLocale(gate.owner.ownerLanguage),
      ownerFirstName: gate.owner.ownerFirstName ?? "",
      academyName: gate.owner.academyName,
      nextStepLabel: next.done ? "" : next.label,
      nextStepUrl: next.done || !nextUrl.url ? null : nextUrl.url,
      preferencesUrl:
        buildHttpsUrlInAllowlist(
          new URL(preferences).pathname + new URL(preferences).search
        ) ?? preferences,
      unsubscribeUrl:
        buildHttpsUrlInAllowlist(
          new URL(unsubscribe).pathname + new URL(unsubscribe).search
        ) ?? unsubscribe,
    });
    const sent = await sendEmailWithLogging({
      to: ownerEmail,
      subject: getOnboardingOwnerSubject(step, gate.owner.ownerLanguage),
      html,
      template: "onboarding-owner",
      academyId,
      tenantId: gate.owner.tenantId,
      userId: gate.owner.ownerProfileId,
      dedupeKey,
      metadata: {
        step,
        stepKey,
        nextStepUrl: nextUrl.url,
        locale: resolveOwnerLocale(gate.owner.ownerLanguage),
        sentAt: now.toISOString(),
      },
    });
    return sent
      ? { outcome: "sent", dedupeKey, nextStepKey: stepKey }
      : { outcome: "skipped", reason: "DUPLICATE_OR_GATE_REJECTED", dedupeKey };
  } catch (error) {
    logger.error(`onboarding-owner ${step} failed closed`, error, {
      academyId,
      dedupeKey,
    });
    return { outcome: "skipped", reason: "DELIVERY_NOT_CONFIGURED", dedupeKey };
  }
}

export function enqueueOnboardingOwnerD0(args: {
  academyId: string;
  now?: Date;
  force?: boolean;
}) {
  return sendOnboardingOwnerStep({ ...args, step: "d0" });
}

export async function processOnboardingOwnerStep(step: "d2" | "d7") {
  if (process.env.ONBOARDING_OWNER_SEQUENCE_ENABLED !== "true")
    return { scanned: 0, sent: 0, skipped: 0, disabled: true };
  const now = new Date();
  const { target, tolerance } = ONBOARDING_OWNER_THRESHOLDS[step];
  const candidates = await db
    .select({ id: academies.id })
    .from(academies)
    .where(
      and(
        gte(academies.createdAt, new Date(now.getTime() - target - tolerance)),
        lte(academies.createdAt, new Date(now.getTime() - target + tolerance))
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
    if (result.outcome === "skipped") skipped += 1;
  }
  return { scanned: candidates.length, sent, skipped, disabled: false };
}

export const processOnboardingOwnerD2 = () => processOnboardingOwnerStep("d2");
export const processOnboardingOwnerD7 = () => processOnboardingOwnerStep("d7");
