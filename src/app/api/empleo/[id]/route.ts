import { db } from "@/db";
import { empleoListings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { withTenant, type TenantContext } from "@/lib/authz";
import { verifyAcademyAccess } from "@/lib/permissions";
import { canUsePublicDemoData, demoEmploymentListing } from "@/lib/public/demo-listings";

type RouteContext = TenantContext<{ params: { id: string } }>;

// Zod schema para PATCH (ZAL-565 hardening): strict mode rechaza unknown keys.
// Todos los campos son opcionales (PATCH parcial). `isFeatured` se gestiona vía
// flujo admin separado, no vía PATCH público — por eso NO está aquí: si llega,
// Zod strict lo rechaza antes de cualquier lookup o mutación.
const PatchListingSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(5000).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(id: string): boolean {
  return UUID_REGEX.test(id);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (canUsePublicDemoData(id)) {
      return apiSuccess({ item: demoEmploymentListing });
    }

    const [listing] = await db.select()
      .from(empleoListings)
      .where(eq(empleoListings.id, id))
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

    // UUID validation antes del lookup (ZAL-565: rechazar id inválido antes de consultar).
    if (!isValidUuid(id)) {
      return apiError("INVALID_ID", "ID inválido", 400);
    }

    // Parse y validar body con Zod strict (ZAL-565: rechazar unknown keys / tipos inválidos).
    let body: z.infer<typeof PatchListingSchema>;
    try {
      body = PatchListingSchema.parse(await request.json());
    } catch (err) {
      if (err instanceof z.ZodError) {
        return apiError("VALIDATION_ERROR", "Validation failed", 400);
      }
      throw err;
    }

    const access = await canManageListing(id, context);
    if (!access.allowed) {
      return apiError(access.reason ?? "FORBIDDEN", "No autorizado", access.status);
    }

    const [updated] = await db.update(empleoListings)
      .set({
        ...body,
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

    // UUID validation antes del lookup (ZAL-565).
    if (!isValidUuid(id)) {
      return apiError("INVALID_ID", "ID inválido", 400);
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
