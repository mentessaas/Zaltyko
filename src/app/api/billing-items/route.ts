import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, billingItems } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";
import { handleApiError } from "@/lib/api-error-handler";
import { apiSuccess, apiError, apiCreated } from "@/lib/api-response";
import { getCurrencyForCountry } from "@/lib/currency";

const CreateBillingItemSchema = z.object({
  academyId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  amountCents: z.number().int().positive(),
  currency: z.string().length(3).optional(),
  periodicity: z.enum(["one_time", "monthly", "yearly"]),
  isActive: z.boolean().default(true),
});

export const GET = withTenant(async (request, context) => {
  try {
    const url = new URL(request.url);
    const academyId = url.searchParams.get("academyId");
    const isActive = url.searchParams.get("isActive");

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
    }

    if (!academyId) {
      return apiError("ACADEMY_ID_REQUIRED", "academyId requerido", 400);
    }

    // Verify academy access
    const [academy] = await db
      .select({ id: academies.id, tenantId: academies.tenantId, country: academies.country, countryCode: academies.countryCode })
      .from(academies)
      .where(eq(academies.id, academyId))
      .limit(1);

    if (!academy || academy.tenantId !== context.tenantId) {
      return apiError("ACADEMY_NOT_FOUND", "Academia no encontrada", 404);
    }

    const scope = await authorizeAcademyCapability({
      context,
      resourceTenantId: academy.tenantId,
      academyId,
      permission: "billing:read",
    });
    if (!scope.allowed) return apiError("ACADEMY_NOT_FOUND", "Academia no encontrada", 404);

    const conditions = [
      eq(billingItems.academyId, academyId),
      eq(billingItems.tenantId, context.tenantId),
    ];

    if (isActive !== null) {
      conditions.push(eq(billingItems.isActive, isActive === "true"));
    }

    const items = await db
      .select()
      .from(billingItems)
      .where(and(...conditions))
      .orderBy(asc(billingItems.name))
      .limit(500);

    return apiSuccess({ items });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/billing-items", method: "GET" });
  }
});

export const POST = withTenant(async (request, context) => {
  try {
    const body = CreateBillingItemSchema.parse(await request.json());

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
    }

    // Verify academy access
    const [academy] = await db
      .select({ id: academies.id, tenantId: academies.tenantId, country: academies.country, countryCode: academies.countryCode })
      .from(academies)
      .where(eq(academies.id, body.academyId))
      .limit(1);

    if (!academy || academy.tenantId !== context.tenantId) {
      return apiError("ACADEMY_NOT_FOUND", "Academia no encontrada", 404);
    }

    const scope = await authorizeAcademyCapability({
      context,
      resourceTenantId: academy.tenantId,
      academyId: body.academyId,
      permission: "billing:create",
    });
    if (!scope.allowed) return apiError("ACADEMY_NOT_FOUND", "Academia no encontrada", 404);

    const [item] = await db
      .insert(billingItems)
      .values({
        id: crypto.randomUUID(),
        tenantId: context.tenantId,
        academyId: body.academyId,
        name: body.name,
        description: body.description ?? null,
        amountCents: body.amountCents,
        currency: (body.currency ?? getCurrencyForCountry(academy.countryCode ?? academy.country)).toUpperCase(),
        periodicity: body.periodicity,
        isActive: body.isActive,
      })
      .returning();

    return apiCreated({ item });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/billing-items", method: "POST" });
  }
});
