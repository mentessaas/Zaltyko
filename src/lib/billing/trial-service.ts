import { and, desc, eq, gt, isNull, lte, or } from "drizzle-orm";

import { db } from "@/db";
import { academies, academyTrials, plans, profiles, subscriptions } from "@/db/schema";
import { sendEmail } from "@/lib/brevo";
import { recordGrowthEvent } from "@/lib/growth/events";
import { logger } from "@/lib/logger";
import { createNotification } from "@/lib/notifications/notification-service";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  addTrialDays,
  evaluateTrialPolicy,
  TRIAL_COOLDOWN_DAYS,
  TRIAL_DURATION_DAYS,
  type TrialEligibilityReason,
} from "@/lib/billing/trial-policy";
import { hasSubscriptionAccess } from "@/lib/billing/subscription-status";

export { TRIAL_COOLDOWN_DAYS, TRIAL_DURATION_DAYS } from "@/lib/billing/trial-policy";
type TransactionClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface AcademyTrialStatus {
  eligible: boolean;
  reason: TrialEligibilityReason;
  active: boolean;
  trialId: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  nextEligibleAt: Date | null;
  grantedPlanCode: "pro" | null;
}

async function getAcademyBillingState(academyId: string) {
  const [academy] = await db
    .select({
      id: academies.id,
      tenantId: academies.tenantId,
      name: academies.name,
      ownerUserId: profiles.userId,
      planCode: plans.code,
      subscriptionStatus: subscriptions.status,
    })
    .from(academies)
    .innerJoin(profiles, eq(academies.ownerId, profiles.id))
    .leftJoin(subscriptions, eq(subscriptions.userId, profiles.userId))
    .leftJoin(plans, eq(subscriptions.planId, plans.id))
    .where(eq(academies.id, academyId))
    .limit(1);

  return academy ?? null;
}

export async function getAcademyTrialStatus(
  academyId: string,
  now = new Date()
): Promise<AcademyTrialStatus> {
  const academy = await getAcademyBillingState(academyId);
  if (!academy) {
    return {
      eligible: false,
      reason: "academy_not_found",
      active: false,
      trialId: null,
      startsAt: null,
      endsAt: null,
      nextEligibleAt: null,
      grantedPlanCode: null,
    };
  }

  const [activeTrial] = await db
    .select()
    .from(academyTrials)
    .where(and(eq(academyTrials.academyId, academyId), eq(academyTrials.status, "active")))
    .limit(1);

  if (activeTrial && activeTrial.endsAt > now) {
    const policy = evaluateTrialPolicy({
      now,
      activeTrial,
      lastTrialStartedAt: activeTrial.startedAt,
      hasPaidPlan: false,
    });
    return {
      eligible: policy.eligible,
      reason: policy.reason,
      active: policy.active,
      trialId: activeTrial.id,
      startsAt: activeTrial.startedAt,
      endsAt: activeTrial.endsAt,
      nextEligibleAt: policy.nextEligibleAt,
      grantedPlanCode: "pro",
    };
  }

  if (activeTrial && activeTrial.endsAt <= now) {
    await expireAcademyTrial(activeTrial.id, academyId, now);
  }

  const hasPaidPlan =
    academy.planCode !== null &&
    academy.planCode !== "free" &&
    hasSubscriptionAccess(academy.subscriptionStatus);
  if (hasPaidPlan) {
    const policy = evaluateTrialPolicy({ now, hasPaidPlan: true });
    return {
      eligible: policy.eligible,
      reason: policy.reason,
      active: policy.active,
      trialId: null,
      startsAt: null,
      endsAt: null,
      nextEligibleAt: null,
      grantedPlanCode: null,
    };
  }

  const [lastTrial] = await db
    .select({ id: academyTrials.id, startedAt: academyTrials.startedAt })
    .from(academyTrials)
    .where(eq(academyTrials.academyId, academyId))
    .orderBy(desc(academyTrials.startedAt))
    .limit(1);

  const policy = evaluateTrialPolicy({
    now,
    hasPaidPlan: false,
    lastTrialStartedAt: lastTrial?.startedAt ?? null,
  });

  return {
    eligible: policy.eligible,
    reason: policy.reason,
    active: policy.active,
    trialId: null,
    startsAt: null,
    endsAt: null,
    nextEligibleAt: policy.nextEligibleAt,
    grantedPlanCode: null,
  };
}

