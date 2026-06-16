import { apiSuccess, apiError } from "@/lib/api-response";
import { withSuperAdmin } from "@/lib/authz";
import { syncAthletesWithUsers } from "@/lib/athletes/sync-users";
import { logger } from "@/lib/logger";

/**
 * Endpoint para sincronizar atletas con usuarios
 * POST /api/super-admin/athletes/sync-users
 */
export const POST = withSuperAdmin(async () => {
  try {
    const result = await syncAthletesWithUsers();
    
    return apiSuccess({
      ok: true,
      message: `Sincronización completada: ${result.synced} atletas sincronizados, ${result.errors} errores`,
      ...result,
    });
  } catch (error: any) {
    logger.error("Error en sincronización de atletas:", error);
    return apiError("SYNC_FAILED", error?.message ?? "Error al sincronizar atletas con usuarios", 500);
  }
});

