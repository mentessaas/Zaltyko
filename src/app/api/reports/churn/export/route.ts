import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";

import { withTenant } from "@/lib/authz";
import { apiError } from "@/lib/api-response";
import { calculateChurnReport } from "@/lib/reports/churn-report";
import { createReportWorkbook, generateReportTablePdf } from "@/lib/reports/report-export";
import { db } from "@/db";
import { academies } from "@/db/schema";
import { logger } from "@/lib/logger";
import { reportDateSchema, validateReportPeriod } from "@/lib/reports/query-schemas";

export const dynamic = "force-dynamic";

const exportSchema = z.object({
  academyId: z.string().uuid(),
  format: z.enum(["pdf", "excel"]).default("pdf"),
  startDate: reportDateSchema,
  endDate: reportDateSchema,
  sportConfigId: z.string().uuid().optional(),
}).superRefine(validateReportPeriod);

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
  const parsed = exportSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
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
    const table = {
      headers: ["Atleta", "Fecha de baja", "Motivo", "Meses activo"],
      rows: stats.recentChurns.map((item) => [item.athleteName, item.churnDate ? new Date(item.churnDate).toLocaleDateString("es-ES") : "—", item.reason, item.monthsActive ?? "—"]),
    };

    if (input.format === "excel") {
      const workbook = createReportWorkbook([
        { name: "Resumen", rows: [
          { Métrica: "Bajas", Valor: stats.totalChurned },
          { Métrica: "Tasa de bajas (%)", Valor: stats.churnRate },
          { Métrica: "Bajas voluntarias", Valor: stats.voluntaryChurn },
          { Métrica: "Bajas involuntarias", Valor: stats.involuntaryChurn },
        ] },
        { name: "Motivos", rows: stats.reasons.map((item) => ({ Motivo: item.reason, Casos: item.count, Porcentaje: `${item.percentage}%` })) },
        { name: "Bajas recientes", rows: stats.recentChurns.map((item) => ({
          Atleta: item.athleteName,
          "Fecha de baja": item.churnDate ? new Date(item.churnDate).toLocaleDateString("es-ES") : "",
          Motivo: item.reason,
          "Meses activo": item.monthsActive ?? "",
        })) },
      ]);
      return new NextResponse(new Uint8Array(workbook), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": "attachment; filename=\"reporte-bajas.xlsx\"",
        },
      });
    }

    const pdf = generateReportTablePdf({
      title: "Reporte de Bajas",
      academyName: academy.name,
      period,
      summary: [
        ["Bajas", stats.totalChurned],
        ["Tasa de bajas", `${stats.churnRate}%`],
        ["Bajas voluntarias", stats.voluntaryChurn],
        ["Bajas involuntarias", stats.involuntaryChurn],
      ],
      table,
    });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=\"reporte-bajas.pdf\"",
      },
    });
  } catch (error) {
    logger.error("Error exporting churn report:", error);
    return apiError("EXPORT_FAILED", "Error al exportar el reporte", 500);
  }
});
