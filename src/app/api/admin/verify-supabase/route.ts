import { cookies } from "next/headers";
import { verifySupabaseSetup } from "@/lib/supabase/verify-setup";
import { getCurrentProfile } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { apiSuccess, apiError } from "@/lib/api-response";

// Forzar ruta dinámica (no puede ser estática)
export const dynamic = 'force-dynamic';

export async function GET(_request: Request) {
  // Solo administradores pueden verificar la configuración
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return apiError("UNAUTHENTICATED", "No autenticado", 401);
  }

  const profile = await getCurrentProfile(user.id);

  if (!profile || (profile.role !== "admin" && profile.role !== "owner")) {
    return apiError("UNAUTHORIZED", "No autorizado", 401);
  }

  try {
    const verification = await verifySupabaseSetup();

    const allGood =
      verification.storage.bucketExists &&
      verification.storage.policiesCount >= 4 &&
      verification.realtime.enabled &&
      verification.rls.notificationsPolicies >= 3;

    return apiSuccess({
      ok: allGood,
      ...verification,
      message: allGood
        ? "Supabase está correctamente configurado"
        : "Algunas configuraciones faltan. Revisa la documentación.",
    });
  } catch (error: any) {
    console.error("Error verifying Supabase setup:", error);
    return apiError("VERIFICATION_FAILED", error.message, 500);
  }
}
