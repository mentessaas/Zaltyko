import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { academies, profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { apiError, apiSuccess } from "@/lib/api-response";

export const dynamic = "force-dynamic";
const bodySchema = z.object({ academyId: z.string().uuid() });

// @auth-flexible route-guard-reason: authenticated legacy ownership check; never transfers ownership.
export async function POST(request: Request) {
  const supabase = await createClient(await cookies());
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("UNAUTHENTICATED", "Debes iniciar sesión", 401);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_PAYLOAD", "Academia no válida", 400);
  const [owned] = await db.select({ id: academies.id }).from(academies)
    .innerJoin(profiles, eq(profiles.id, academies.ownerId))
    .where(and(eq(academies.id, parsed.data.academyId), eq(profiles.userId, user.id),
      eq(profiles.isSuspended, false), eq(profiles.canLogin, true),
      eq(academies.isSuspended, false))).limit(1);
  if (!owned) return apiError("MANUAL_REVIEW_REQUIRED", "Solicita gestionar la ficha desde el directorio. Un correo coincidente no acredita la propiedad.", 403);
  return apiSuccess({ academyId: owned.id, redirectUrl: `/app/${owned.id}/dashboard` });
}
