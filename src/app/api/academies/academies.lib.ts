/**
 * Lógica de negocio para academies
 * Extraída para facilitar testing y mantenimiento
 */
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, memberships, plans, profiles, subscriptions } from "@/db/schema";
import { apiSuccess, apiError, apiCreated } from "@/lib/api-response";
import { assertUserAcademyLimit, getUpgradeInfo } from "@/lib/limits";
import { seedOnboardingForAcademy, markWizardStep } from "@/lib/onboarding";
import { trackEvent } from "@/lib/analytics";
import { logEvent } from "@/lib/event-logging";

export const dynamic = "force-dynamic";

const ACADEMY_TYPES = ["artistica", "ritmica", "trampolin", "general"] as const;
export const ACADEMY_TYPES_CONST = ACADEMY_TYPES;

export const CreateAcademyBodySchema = z.object({
  name: z.string().min(3),
  country: z.string().optional(),
  region: z.string().optional(),
  city: z.string().optional(),
  academyType: z.enum(ACADEMY_TYPES),
  tenantId: z.string().uuid().optional(),
  ownerProfileId: z.string().uuid().optional(),
});

export const QuerySchema = z.object({
  tenantId: z.string().uuid().optional(),
  academyType: z.enum(ACADEMY_TYPES).optional(),
});

export interface CreateAcademyContext {
  profile: {
    id: string;
    userId: string;
    role: string;
    tenantId: string | null;
  };
}

export async function createAcademy(body: z.infer<typeof CreateAcademyBodySchema>, context: CreateAcademyContext) {
  const { profile } = context;
  const isAdmin = profile.role === "admin" || profile.role === "super_admin";
  const requesterRole = profile.role;

  if (!["owner", "admin", "super_admin"].includes(requesterRole)) {
    return { error: apiError("PROFILE_REQUIRED", "No tienes permisos para crear academias", 403) };
  }

  const ownerProfile = body.ownerProfileId
    ? (
      await db
        .select()
        .from(profiles)
        .where(eq(profiles.id, body.ownerProfileId))
        .limit(1)
    )[0]
    : profile;

  if (!ownerProfile) {
    return { error: apiError("OWNER_PROFILE_NOT_FOUND", "No se encontró el perfil del propietario", 404) };
  }

  if (!["owner", "admin"].includes(ownerProfile.role)) {
    return { error: apiError("PROFILE_REQUIRED", "No tienes permisos para crear academias", 403) };
  }

  // Validate academy limit
  try {
    await assertUserAcademyLimit(ownerProfile.userId);
  } catch (error: any) {
    if ((error?.status === 402 || error?.statusCode === 402) && error?.code === "ACADEMY_LIMIT_REACHED") {
      const upgradeTo = error.payload?.upgradeTo ?? "pro";
      const upgradeInfo = getUpgradeInfo(upgradeTo === "pro" ? "free" : "pro");

      return {
        error: apiError(
          "ACADEMY_LIMIT_REACHED",
          `Has alcanzado el límite de academias de tu plan actual (${error.payload?.limit ?? 1} academia). Actualiza a ${upgradeTo.toUpperCase()} (${upgradeInfo.price}) para crear academias ilimitadas.`,
          402,
          {
            ...error.payload,
            upgradeInfo: {
              plan: upgradeTo,
              price: upgradeInfo.price,
              benefits: upgradeInfo.benefits,
            },
          }
        ),
      };
    }
    throw error;
  }

  const tenantId =
    (isAdmin && body.tenantId) || ownerProfile.tenantId || crypto.randomUUID();

  const academyId = crypto.randomUUID();

  await db.insert(academies).values({
    id: academyId,
    tenantId,
    name: body.name,
    country: body.country,
    region: body.region,
    city: body.city,
    academyType: body.academyType,
    ownerId: ownerProfile.id,
    trialStartsAt: null,
    trialEndsAt: null,
    isTrialActive: false,
  });

  await db
    .insert(memberships)
    .values({
      userId: ownerProfile.userId,
      academyId,
      role: "owner",
    })
    .onConflictDoNothing();

  await seedOnboardingForAcademy({
    academyId,
    tenantId,
    ownerProfileId: ownerProfile.id,
  });

  await markWizardStep({
    academyId,
    tenantId,
    step: "academy",
  });

  const shouldUpdateTenant = ownerProfile.tenantId !== tenantId;

  await db
    .update(profiles)
    .set({
      tenantId: shouldUpdateTenant ? tenantId : ownerProfile.tenantId,
      activeAcademyId: academyId,
    })
    .where(eq(profiles.id, ownerProfile.id));

  // Create or ensure subscription exists
  const [existingSubscription] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(eq(subscriptions.userId, ownerProfile.userId))
    .limit(1);

  if (!existingSubscription) {
    const [freePlan] = await db
      .select({ id: plans.id })
      .from(plans)
      .where(eq(plans.code, "free"))
      .limit(1);

    await db
      .insert(subscriptions)
      .values({
        userId: ownerProfile.userId,
        planId: freePlan?.id ?? null,
        status: "active",
      })
      .onConflictDoNothing();
  }

  await trackEvent("academy_created", {
    academyId,
    tenantId,
    userId: ownerProfile.userId,
    metadata: {
      country: body.country,
      academyType: body.academyType,
    },
  });

  await logEvent({
    academyId,
    eventType: "academy_created",
    metadata: {
      country: body.country,
      academyType: body.academyType,
    },
  });

  return {
    id: academyId,
    tenantId,
    academyType: body.academyType,
  };
}

export interface ListAcademiesParams {
  tenantId?: string;
  academyType?: string;
}

export async function listAcademies(params: ListAcademiesParams, context: { profile: { role: string; tenantId: string | null } }) {
  const { profile } = context;
  const isSuperAdmin = profile.role === "super_admin";

  const effectiveTenantId = isSuperAdmin
    ? params.tenantId ?? profile.tenantId ?? null
    : profile.tenantId ?? null;

  if (!effectiveTenantId && !isSuperAdmin) {
    return { items: [] };
  }

  const filters: Array<ReturnType<typeof eq>> = [];

  if (effectiveTenantId) {
    filters.push(eq(academies.tenantId, effectiveTenantId));
  }
  if (params.academyType) {
    filters.push(eq(academies.academyType, params.academyType));
  }

  const baseQuery = db
    .select({
      id: academies.id,
      name: academies.name,
      academyType: academies.academyType,
      tenantId: academies.tenantId,
    })
    .from(academies);

  const rows = filters.length > 0
    ? await baseQuery.where(filters.length === 1 ? filters[0]! : and(...filters)).orderBy(asc(academies.name))
    : await baseQuery.orderBy(asc(academies.name));

  return { items: rows };
}
