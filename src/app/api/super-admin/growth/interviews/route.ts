import { db } from "@/db";
import { commercialInterviews } from "@/db/schema";
import { apiCreated, apiError } from "@/lib/api-response";
import { logAdminAction } from "@/lib/admin-logs";
import { withSuperAdmin } from "@/lib/authz";
import { CommercialInterviewInputSchema } from "@/lib/growth/contracts";
import { toCommercialInterviewValues } from "@/lib/growth/interviews";

export const POST = withSuperAdmin(async (request, context) => {
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
      .insert(commercialInterviews)
      .values({
        ...toCommercialInterviewValues(parsed.data),
        createdByProfileId: context.profile.id,
        updatedByProfileId: context.profile.id,
      })
      .returning({ id: commercialInterviews.id });

    await logAdminAction({
      userId: context.userId,
      tenantId: null,
      action: "growth.interview_created",
      module: "growth",
      resourceType: "commercial_interview",
      resourceId: interview.id,
      resourceName: parsed.data.academyName,
      description: `Entrevista comercial creada para ${parsed.data.academyName}`,
      meta: { status: parsed.data.status },
    });

    return apiCreated({ id: interview.id });
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error ? String(error.code) : null;
    if (code === "23505") {
      return apiError(
        "INTERVIEW_ALREADY_EXISTS",
        "Ya existe una entrevista para esta academia y ubicación",
        409
      );
    }
    throw error;
  }
});
