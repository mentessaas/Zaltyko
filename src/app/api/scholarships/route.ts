import { z } from "zod";
import { eq, and, sql } from "drizzle-orm";
import { withTenant } from "@/lib/authz";
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";

import { db } from "@/db";
import { scholarships, athletes } from "@/db/schema";
import { apiSuccess, apiError, apiCreated } from "@/lib/api-response";

// PR 10 (Operate P2): `.nullable().optional()` en `description` y
// `requiredDocuments` porque el form de creación de beca puede limpiar
// esos campos (clear field). Antes, `null` → 400.
const createSchema = z.object({
  academyId: z.string().uuid(),
  athleteId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  discountType: z.enum(["percentage", "fixed"]).default("percentage"),
  discountValue: z.number().positive(),
  startDate: z.string(),
  endDate: z.string().nullable().optional(),
  autoRenew: z.boolean().default(false),
  requiredDocuments: z.array(z.string()).nullable().optional(),
  isActive: z.boolean().default(true),
});

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
  }

  const url = new URL(request.url);
  const academyId = url.searchParams.get("academyId");
  const sportConfigId = url.searchParams.get("sportConfigId");

  if (!academyId) {
    return apiError("ACADEMY_ID_REQUIRED", "academyId requerido", 400);
  }

  const scope = await authorizeAcademyCapability({
    context,
    resourceTenantId: context.tenantId,
    academyId,
    permission: "billing:read",
  });
  if (!scope.allowed) return apiError("SCHOLARSHIP_NOT_FOUND", "No se encontraron becas", 404);

  const items = await db
    .select({
      id: scholarships.id,
      athleteId: scholarships.athleteId,
      athleteName: athletes.name,
      name: scholarships.name,
      description: scholarships.description,
      discountType: scholarships.discountType,
      discountValue: scholarships.discountValue,
      startDate: scholarships.startDate,
      endDate: scholarships.endDate,
      autoRenew: scholarships.autoRenew,
      requiredDocuments: scholarships.requiredDocuments,
      isActive: scholarships.isActive,
    })
    .from(scholarships)
    .innerJoin(athletes, eq(scholarships.athleteId, athletes.id))
    .where(
      and(
        eq(scholarships.academyId, academyId),
        eq(scholarships.tenantId, context.tenantId),
        eq(athletes.tenantId, context.tenantId),
        eq(athletes.academyId, academyId),
        sql`${athletes.deletedAt} IS NULL`,
        sportConfigId ? eq(athletes.primarySportConfigId, sportConfigId) : undefined
      )
    )
    .limit(5000);

  return apiSuccess({
    items: items.map((item) => ({
      ...item,
      discountValue: Number(item.discountValue),
    })),
  });
});

export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
  }

  const profile = context.profile;

  const body = createSchema.parse(await request.json());

  const scope = await authorizeAcademyCapability({
    context,
    resourceTenantId: context.tenantId,
    academyId: body.academyId,
    permission: "billing:create",
  });
  if (!scope.allowed) return apiError("FORBIDDEN", "No tienes permisos para crear becas", 403);

  // Validar que la persona deportista existe
  const [athlete] = await db
    .select({ id: athletes.id })
    .from(athletes)
    .where(
      and(
        eq(athletes.id, body.athleteId),
        eq(athletes.tenantId, context.tenantId),
        eq(athletes.academyId, body.academyId),
        sql`${athletes.deletedAt} IS NULL`
      )
    )
    .limit(1);

  if (!athlete) {
    return apiError("ATHLETE_NOT_FOUND", "Persona deportista no encontrada", 404);
  }

  const [newScholarship] = await db
    .insert(scholarships)
    .values({
      tenantId: context.tenantId,
      academyId: body.academyId,
      athleteId: body.athleteId,
      name: body.name,
      description: body.description || null,
      discountType: body.discountType,
      discountValue: body.discountValue.toString(),
      startDate: body.startDate,
      endDate: body.endDate || null,
      autoRenew: body.autoRenew,
      requiredDocuments: body.requiredDocuments || null,
      isActive: body.isActive,
      createdBy: profile.id,
    })
    .returning({ id: scholarships.id });

  return apiCreated({ ok: true, id: newScholarship.id });
});
