import { apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { isFeatureEnabled } from "@/lib/product/features";
<<<<<<< HEAD
import { getAcademyPlanGate } from "@/lib/plans/gate";

export const dynamic = 'force-dynamic';

async function requireGrowthPlan(academyId: string | undefined) {
  if (!academyId) return null;
  const gate = await getAcademyPlanGate(academyId);
  if (!gate.allowedForGrowth) {
    return apiError(
      "UPGRADE_REQUIRED",
      "Reportes programados requieren plan Growth. Actualiza para desbloquear automatizaciones y reportes ejecutivos.",
      402
    );
  }
  return null;
}

export const GET = withTenant(async (_req, ctx) => {
  const academyId = (ctx as unknown as { params?: { academyId?: string } })?.params?.academyId;
  const planError = await requireGrowthPlan(academyId);
  if (planError) return planError;
=======

export const dynamic = 'force-dynamic';

export const GET = withTenant(async () => {
>>>>>>> origin/main
  if (!isFeatureEnabled("scheduledReports")) {
    return apiError("FEATURE_DISABLED", "Reportes programados no disponibles en esta versión", 404);
  }

  return apiSuccess({ items: [], total: 0 });
});

<<<<<<< HEAD
export const POST = withTenant(async (_req, ctx) => {
  const academyId = (ctx as unknown as { params?: { academyId?: string } })?.params?.academyId;
  const planError = await requireGrowthPlan(academyId);
  if (planError) return planError;
=======
export const POST = withTenant(async () => {
>>>>>>> origin/main
  if (!isFeatureEnabled("scheduledReports")) {
    return apiError("FEATURE_DISABLED", "Reportes programados no disponibles en esta versión", 404);
  }

  return apiError("FEATURE_DISABLED", "La programación de reportes requiere habilitación del producto", 404);
});
