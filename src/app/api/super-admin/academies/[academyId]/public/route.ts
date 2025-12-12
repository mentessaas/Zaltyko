import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
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
    const params = await context.params as Promise<{ academyId: string }>;
    const { academyId: id } = await params;

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "INVALID_JSON", message: "El cuerpo de la solicitud no es JSON válido" },
        { status: 400 }
      );
    }

    const parsed = UpdateVisibilitySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          message: "Los datos proporcionados no son válidos",
          details: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const { isPublic } = parsed.data;

    // Verificar que la academia existe
    const [academy] = await db
      .select({ id: academies.id })
      .from(academies)
      .where(eq(academies.id, id))
      .limit(1);

    if (!academy) {
      return NextResponse.json(
        { error: "ACADEMY_NOT_FOUND", message: "Academia no encontrada" },
        { status: 404 }
      );
    }

    // Actualizar visibilidad
    await db
      .update(academies)
      .set({ isPublic })
      .where(eq(academies.id, id));

    // Revalidar rutas públicas
    revalidatePath("/academias");
    revalidatePath(`/academias/${id}`);
    revalidatePath("/super-admin/academies/public");

    return NextResponse.json({
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

