import { z } from "zod";
import { and, eq } from "drizzle-orm";

import { withTenant } from "@/lib/authz";
import { apiError, apiSuccess } from "@/lib/api-response";
import { calculateCoachReport } from "@/lib/reports/coach-report";
import { sendReportEmail } from "@/lib/reports/send-report-email";
import { db } from "@/db";
import { academies } from "@/db/schema";
import { logger } from "@/lib/logger";
import { reportDateSchema, validateReportPeriod } from "@/lib/reports/query-schemas";

export const dynamic = "force-dynamic";

const emailSchema = z.object({
  academyId: z.string().uuid(),
  email: z.string().email().max(320),
  startDate: reportDateSchema,
  endDate: reportDateSchema,
  coachId: z.string().uuid().optional(),
  sportConfigId: z.string().uuid().optional(),
}).superRefine(validateReportPeriod);

export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("INVALID_JSON", "El cuerpo de la petición no es un JSON válido", 400);
  }
  const parsed = emailSchema.safeParse(payload);
  if (!parsed.success) return apiError("INVALID_QUERY", "Parámetros del reporte inválidos", 400);
  const input = parsed.data;

  try {
    const [academy] = await db
      .select({ name: academies.name })
      .from(academies)
      .where(and(eq(academies.id, input.academyId), eq(academies.tenantId, context.tenantId)))
      .limit(1);
    if (!academy) return apiError("ACADEMY_NOT_FOUND", "Academia no encontrada", 404);
    const stats = await calculateCoachReport({
      academyId: input.academyId,
      tenantId: context.tenantId,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      endDate: input.endDate ? new Date(input.endDate) : undefined,
      coachId: input.coachId,
      sportConfigId: input.sportConfigId,
    });
    const period = [input.startDate, input.endDate].filter(Boolean).join(" – ") || "Todo el periodo";
    const sent = await sendReportEmail({
      to: input.email,
      title: "Reporte de Entrenadores",
      academyName: academy.name,
      academyId: input.academyId,
      tenantId: context.tenantId,
      period,
      summary: [["Total de entrenadores", stats.totalCoaches], ["Entrenadores activos", stats.activeCoaches], ["Total de clases", stats.totalClasses], ["Asistencia media", `${stats.averageAttendance}%`]],
      table: { headers: ["Entrenador", "Clases", "Atletas", "Asistencia"], rows: stats.coachPerformance.map((item) => [item.coachName, item.classesCount, item.athletesCount, `${item.averageAttendance}%`]) },
    });
    if (!sent) return apiError("EMAIL_NOT_SENT", "No se pudo entregar el informe", 502);
    return apiSuccess({ sent: true, to: input.email });
  } catch (error) {
    logger.error("Error emailing coach report:", error);
    return apiError("REPORT_EMAIL_FAILED", "No se pudo enviar el informe", 500);
  }
});
