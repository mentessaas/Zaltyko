import { apiSuccess } from "@/lib/api-response";
import { withSuperAdmin } from "@/lib/authz";
import {
  competenciaErrorResponse,
  logCompetenciaAction,
} from "@/lib/competencia/api";
import { applyCompetitiveSeed } from "@/lib/competencia/mutations";
import { loadCompetitiveSeed } from "@/lib/competencia/seed";

/**
 * Carga la semilla versionada del repositorio. Idempotente: solo inserta lo que
 * falta, por lo que repetirla no pisa ediciones hechas desde el panel.
 * @resource-scope super-admin — withSuperAdmin verifies the global authority.
 */
export const POST = withSuperAdmin(async (_request, context) => {
  try {
    const seed = loadCompetitiveSeed();
    const report = await applyCompetitiveSeed(seed, context.profile.id);
    await logCompetenciaAction({
      userId: context.userId,
      action: "seed_applied",
      resourceType: "ci_seed",
      resourceId: context.profile.id,
      resourceName: seed.version,
      description: `Semilla de competencia ${seed.version} aplicada`,
    });
    return apiSuccess({ version: seed.version, report });
  } catch (error) {
    return competenciaErrorResponse(error);
  }
});
