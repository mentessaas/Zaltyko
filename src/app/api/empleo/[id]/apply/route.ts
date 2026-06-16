import { db } from "@/db";
import { empleoListings, empleoApplications } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { apiSuccess, apiError, apiCreated } from "@/lib/api-response";
import { logger } from "@/lib/logger";

const ApplySchema = z.object({
  message: z.string().max(2000).optional(),
  resumeUrl: z.string().url().optional(),
});

// Helper to get authenticated user
async function getUser() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verificar autenticación
    const user = await getUser();
    if (!user) {
      return apiError("AUTH_REQUIRED", "Debes iniciar sesión para aplicar", 401);
    }

    const { id } = await params;
    const body = await request.json();
    const validated = ApplySchema.parse(body);

    // Verificar que el empleo existe y está activo
    const [listing] = await db.select()
      .from(empleoListings)
      .where(and(
        eq(empleoListings.id, id),
        eq(empleoListings.status, "active")
      ))
      .limit(1);

    if (!listing) {
      return apiError("LISTING_NOT_FOUND", "El empleo no existe o ya no está activo", 404);
    }

    // Verificar que no haya aplicado ya
    const [existingApp] = await db.select()
      .from(empleoApplications)
      .where(and(
        eq(empleoApplications.listingId, id),
        eq(empleoApplications.userId, user.id)
      ))
      .limit(1);

    if (existingApp) {
      return apiError("ALREADY_APPLIED", "Ya has aplicado a este puesto", 400);
    }

    // Crear la aplicación
    const [application] = await db.insert(empleoApplications).values({
      listingId: id,
      userId: user.id,
      message: validated.message,
      resumeUrl: validated.resumeUrl,
      status: "pending",
    }).returning();

    return apiCreated({ application });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError("VALIDATION_ERROR", "Error de validación", 400);
    }
    logger.error("Error applying to job:", error);
    return apiError("INTERNAL_ERROR", "Error al procesar la solicitud", 500);
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verificar autenticación
    const user = await getUser();
    if (!user) {
      return apiError("AUTH_REQUIRED", "Debes iniciar sesión", 401);
    }

    const { id } = await params;

    // Obtener la aplicación del usuario para este empleo
    const [application] = await db.select()
      .from(empleoApplications)
      .where(and(
        eq(empleoApplications.listingId, id),
        eq(empleoApplications.userId, user.id)
      ))
      .limit(1);

    if (!application) {
      return apiSuccess({ hasApplied: false });
    }

    return apiSuccess({ hasApplied: true, application });
  } catch (error) {
    logger.error("Error checking application status:", error);
    return apiError("INTERNAL_ERROR", "Error interno", 500);
  }
}
