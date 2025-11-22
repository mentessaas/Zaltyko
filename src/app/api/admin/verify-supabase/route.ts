import { NextResponse } from "next/server";
import { verifySupabaseSetup } from "@/lib/supabase/verify-setup";
import { getCurrentProfile } from "@/lib/authz";

export async function GET(request: Request) {
  // Solo administradores pueden verificar la configuración
  const profile = await getCurrentProfile(request);
  
  if (!profile || (profile.role !== "admin" && profile.role !== "owner")) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const verification = await verifySupabaseSetup();

    const allGood =
      verification.storage.bucketExists &&
      verification.storage.policiesCount >= 4 &&
      verification.realtime.enabled &&
      verification.rls.notificationsPolicies >= 3;

    return NextResponse.json({
      ok: allGood,
      ...verification,
      message: allGood
        ? "✅ Supabase está correctamente configurado"
        : "⚠️ Algunas configuraciones faltan. Revisa la documentación.",
    });
  } catch (error: any) {
    console.error("Error verifying Supabase setup:", error);
    return NextResponse.json(
      { error: "VERIFICATION_FAILED", message: error.message },
      { status: 500 }
    );
  }
}

