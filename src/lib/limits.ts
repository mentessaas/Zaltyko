import { and, count, eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, athletes, classes, plans, subscriptions } from "@/db/schema";

export type PlanCode = "free" | "pro" | "premium";

export type LimitResource = "athletes" | "classes";

export interface ActiveSubscription {
  planCode: PlanCode;
  athleteLimit: number | null;
  classLimit: number | null;
}

const CLASS_LIMITS: Record<PlanCode, number | null> = {
  free: 10,
  pro: 40,
  premium: null,
};

export async function getActiveSubscription(academyId: string): Promise<ActiveSubscription> {
  const [row] = await db
    .select({
      planCode: plans.code,
      athleteLimit: plans.athleteLimit,
    })
    .from(subscriptions)
    .leftJoin(plans, eq(subscriptions.planId, plans.id))
    .where(eq(subscriptions.academyId, academyId))
    .limit(1);

  const planCode = (row?.planCode as PlanCode | undefined) ?? "free";
  const athleteLimit = row?.athleteLimit ?? 50;

  return {
    planCode,
    athleteLimit: planCode === "premium" ? null : athleteLimit,
    classLimit: CLASS_LIMITS[planCode],
  };
}

export interface LimitEvaluation {
  exceeded: boolean;
  upgradeTo?: Exclude<PlanCode, "premium"> | "premium";
}

export function evaluateLimit(
  planCode: PlanCode,
  limit: number | null,
  currentCount: number,
  resource: LimitResource
): LimitEvaluation {
  if (limit == null) {
    return { exceeded: false };
  }

  if (currentCount < limit) {
    return { exceeded: false };
  }

  const upgradeTo = planCode === "free" ? "pro" : "premium";

  return {
    exceeded: true,
    upgradeTo,
  };
}

async function assertAcademyTenant(academyId: string, tenantId: string) {
  const [academy] = await db
    .select({ id: academies.id })
    .from(academies)
    .where(and(eq(academies.id, academyId), eq(academies.tenantId, tenantId)))
    .limit(1);

  if (!academy) {
    const error: any = new Error("ACADEMY_NOT_FOUND");
    error.status = 404;
    throw error;
  }
}

export async function assertWithinPlanLimits(
  tenantId: string,
  academyId: string,
  resource: LimitResource
) {
  await assertAcademyTenant(academyId, tenantId);

  const subscription = await getActiveSubscription(academyId);

  if (resource === "athletes") {
    if (subscription.athleteLimit == null) {
      return;
    }

    const [{ value: athleteCount }] = await db
      .select({ value: count() })
      .from(athletes)
      .where(and(eq(athletes.academyId, academyId), eq(athletes.tenantId, tenantId)));

    const currentCount = Number(athleteCount ?? 0);
    const evaluation = evaluateLimit(
      subscription.planCode,
      subscription.athleteLimit,
      Number.isNaN(currentCount) ? 0 : currentCount,
      resource
    );

    if (evaluation.exceeded) {
      const error: any = new Error("LIMIT_REACHED");
      error.status = 402;
      error.payload = {
        code: "LIMIT_REACHED",
        upgradeTo: evaluation.upgradeTo,
        resource,
      };
      throw error;
    }
  }

  if (resource === "classes") {
    const classLimit = subscription.classLimit;
    if (classLimit == null) {
      return;
    }

    const [{ value: classCount }] = await db
      .select({ value: count() })
      .from(classes)
      .where(and(eq(classes.academyId, academyId), eq(classes.tenantId, tenantId)));

    const currentCount = Number(classCount ?? 0);
    const evaluation = evaluateLimit(
      subscription.planCode,
      classLimit,
      Number.isNaN(currentCount) ? 0 : currentCount,
      resource
    );

    if (evaluation.exceeded) {
      const error: any = new Error("LIMIT_REACHED");
      error.status = 402;
      error.payload = {
        code: "LIMIT_REACHED",
        upgradeTo: evaluation.upgradeTo,
        resource,
      };
      throw error;
    }
  }
}