export async function startAcademyTrial(params: {
  academyId: string;
  tenantId: string;
  userId: string;
  source?: string;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const status = await getAcademyTrialStatus(params.academyId, now);

  if (status.active && status.trialId && status.endsAt) {
    return { created: false, status };
  }
  if (!status.eligible) {
    return { created: false, status };
  }

  const endsAt = addTrialDays(now, TRIAL_DURATION_DAYS);
  let trial: typeof academyTrials.$inferSelect;
  try {
    [trial] = await db
      .insert(academyTrials)
      .values({
        tenantId: params.tenantId,
        academyId: params.academyId,
        status: "active",
        grantedPlanCode: "pro",
        source: params.source ?? "self_serve",
        startedBy: params.userId,
        startedAt: now,
        endsAt,
      })
      .returning();
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error ? String(error.code) : null;
    if (code === "23505") {
      return { created: false, status: await getAcademyTrialStatus(params.academyId, now) };
    }
    throw error;
  }

  await db
    .update(academies)
    .set({ trialStartsAt: now, trialEndsAt: endsAt, isTrialActive: true })
    .where(eq(academies.id, params.academyId));

  await recordGrowthEvent({
    eventName: "trial_started",
    userId: params.userId,
    academyId: params.academyId,
    tenantId: params.tenantId,
    planCode: "starter",
    source: params.source ?? "self_serve",
    properties: { trial_id: trial.id, granted_plan: "starter" },
    idempotencyKey: `trial_started:${trial.id}`,
  });

  return {
    created: true,
    status: {
      eligible: false,
      reason: "active_trial" as const,
      active: true,
      trialId: trial.id,
      startsAt: now,
      endsAt,
      nextEligibleAt: addTrialDays(now, TRIAL_COOLDOWN_DAYS),
      grantedPlanCode: "pro" as const,
    },
  };
}

export async function expireAcademyTrial(trialId: string, academyId: string, now = new Date()) {
  const [expired] = await db
    .update(academyTrials)
    .set({ status: "expired", endedAt: now, updatedAt: now })
    .where(and(eq(academyTrials.id, trialId), eq(academyTrials.status, "active")))
    .returning({ id: academyTrials.id });

  if (!expired) return false;

  await db
    .update(academies)
    .set({ isTrialActive: false })
    .where(eq(academies.id, academyId));
  await recordGrowthEvent({
    eventName: "trial_ended",
    academyId,
    planCode: "free",
    source: "trial_lifecycle",
    properties: { trial_id: trialId },
    idempotencyKey: `trial_ended:${trialId}`,
  });
  return true;
}

export async function convertAcademyTrial(
  academyId: string,
  now = new Date(),
  client: TransactionClient | typeof db = db
) {
  const [converted] = await client
    .update(academyTrials)
    .set({ status: "converted", endedAt: now, convertedAt: now, updatedAt: now })
    .where(and(eq(academyTrials.academyId, academyId), eq(academyTrials.status, "active")))
    .returning({ id: academyTrials.id });

  if (!converted) return false;
  await client
    .update(academies)
    .set({ isTrialActive: false })
    .where(eq(academies.id, academyId));
  return true;
}

async function notifyTrialOwner(params: {
  academyId: string;
  tenantId: string;
  ownerUserId: string;
  academyName: string;
  kind: "day_five" | "expired";
}) {
  const isReminder = params.kind === "day_five";
  const title = isReminder ? "Tu prueba termina en 2 días" : "Tu prueba ha terminado";
  const message = isReminder
    ? `Aprovecha los últimos días de Starter en ${params.academyName}. Después volverás al plan Free.`
    : `${params.academyName} ha vuelto al plan Free. Tus datos siguen guardados y puedes contratar Starter cuando quieras.`;

  await createNotification({
    tenantId: params.tenantId,
    userId: params.ownerUserId,
    type: isReminder ? "trial_ending" : "trial_expired",
    title,
    message,
    data: { academyId: params.academyId, href: `/app/${params.academyId}/billing` },
  });

  try {
    const supabase = getSupabaseAdminClient();
    const { data } = await supabase.auth.admin.getUserById(params.ownerUserId);
    const email = data.user?.email;
    if (!email) return;
    const safeMessage = message
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
    await sendEmail({
      to: email,
      subject: `${title} · Zaltyko`,
      text: message,
      html: `<p>${safeMessage}</p><p><a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://zaltyko.com"}/app/${params.academyId}/billing">Ver planes</a></p>`,
      replyTo: process.env.BREVO_REPLY_TO ?? "admin@zaltyko.com",
    });
  } catch (error) {
    logger.error("Trial email notification failed", error, {
      academyId: params.academyId,
      kind: params.kind,
    });
  }
}

export async function processTrialLifecycle(now = new Date()) {
  const reminderThreshold = addTrialDays(now, 2);
  const rows = await db
    .select({
      id: academyTrials.id,
      academyId: academyTrials.academyId,
      tenantId: academyTrials.tenantId,
      endsAt: academyTrials.endsAt,
      dayFiveNotifiedAt: academyTrials.dayFiveNotifiedAt,
      expiryNotifiedAt: academyTrials.expiryNotifiedAt,
      status: academyTrials.status,
      academyName: academies.name,
      ownerUserId: profiles.userId,
    })
    .from(academyTrials)
    .innerJoin(academies, eq(academyTrials.academyId, academies.id))
    .innerJoin(profiles, eq(academies.ownerId, profiles.id))
    .where(
      or(
        eq(academyTrials.status, "active"),
        and(eq(academyTrials.status, "expired"), isNull(academyTrials.expiryNotifiedAt))
      )
    );

  let reminded = 0;
  let expired = 0;

  for (const trial of rows) {
    if (trial.endsAt <= now) {
      const didExpire =
        trial.status === "active"
          ? await expireAcademyTrial(trial.id, trial.academyId, now)
          : false;
      const [claimed] = await db
        .update(academyTrials)
        .set({ expiryNotifiedAt: now, updatedAt: now })
        .where(and(eq(academyTrials.id, trial.id), isNull(academyTrials.expiryNotifiedAt)))
        .returning({ id: academyTrials.id });
      if (claimed) {
        await notifyTrialOwner({ ...trial, kind: "expired" });
      }
      if (didExpire) expired++;
      continue;
    }

    if (!trial.dayFiveNotifiedAt && trial.endsAt <= reminderThreshold) {
      const [claimed] = await db
        .update(academyTrials)
        .set({ dayFiveNotifiedAt: now, updatedAt: now })
        .where(
          and(
            eq(academyTrials.id, trial.id),
            eq(academyTrials.status, "active"),
            isNull(academyTrials.dayFiveNotifiedAt),
            gt(academyTrials.endsAt, now),
            lte(academyTrials.endsAt, reminderThreshold)
          )
        )
        .returning({ id: academyTrials.id });
      if (claimed) {
        await notifyTrialOwner({ ...trial, kind: "day_five" });
        reminded++;
      }
    }
  }

  return { checked: rows.length, reminded, expired };
}
