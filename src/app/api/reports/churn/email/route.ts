import { z } from "zod";
import { and, eq } from "drizzle-orm";

import { withTenant } from "@/lib/authz";
import { apiError, apiSuccess } from "@/lib/api-response";
import { calculateChurnReport } from "@/lib/reports/churn-report";
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
    const stats = await calculateChurnReport({
      academyId: input.academyId,
      tenantId: context.tenantId,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      endDate: input.endDate ? new Date(input.endDate) : undefined,
      sportConfigId: input.sportConfigId,
    });
    const period = [input.startDate, input.endDate].filter(Boolean).join(" – ") || "Todo el periodo";
    const sent = await sendReportEmail({
      to: input.email,
      title: "Reporte de Bajas",
      academyName: academy.name,
      academyId: input.academyId,
      tenantId: context.tenantId,
      period,
      summary: [["Bajas", stats.totalChurned], ["Tasa de bajas", `${stats.churnRate}%`], ["Bajas voluntarias", stats.voluntaryChurn], ["Bajas involuntarias", stats.involuntaryChurn]],
      table: { headers: ["Atleta", "Fecha de baja", "Motivo"], rows: stats.recentChurns.map((item) => [item.athleteName, item.churnDate ? new Date(item.churnDate).toLocaleDateString("es-ES") : "—", item.reason]) },
    });
    if (!sent) return apiError("EMAIL_NOT_SENT", "No se pudo entregar el informe", 502);
    return apiSuccess({ sent: true, to: input.email });
  } catch (error) {
    logger.error("Error emailing churn report:", error);
    return apiError("REPORT_EMAIL_FAILED", "No se pudo enviar el informe", 500);
  }
});
