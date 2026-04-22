import { db } from "@/db";
import { empleoListings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { withTenant, type TenantContext } from "@/lib/authz";
import { verifyAcademyAccess } from "@/lib/permissions";

type RouteContext = TenantContext<{ params: { id: string } }>;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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
    const body = await request.json();

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
