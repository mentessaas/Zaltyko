import { and, count, eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, athletes, classes, groups, plans, subscriptions, profiles } from "@/db/schema";

export type PlanCode = "free" | "pro" | "premium";

export type LimitResource = "athletes" | "classes" | "groups" | "academies";

export interface ActiveSubscription {
  planCode: PlanCode;
  athleteLimit: number | null;
  classLimit: number | null;
  groupLimit: number | null;
  academyLimit: number | null;
}

const CLASS_LIMITS: Record<PlanCode, number | null> = {
  free: 10,
  pro: 40,
  premium: null,
};

const GROUP_LIMITS: Record<PlanCode, number | null> = {
  free: 3,
  pro: 10,
  premium: null,
};

const ACADEMY_LIMITS: Record<PlanCode, number | null> = {
  free: 1,
  pro: null,
  premium: null,
};

export async function getUserSubscription(userId: string): Promise<ActiveSubscription> {
  const [row] = await db
    .select({
      planCode: plans.code,
      athleteLimit: plans.athleteLimit,
      academyLimit: plans.academyLimit,
    })
    .from(subscriptions)
    .leftJoin(plans, eq(subscriptions.planId, plans.id))
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  const planCode = (row?.planCode as PlanCode | undefined) ?? "free";
  const athleteLimit = row?.athleteLimit ?? 50;
  const academyLimit = row?.academyLimit ?? ACADEMY_LIMITS[planCode];

  return {
    planCode,
    athleteLimit: planCode === "premium" ? null : athleteLimit,
    classLimit: CLASS_LIMITS[planCode],
    groupLimit: GROUP_LIMITS[planCode],
    academyLimit: academyLimit,
  };
}

export async function getActiveSubscription(academyId: string): Promise<ActiveSubscription> {
  const [academy] = await db
    .select({
      ownerId: academies.ownerId,
    })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!academy || !academy.ownerId) {
    return {
      planCode: "free",
      athleteLimit: 50,
      classLimit: CLASS_LIMITS.free,
      groupLimit: GROUP_LIMITS.free,
      academyLimit: ACADEMY_LIMITS.free,
    };
  }

  const [owner] = await db
    .select({
      userId: profiles.userId,
    })
    .from(profiles)
    .where(eq(profiles.id, academy.ownerId))
    .limit(1);

  if (!owner) {
    return {
      planCode: "free",
      athleteLimit: 50,
      classLimit: CLASS_LIMITS.free,
      groupLimit: GROUP_LIMITS.free,
      academyLimit: ACADEMY_LIMITS.free,
    };
  }

  return getUserSubscription(owner.userId);
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

/**
 * Valida que el usuario no haya excedido el límite de academias según su plan
 */
