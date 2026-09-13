import { apiSuccess, apiError } from "@/lib/api-response";
import { withSuperAdmin } from "@/lib/authz";
import { syncAthletesWithUsers } from "@/lib/athletes/sync-users";
import { logAdminAction } from "@/lib/admin-logs";
import { logger } from "@/lib/logger";

/**
 * Endpoint para sincronizar atletas con usuarios
 * POST /api/super-admin/athletes/sync-users
 */
export const POST = withSuperAdmin(async (_request, context) => {
  try {
    const result = await syncAthletesWithUsers();

    await logAdminAction({
      userId: context.userId,
      tenantId: null,
      action: "athletes.users_synced",
      resourceType: "athletes",
      description: "Super Admin sincronizó los perfiles de atletas con las cuentas de usuario",
      meta: result,
      status: result.errors > 0 ? "warning" : "success",
    });
    
    return apiSuccess({
      ok: true,
      message: `Sincronización completada: ${result.synced} atletas sincronizados, ${result.errors} errores`,
      ...result,
    });
  } catch (error: unknown) {
    logger.error("Error en sincronización de atletas:", error);
    return apiError("SYNC_FAILED", "Error al sincronizar atletas con usuarios", 500);
  }
});
