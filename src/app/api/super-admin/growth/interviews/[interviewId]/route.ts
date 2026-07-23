import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { commercialInterviews } from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { logAdminAction } from "@/lib/admin-logs";
import { withSuperAdmin } from "@/lib/authz";
import { CommercialInterviewInputSchema } from "@/lib/growth/contracts";
import { toCommercialInterviewValues } from "@/lib/growth/interviews";

const ParamsSchema = z.object({ interviewId: z.string().uuid() });

/** @resource-scope super-admin — withSuperAdmin verifies the global authority. */

export const PUT = withSuperAdmin(async (request, context) => {
  const params = ParamsSchema.safeParse(context.params);
  if (!params.success) {
    return apiError("VALIDATION_ERROR", "Identificador de entrevista inválido", 400);
  }

  const json = await request.json().catch(() => null);
  const parsed = CommercialInterviewInputSchema.safeParse(json);
  if (!parsed.success) {
    return apiError(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Entrevista inválida",
      400
    );
  }

  try {
    const [interview] = await db
      .update(commercialInterviews)
      .set({
        ...toCommercialInterviewValues(parsed.data),
        updatedByProfileId: context.profile.id,
        updatedAt: new Date(),
      })
      .where(eq(commercialInterviews.id, params.data.interviewId))
      .returning({ id: commercialInterviews.id });

    if (!interview) {
      return apiError("INTERVIEW_NOT_FOUND", "Entrevista no encontrada", 404);
    }

    await logAdminAction({
      userId: context.userId,
      tenantId: null,
      action: "growth.interview_updated",
      module: "growth",
      resourceType: "commercial_interview",
      resourceId: interview.id,
      resourceName: parsed.data.academyName,
      description: `Entrevista comercial actualizada para ${parsed.data.academyName}`,
      meta: { status: parsed.data.status },
    });

    return apiSuccess({ id: interview.id });
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error ? String(error.code) : null;
    if (code === "23505") {
      return apiError(
        "INTERVIEW_ALREADY_EXISTS",
        "Ya existe otra entrevista para esta academia y ubicación",
        409
      );
    }
    throw error;
  }
});
