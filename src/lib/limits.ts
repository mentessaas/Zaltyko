import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, athletes, classes, groups, plans, subscriptions, profiles } from "@/db/schema";
import { LimitError, type PlanCode, type LimitResource } from "./limits/errors";
import { NotFoundError } from "@/lib/errors";
import { getResourceCount } from "./limits/resource-counters";
import { count } from "drizzle-orm";

export type { PlanCode, LimitResource };

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

async function assertAcademyTenant(academyId: string, tenantId: string): Promise<void> {
  const [academy] = await db
    .select({ id: academies.id })
    .from(academies)
    .where(and(eq(academies.id, academyId), eq(academies.tenantId, tenantId)))
    .limit(1);

  if (!academy) {
    throw new NotFoundError("ACADEMY_NOT_FOUND");
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
    throw new NotFoundError("PROFILE_NOT_FOUND");
  }

  const currentCount = await getResourceCount("academies", "", "", profile.id);
  const evaluation = evaluateLimit(subscription.planCode, academyLimit, currentCount, "academies");

  if (evaluation.exceeded) {
    throw new LimitError("ACADEMY_LIMIT_REACHED", {
      code: "LIMIT_REACHED",
      resource: "academies",
      currentCount,
      limit: academyLimit,
      upgradeTo: evaluation.upgradeTo,
    });
  }
}

export async function assertWithinPlanLimits(
  tenantId: string,
  academyId: string,
  resource: LimitResource
): Promise<void> {
  await assertAcademyTenant(academyId, tenantId);

  const subscription = await getActiveSubscription(academyId);

  // Obtener el límite según el recurso
  let limit: number | null;
  switch (resource) {
    case "athletes":
      limit = subscription.athleteLimit;
      break;
    case "classes":
      limit = subscription.classLimit;
      break;
    case "groups":
      limit = subscription.groupLimit;
      break;
    default:
      throw new Error(`Resource ${resource} is not supported for academy-level limits`);
  }

  // Si no hay límite, no validar
  if (limit === null) {
    return;
  }

  // Obtener conteo actual
  const currentCount = await getResourceCount(resource, academyId, tenantId);
  const evaluation = evaluateLimit(subscription.planCode, limit, currentCount, resource);

  if (evaluation.exceeded) {
    throw new LimitError("LIMIT_REACHED", {
      code: "LIMIT_REACHED",
      resource,
      currentCount,
      limit,
      upgradeTo: evaluation.upgradeTo,
    });
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

  // Check academy limit (user-level) - usar getResourceCount
  const academyLimit = ACADEMY_LIMITS[newPlanCode];
  if (academyLimit !== null) {
    const currentAcademyCount = await getResourceCount("academies", "", "", profile.id);
    if (currentAcademyCount > academyLimit) {
      const ownedAcademies = await db
        .select({ id: academies.id, name: academies.name })
        .from(academies)
        .where(eq(academies.ownerId, profile.id));
      
      violations.push({
        resource: "academies",
        currentCount: currentAcademyCount,
        limit: academyLimit,
        items: ownedAcademies.map((a) => ({ id: a.id, name: a.name })),
      });
    }
  }

  // Check limits per academy (athletes, classes, groups)
  const ownedAcademies = await db
    .select({ id: academies.id, name: academies.name, tenantId: academies.tenantId })
    .from(academies)
    .where(eq(academies.ownerId, profile.id));

  const athleteLimit = newPlanCode === "premium" ? null : 50;
  const classLimit = CLASS_LIMITS[newPlanCode];
  const groupLimit = GROUP_LIMITS[newPlanCode];

  for (const academy of ownedAcademies) {
    const tenantId = academy.tenantId ?? "";

    // Check athletes per academy - usar getResourceCount
    if (athleteLimit !== null) {
      const currentAthleteCount = await getResourceCount("athletes", academy.id, tenantId);
      if (currentAthleteCount > athleteLimit) {
        const academyAthletes = await db
          .select({ id: athletes.id, name: athletes.name })
          .from(athletes)
          .where(eq(athletes.academyId, academy.id));

        violations.push({
          resource: "athletes",
          currentCount: currentAthleteCount,
          limit: athleteLimit,
          items: academyAthletes.map((a) => ({ id: a.id, name: a.name })),
          academyId: academy.id,
          academyName: academy.name,
        });
      }
    }

    // Check classes per academy - usar getResourceCount
    if (classLimit !== null) {
      const currentClassCount = await getResourceCount("classes", academy.id, tenantId);
      if (currentClassCount > classLimit) {
        const classesList = await db
          .select({ id: classes.id, name: classes.name })
          .from(classes)
          .where(eq(classes.academyId, academy.id));

        violations.push({
          resource: "classes",
          currentCount: currentClassCount,
          limit: classLimit,
          items: classesList.map((c) => ({ id: c.id, name: c.name })),
          academyId: academy.id,
          academyName: academy.name,
        });
      }
    }

    // Check groups per academy - usar getResourceCount
    if (groupLimit !== null) {
      const currentGroupCount = await getResourceCount("groups", academy.id, tenantId);
      if (currentGroupCount > groupLimit) {
        const groupsList = await db
          .select({ id: groups.id, name: groups.name })
          .from(groups)
          .where(eq(groups.academyId, academy.id));

        violations.push({
          resource: "groups",
          currentCount: currentGroupCount,
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

  // Obtener el límite según el recurso
  let limit: number | null;
  let ownerId: string | undefined;

  switch (resource) {
    case "athletes":
      limit = subscription.athleteLimit;
      break;
    case "classes":
      limit = subscription.classLimit;
      break;
    case "groups":
      limit = subscription.groupLimit;
      break;
    case "academies":
      // Para academias, necesitamos el ownerId
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
          ownerId = academy.ownerId;
        } else {
          limit = ACADEMY_LIMITS.free;
        }
      } else {
        limit = ACADEMY_LIMITS.free;
      }
      break;
    default:
      throw new Error(`Resource ${resource} is not supported`);
  }

  // Usar getResourceCount para obtener el conteo actual
  const current = await getResourceCount(resource, academyId, tenantId, ownerId);

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