export async function assertUserAcademyLimit(userId: string): Promise<void> {
  const subscription = await getUserSubscription(userId);
  const academyLimit = subscription.academyLimit;

  if (academyLimit === null) {
    return; // Sin límite
  }

  const [profile] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  if (!profile) {
    const error: any = new Error("PROFILE_NOT_FOUND");
    error.status = 404;
    throw error;
  }

  const ownedAcademies = await db
    .select({ id: academies.id })
    .from(academies)
    .where(eq(academies.ownerId, profile.id));

  if (ownedAcademies.length >= academyLimit) {
    const error: any = new Error("ACADEMY_LIMIT_REACHED");
    error.status = 402;
    error.statusCode = 402;
    error.code = "ACADEMY_LIMIT_REACHED";
    error.payload = {
      currentCount: ownedAcademies.length,
      limit: academyLimit,
      upgradeTo: subscription.planCode === "free" ? "pro" : "premium",
    };
    error.details = error.payload;
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

  if (resource === "groups") {
    const groupLimit = subscription.groupLimit;
    if (groupLimit == null) {
      return;
    }

    const [{ value: groupCount }] = await db
      .select({ value: count() })
      .from(groups)
      .where(and(eq(groups.academyId, academyId), eq(groups.tenantId, tenantId)));

    const currentCount = Number(groupCount ?? 0);
    const evaluation = evaluateLimit(
      subscription.planCode,
      groupLimit,
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

export async function checkPlanLimitViolations(userId: string, newPlanCode: PlanCode): Promise<{
  violations: Array<{
    resource: LimitResource;
    currentCount: number;
    limit: number | null;
    items: Array<{ id: string; name: string | null }>;
    academyId?: string;
    academyName?: string | null;
  }>;
  requiresAction: boolean;
}> {
  const [profile] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  if (!profile) {
    return { violations: [], requiresAction: false };
  }

  const violations: Array<{
    resource: LimitResource;
    currentCount: number;
    limit: number | null;
    items: Array<{ id: string; name: string | null }>;
    academyId?: string;
    academyName?: string | null;
  }> = [];

  // Check academy limit (user-level)
  const academyLimit = ACADEMY_LIMITS[newPlanCode];
  if (academyLimit !== null) {
    const ownedAcademies = await db
      .select({ id: academies.id, name: academies.name })
      .from(academies)
      .where(eq(academies.ownerId, profile.id));

    if (ownedAcademies.length > academyLimit) {
      violations.push({
        resource: "academies",
        currentCount: ownedAcademies.length,
        limit: academyLimit,
        items: ownedAcademies.map((a) => ({ id: a.id, name: a.name })),
      });
    }
  }

  // Check limits per academy (athletes, classes, groups)
  const ownedAcademies = await db
    .select({ id: academies.id, name: academies.name })
    .from(academies)
    .where(eq(academies.ownerId, profile.id));

  const athleteLimit = newPlanCode === "premium" ? null : 50;
  const classLimit = CLASS_LIMITS[newPlanCode];
  const groupLimit = GROUP_LIMITS[newPlanCode];

  for (const academy of ownedAcademies) {
    // Check athletes per academy
    if (athleteLimit !== null) {
      const academyAthletes = await db
        .select({ id: athletes.id, name: athletes.name })
        .from(athletes)
        .where(eq(athletes.academyId, academy.id));

      if (academyAthletes.length > athleteLimit) {
        violations.push({
          resource: "athletes",
          currentCount: academyAthletes.length,
          limit: athleteLimit,
          items: academyAthletes.map((a) => ({ id: a.id, name: a.name })),
          academyId: academy.id,
          academyName: academy.name,
        });
      }
    }

    // Check classes per academy
    if (classLimit !== null) {
      const classesList = await db
        .select({ id: classes.id, name: classes.name })
        .from(classes)
        .where(eq(classes.academyId, academy.id));

      if (classesList.length > classLimit) {
        violations.push({
          resource: "classes",
          currentCount: classesList.length,
          limit: classLimit,
          items: classesList.map((c) => ({ id: c.id, name: c.name })),
          academyId: academy.id,
          academyName: academy.name,
        });
      }
    }

    // Check groups per academy
    if (groupLimit !== null) {
      const groupsList = await db
        .select({ id: groups.id, name: groups.name })
        .from(groups)
        .where(eq(groups.academyId, academy.id));

      if (groupsList.length > groupLimit) {
        violations.push({
          resource: "groups",
          currentCount: groupsList.length,
          limit: groupLimit,
          items: groupsList.map((g) => ({ id: g.id, name: g.name })),
          academyId: academy.id,
          academyName: academy.name,
        });
      }
    }
  }

  return {
    violations,
    requiresAction: violations.length > 0,
  };
}

export interface RemainingLimits {
  resource: LimitResource;
  current: number;
  limit: number | null;
  remaining: number | null; // null significa ilimitado
  planCode: PlanCode;
  upgradeTo?: Exclude<PlanCode, "premium"> | "premium";
}

/**
 * Obtiene los límites restantes para un recurso específico en una academia
 */
export async function getRemainingLimits(
  tenantId: string,
  academyId: string,
  resource: LimitResource
): Promise<RemainingLimits> {
  await assertAcademyTenant(academyId, tenantId);
  const subscription = await getActiveSubscription(academyId);

  let current = 0;
  let limit: number | null = null;

  if (resource === "athletes") {
    limit = subscription.athleteLimit;
    const [{ value: athleteCount }] = await db
      .select({ value: count() })
      .from(athletes)
      .where(and(eq(athletes.academyId, academyId), eq(athletes.tenantId, tenantId)));
    current = Number(athleteCount ?? 0);
  } else if (resource === "classes") {
    limit = subscription.classLimit;
    const [{ value: classCount }] = await db
      .select({ value: count() })
      .from(classes)
      .where(and(eq(classes.academyId, academyId), eq(classes.tenantId, tenantId)));
    current = Number(classCount ?? 0);
  } else if (resource === "groups") {
    limit = subscription.groupLimit;
    const [{ value: groupCount }] = await db
      .select({ value: count() })
      .from(groups)
      .where(and(eq(groups.academyId, academyId), eq(groups.tenantId, tenantId)));
    current = Number(groupCount ?? 0);
  } else if (resource === "academies") {
    // Para academias, necesitamos el userId
    const [academy] = await db
      .select({ ownerId: academies.ownerId })
      .from(academies)
      .where(eq(academies.id, academyId))
      .limit(1);

    if (academy?.ownerId) {
      const [owner] = await db
        .select({ userId: profiles.userId })
        .from(profiles)
        .where(eq(profiles.id, academy.ownerId))
        .limit(1);

      if (owner?.userId) {
        const userSubscription = await getUserSubscription(owner.userId);
        limit = userSubscription.academyLimit;
        const ownedAcademies = await db
          .select({ id: academies.id })
          .from(academies)
          .where(eq(academies.ownerId, academy.ownerId));
        current = ownedAcademies.length;
      }
    }
  }

  const remaining = limit === null ? null : Math.max(0, limit - current);
  const evaluation = limit !== null ? evaluateLimit(subscription.planCode, limit, current, resource) : { exceeded: false };

  return {
    resource,
    current,
    limit,
    remaining,
    planCode: subscription.planCode,
    upgradeTo: evaluation.exceeded ? evaluation.upgradeTo : undefined,
  };
}

/**
 * Obtiene información de upgrade para un plan
 */
export function getUpgradeInfo(planCode: PlanCode): {
  nextPlan: PlanCode;
  price: string;
  benefits: string[];
} {
  if (planCode === "free") {
    return {
      nextPlan: "pro",
      price: "19€/mes",
      benefits: ["Academias ilimitadas", "Hasta 200 atletas", "10 grupos", "40 clases"],
    };
  } else if (planCode === "pro") {
    return {
      nextPlan: "premium",
      price: "49€/mes",
      benefits: ["Todo ilimitado", "API extendida", "Soporte prioritario"],
    };
  }
  return {
    nextPlan: "premium",
    price: "49€/mes",
    benefits: [],
  };
}
