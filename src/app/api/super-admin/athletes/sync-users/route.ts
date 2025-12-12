import { NextResponse } from "next/server";
import { withSuperAdmin } from "@/lib/authz";
import { syncAthletesWithUsers } from "@/lib/athletes/sync-users";

/**
 * Endpoint para sincronizar atletas con usuarios
 * POST /api/super-admin/athletes/sync-users
 */
export const POST = withSuperAdmin(async () => {
  try {
    const result = await syncAthletesWithUsers();
    
    return NextResponse.json({
      ok: true,
      message: `Sincronización completada: ${result.synced} atletas sincronizados, ${result.errors} errores`,
      ...result,
    });
  } catch (error: any) {
    console.error("Error en sincronización de atletas:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "SYNC_FAILED",
        message: error?.message ?? "Error al sincronizar atletas con usuarios",
      },
      { status: 500 }
    );
  }
});

