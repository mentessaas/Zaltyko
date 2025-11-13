import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { academies, memberships, plans, profiles, subscriptions } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { assertUserAcademyLimit } from "@/lib/limits";
import { withRateLimit, getUserIdentifier } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/api-error-handler";
import { withPayloadValidation } from "@/lib/payload-validator";

const ACADEMY_TYPES = ["artistica", "ritmica", "trampolin", "general"] as const;

const BodySchema = z.object({
  name: z.string().min(3),
  country: z.string().optional(),
  region: z.string().optional(),
  academyType: z.enum(ACADEMY_TYPES),
  tenantId: z.string().uuid().optional(),
  ownerProfileId: z.string().uuid().optional(),
});

const handler = withTenant(async (request, context) => {
  try {
    const body = BodySchema.parse(await request.json());

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
    if (error.status === 402) {
      return NextResponse.json(
        {
          error: "LIMIT_REACHED",
          payload: error.payload,
        },
        { status: 402 }
      );
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
    academyType: body.academyType,
    ownerId: ownerProfile.id,
  });

  await db
    .insert(memberships)
    .values({
      userId: ownerProfile.userId,
      academyId,
      role: "owner",
    })
    .onConflictDoNothing();

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
const wrappedHandler = async (request: Request) => {
  return (await handler(request, {} as any)) as NextResponse;
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

  const filters: any[] = [];

  if (effectiveTenantId) {
    filters.push(eq(academies.tenantId, effectiveTenantId));
  }
  if (academyType) {
    filters.push(eq(academies.academyType, academyType));
  }

  let query = db
    .select({
      id: academies.id,
      name: academies.name,
      academyType: academies.academyType,
      tenantId: academies.tenantId,
    })
    .from(academies);

  if (filters.length > 0) {
    query = query.where(filters.length === 1 ? filters[0]! : and(...filters));
  }

  const rows = await query.orderBy(asc(academies.name));

  return NextResponse.json({ items: rows });
});
