import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { academies, memberships, plans, profiles, subscriptions } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { assertUserAcademyLimit, getUpgradeInfo } from "@/lib/limits";
import { withRateLimit, getUserIdentifier } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/api-error-handler";
import { withPayloadValidation, type PayloadValidationContext } from "@/lib/payload-validator";
import { isAppError } from "@/lib/errors";
import { seedOnboardingForAcademy, markWizardStep } from "@/lib/onboarding";
import { trackEvent } from "@/lib/analytics";
import { logEvent } from "@/lib/event-logging";

const ACADEMY_TYPES = ["artistica", "ritmica", "trampolin", "general"] as const;

const BodySchema = z.object({
  name: z.string().min(3),
  country: z.string().optional(),
  region: z.string().optional(),
  city: z.string().optional(),
  academyType: z.enum(ACADEMY_TYPES),
  tenantId: z.string().uuid().optional(),
  ownerProfileId: z.string().uuid().optional(),
});

const handler = withTenant(async (request, context) => {
  try {
    let body;
    try {
      body = BodySchema.parse(await request.json());
    } catch (parseError) {
      if (parseError instanceof z.ZodError) {
        return NextResponse.json(
          {
            error: "VALIDATION_ERROR",
            message: "Los datos proporcionados no son válidos",
            details: parseError.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
          { status: 400 }
        );
      }
      // Error al parsear JSON
      return NextResponse.json(
        {
          error: "INVALID_JSON",
          message: "El cuerpo de la petición no es un JSON válido",
        },
        { status: 400 }
      );
    }

    const isAdmin = context.profile.role === "admin" || context.profile.role === "super_admin";
    const requesterRole = context.profile.role;
    if (!["owner", "admin", "super_admin"].includes(requesterRole)) {
      return NextResponse.json({ error: "PROFILE_REQUIRED" }, { status: 403 });
    }

    const ownerProfile = body.ownerProfileId
      ? (
        await db
          .select()
          .from(profiles)
          .where(eq(profiles.id, body.ownerProfileId))
          .limit(1)
      )[0]
      : context.profile;

    if (!ownerProfile) {
      return NextResponse.json({ error: "OWNER_PROFILE_NOT_FOUND" }, { status: 404 });
    }

    if (!["owner", "admin"].includes(ownerProfile.role)) {
      return NextResponse.json({ error: "PROFILE_REQUIRED" }, { status: 403 });
    }

    // Validate academy limit for the user
    try {
      await assertUserAcademyLimit(ownerProfile.userId);
    } catch (error: any) {
      if ((error?.status === 402 || error?.statusCode === 402) && error?.code === "ACADEMY_LIMIT_REACHED") {
        const upgradeTo = error.payload?.upgradeTo ?? "pro";
        const upgradeInfo = getUpgradeInfo(upgradeTo === "pro" ? "free" : "pro");

        return NextResponse.json(
          {
            error: "ACADEMY_LIMIT_REACHED",
            message: `Has alcanzado el límite de academias de tu plan actual (${error.payload?.limit ?? 1} academia). Actualiza a ${upgradeTo.toUpperCase()} (${upgradeInfo.price}) para crear academias ilimitadas.`,
            payload: {
              ...error.payload,
              upgradeInfo: {
                plan: upgradeTo,
                price: upgradeInfo.price,
                benefits: upgradeInfo.benefits,
              },
            },
          },
          { status: 402 }
        );
      }
      throw error;
    }

    const tenantId =
      (isAdmin && body.tenantId) || ownerProfile.tenantId || crypto.randomUUID();

    const academyId = crypto.randomUUID();

    // No crear trial automático - el plan es "free" por defecto hasta que el usuario pague
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

    // Create or ensure subscription exists for the user (not the academy)
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

    // No trackear trial_started ya que no se crea trial automático

    // Log event for Super Admin metrics
    await logEvent({
      academyId,
      eventType: "academy_created",
      metadata: {
        country: body.country,
        academyType: body.academyType,
      },
    });

    return NextResponse.json({
      id: academyId,
      tenantId,
      academyType: body.academyType,
    });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/academies", method: "POST" });
  }
});

// Aplicar rate limiting y validación de payload
// Nota: withRateLimit y withPayloadValidation deben envolver el handler directamente
// pero con withTenant necesitamos un wrapper adicional
const wrappedHandler = async (
  request: Request,
  context?: PayloadValidationContext
) => {
  try {
    return (await handler(request, context ?? {})) as NextResponse;
  } catch (error) {
    // Asegurar que siempre devolvemos JSON, incluso si hay un error no manejado
    return handleApiError(error, { endpoint: "/api/academies", method: "POST" });
  }
};

export const POST = withRateLimit(
  withPayloadValidation(wrappedHandler, { maxSize: 512 * 1024 }), // 512KB
  { identifier: getUserIdentifier }
);

const QuerySchema = z.object({
  tenantId: z.string().uuid().optional(),
  academyType: z.enum(ACADEMY_TYPES).optional(),
});

export const GET = withTenant(async (request, context) => {
  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));

  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_FILTERS" }, { status: 400 });
  }

  const { tenantId, academyType } = parsed.data;
  const isSuperAdmin = context.profile.role === "super_admin";

  const effectiveTenantId = isSuperAdmin
    ? tenantId ?? context.tenantId ?? null
    : context.tenantId ?? null;

  // Si aún no hay tenant (p.ej. usuario recién creado en onboarding), devolvemos lista vacía
  if (!effectiveTenantId && !isSuperAdmin) {
    return NextResponse.json({ items: [] });
  }

  const filters: Array<ReturnType<typeof eq>> = [];

  if (effectiveTenantId) {
    filters.push(eq(academies.tenantId, effectiveTenantId));
  }
  if (academyType) {
    filters.push(eq(academies.academyType, academyType));
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

  return NextResponse.json({ items: rows });
});
