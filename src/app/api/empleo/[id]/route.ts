import { db } from "@/db";
import { empleoListings } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { withTenant, type TenantContext } from "@/lib/authz";
import { verifyAcademyAccess } from "@/lib/permissions";
import { canUsePublicDemoData, demoEmploymentListing } from "@/lib/public/demo-listings";
import { z } from "zod";

type RouteContext = TenantContext<{ params: { id: string } }>;

const ListingIdSchema = z.string().uuid();

// PATCH must be allow-listed. The previous `{ ...body }` accepted operational
// columns such as `isFeatured`, `status`, `views` and timestamps from any
// academy member, which made the public employment surface an accidental
// privilege-escalation/write primitive.
const UpdateEmpleoSchema = z
  .object({
    title: z.string().trim().min(3).max(200).optional(),
    category: z.enum(["coach", "assistant_coach", "administrative", "physiotherapist", "psychologist", "other"]).optional(),
    description: z.string().max(5000).nullable().optional(),
    requirements: z.string().max(5000).nullable().optional(),
    location: z
      .object({
        country: z.string().min(1),
        province: z.string().optional(),
        city: z.string().min(1),
      })
      .nullable()
      .optional(),
    jobType: z.enum(["full_time", "part_time", "internship"]).optional(),
    salary: z
      .object({
        min: z.number().nonnegative().optional(),
        max: z.number().nonnegative().optional(),
        currency: z.string().min(1),
        type: z.enum(["fixed", "range", "contact"]),
      })
      .nullable()
      .optional(),
    howToApply: z.enum(["internal", "external"]).optional(),
    externalUrl: z.string().url().nullable().optional(),
    deadline: z.string().optional().nullable(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.salary?.min != null && data.salary.max != null && data.salary.min > data.salary.max) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["salary", "max"], message: "El máximo debe ser mayor o igual que el mínimo" });
    }
    if (data.howToApply === "external" && !data.externalUrl) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["externalUrl"], message: "La URL externa es obligatoria para este método de aplicación" });
    }
  });

// @auth-flexible route-guard-reason: public active-listing detail endpoint; validates only the route id before a non-sensitive public read.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (canUsePublicDemoData(id)) {
      return apiSuccess({ item: demoEmploymentListing });
    }

    if (!ListingIdSchema.safeParse(id).success) {
      return apiError("INVALID_LISTING_ID", "El identificador de la oferta no es válido", 400);
    }

    const [listing] = await db.select()
      .from(empleoListings)
      // Public pages must never expose drafts or closed internal listings.
      .where(and(eq(empleoListings.id, id), eq(empleoListings.status, "active")))
      .limit(1);

    if (!listing) {
      return apiError("NOT_FOUND", "Listing no encontrado", 404);
    }

    return apiSuccess({ item: listing });
  } catch (error) {
    logger.error("Error fetching employment listing:", error);
    return apiError("INTERNAL_ERROR", "Error interno", 500);
  }
}

export const PATCH = withTenant(async (request: Request, context: RouteContext) => {
  try {
    const { id } = context.params;
    if (!ListingIdSchema.safeParse(id).success) {
      return apiError("INVALID_LISTING_ID", "El identificador de la oferta no es válido", 400);
    }

    const parsedBody = UpdateEmpleoSchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return apiError("VALIDATION_ERROR", "Los datos de la oferta no son válidos", 400, parsedBody.error.flatten());
    }

    const access = await canManageListing(id, context);
    if (!access.allowed) {
      return apiError(access.reason ?? "FORBIDDEN", "No autorizado", access.status);
    }

    const [updated] = await db.update(empleoListings)
      .set({
        ...parsedBody.data,
        updatedAt: new Date(),
      })
      .where(eq(empleoListings.id, id))
      .returning();

    if (!updated) {
      return apiError("NOT_FOUND", "Listing no encontrado", 404);
    }

    return apiSuccess({ item: updated });
  } catch (error) {
    logger.error("Error updating employment listing:", error);
    return apiError("INTERNAL_ERROR", "Error interno", 500);
  }
});

export const DELETE = withTenant(async (_request: Request, context: RouteContext) => {
  try {
    const { id } = context.params;
    if (!ListingIdSchema.safeParse(id).success) {
      return apiError("INVALID_LISTING_ID", "El identificador de la oferta no es válido", 400);
    }

    const access = await canManageListing(id, context);
    if (!access.allowed) {
      return apiError(access.reason ?? "FORBIDDEN", "No autorizado", access.status);
    }

    const [deleted] = await db.delete(empleoListings)
      .where(eq(empleoListings.id, id))
      .returning();

    if (!deleted) {
      return apiError("NOT_FOUND", "Listing no encontrado", 404);
    }

    return apiSuccess({ success: true });
  } catch (error) {
    logger.error("Error deleting employment listing:", error);
    return apiError("INTERNAL_ERROR", "Error interno", 500);
  }
});

async function canManageListing(
  id: string,
  context: RouteContext
): Promise<{ allowed: boolean; status: number; reason?: string }> {
  const [listing] = await db
    .select({
      id: empleoListings.id,
      academyId: empleoListings.academyId,
      userId: empleoListings.userId,
    })
    .from(empleoListings)
    .where(eq(empleoListings.id, id))
    .limit(1);

  if (!listing) {
    return { allowed: false, status: 404, reason: "NOT_FOUND" };
  }

  if (context.profile.role === "admin" || context.profile.role === "super_admin") {
    return { allowed: true, status: 200 };
  }

  if (listing.userId === context.userId) {
    return { allowed: true, status: 200 };
  }

  if (listing.academyId && context.tenantId) {
    const academyAccess = await verifyAcademyAccess(listing.academyId, context.tenantId);
    if (academyAccess.allowed) {
      return { allowed: true, status: 200 };
    }
  }

  return { allowed: false, status: 403, reason: "FORBIDDEN" };
}
