import { and, eq, inArray } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";

import { db } from "@/db";
import { academies, memberships, profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { apiSuccess, apiError } from "@/lib/api-response";

const BodySchema = z.object({
  academyId: z.string().uuid().nullable().optional(),
  profileId: z.string().uuid().optional(), // Para modo Super Admin "ver como usuario"
});

export async function PATCH(request: Request) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError("UNAUTHORIZED", "No autorizado", 401);
  }

  const body = BodySchema.safeParse(await request.json());
  if (!body.success) {
    return apiError("INVALID_PAYLOAD", "Payload inválido", 400);
  }

  const [currentProfile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  if (!currentProfile) {
    return apiError("PROFILE_NOT_FOUND", "Perfil no encontrado", 404);
  }

  // Si se proporciona profileId y el usuario es Super Admin, actualizar el perfil objetivo
  const isSuperAdmin = currentProfile.role === "super_admin";
  const targetProfileId = body.data.profileId && isSuperAdmin ? body.data.profileId : currentProfile.id;

  const [targetProfile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, targetProfileId))
    .limit(1);

  if (!targetProfile) {
    return apiError("TARGET_PROFILE_NOT_FOUND", "Perfil objetivo no encontrado", 404);
  }

  const academyId = body.data.academyId ?? null;

  if (academyId) {
    const [membership] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .innerJoin(academies, eq(academies.id, memberships.academyId))
      .where(and(
        eq(memberships.userId, targetProfile.userId),
        eq(memberships.academyId, academyId),
        // La membresía debe pertenecer al mismo tenant del perfil objetivo;
        // así ni siquiera el modo super-admin puede dejar un contexto activo
        // cruzado que luego contamine rutas legacy.
        targetProfile.tenantId ? eq(academies.tenantId, targetProfile.tenantId) : undefined,
        eq(academies.isSuspended, false),
        inArray(academies.status, ["active", "trial"])
      ))
      .limit(1);

    if (!membership) {
      return apiError("ACADEMY_NOT_ALLOWED", "Academy no permitido", 403);
    }
  }

  await db
    .update(profiles)
    .set({ activeAcademyId: academyId })
    .where(eq(profiles.id, targetProfileId));

  return apiSuccess({ ok: true });
}
