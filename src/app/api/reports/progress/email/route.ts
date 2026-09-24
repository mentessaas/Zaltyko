import { z } from "zod";
import { and, eq } from "drizzle-orm";

import { withTenant } from "@/lib/authz";
import { apiError, apiSuccess } from "@/lib/api-response";
import { analyzeAthleteProgress } from "@/lib/reports/progress-analyzer";
import { sendReportEmail } from "@/lib/reports/send-report-email";
import { db } from "@/db";
import { academies, athletes } from "@/db/schema";
import { logger } from "@/lib/logger";
import { reportDateSchema, validateReportPeriod } from "@/lib/reports/query-schemas";

export const dynamic = "force-dynamic";

const emailSchema = z.object({
  academyId: z.string().uuid(),
  athleteId: z.string().uuid(),
  email: z.string().email().max(320),
  startDate: reportDateSchema,
  endDate: reportDateSchema,
  skillId: z.string().uuid().optional(),
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
    const [athlete] = await db
      .select({ name: athletes.name })
      .from(athletes)
      .where(and(eq(athletes.id, input.athleteId), eq(athletes.academyId, input.academyId), eq(athletes.tenantId, context.tenantId)))
      .limit(1);
    if (!athlete) return apiError("ATHLETE_NOT_FOUND", "Atleta no encontrado", 404);

    const report = await analyzeAthleteProgress({
      academyId: input.academyId,
      tenantId: context.tenantId,
      athleteId: input.athleteId,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      endDate: input.endDate ? new Date(input.endDate) : undefined,
      skillId: input.skillId,
      sportConfigId: input.sportConfigId,
    });
    if (!report) return apiError("NO_ASSESSMENTS_FOUND", "No hay evaluaciones para este atleta", 404);
    const period = [input.startDate, input.endDate].filter(Boolean).join(" – ") || "Todo el periodo";
    const sent = await sendReportEmail({
      to: input.email,
      title: "Reporte de Progreso",
      academyName: academy.name,
      academyId: input.academyId,
      tenantId: context.tenantId,
      period,
      summary: [["Atleta", report.athleteName || athlete.name], ["Evaluaciones", report.totalAssessments], ["Mejora general", `${report.overallImprovement.toFixed(2)} puntos`]],
      table: { headers: ["Habilidad", "Inicial", "Última", "Cambio", "Tendencia"], rows: report.skills.map((skill) => [skill.skillName, skill.firstScore ?? "—", skill.lastScore ?? "—", skill.improvement.toFixed(2), skill.trend]) },
    });
    if (!sent) return apiError("EMAIL_NOT_SENT", "No se pudo entregar el informe", 502);
    return apiSuccess({ sent: true, to: input.email });
  } catch (error) {
    logger.error("Error emailing progress report:", error);
    return apiError("REPORT_EMAIL_FAILED", "No se pudo enviar el informe", 500);
  }
});
