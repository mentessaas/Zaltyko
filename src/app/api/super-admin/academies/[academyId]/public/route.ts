import { apiSuccess, apiError } from "@/lib/api-response";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies } from "@/db/schema";
import { withSuperAdmin } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { revalidatePath } from "next/cache";

interface RouteContext {
  params: Promise<{ academyId: string }>;
}

const UpdateVisibilitySchema = z.object({
  isPublic: z.boolean(),
});

/**
 * PUT /api/super-admin/academies/[id]/public
 * 
 * Actualiza la visibilidad pública de una academia.
 * Solo accesible por super_admin.
 */
export const PUT = withSuperAdmin(async (request, context) => {
  try {
    const params = context.params as { academyId?: string };
    const academyId = params?.academyId;
    if (!academyId) {
      return apiError("ACADEMY_ID_REQUIRED", "Academy ID is required", 400);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return apiError("INVALID_JSON", "El cuerpo de la solicitud no es JSON válido", 400);
    }

    const parsed = UpdateVisibilitySchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Los datos proporcionados no son válidos", 400);
    }

    const { isPublic } = parsed.data;

    // Verificar que la academia existe
    const [academy] = await db
      .select({ id: academies.id })
      .from(academies)
      .where(eq(academies.id, academyId))
      .limit(1);

    if (!academy) {
      return apiError("ACADEMY_NOT_FOUND", "Academia no encontrada", 404);
    }

    // Actualizar visibilidad
    await db
      .update(academies)
      .set({ isPublic })
      .where(eq(academies.id, academyId));

    // Revalidar rutas públicas
    revalidatePath("/academias");
    revalidatePath(`/academias/${academyId}`);
    revalidatePath("/super-admin/academies/public");

    return apiSuccess({
      success: true,
      isPublic,
    });
  } catch (error) {
    return handleApiError(error, {
      endpoint: "/api/super-admin/academies/[id]/public",
      method: "PUT",
    });
  }
});

