import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { generateFinancialPDF } from "@/lib/reports/pdf-generator";
import { calculateFinancialStats, calculateMonthlyRevenue, analyzeDelinquency } from "@/lib/reports/financial-calculator";
import { db } from "@/db";
import { academies } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import type { FinancialReportFilters } from "@/lib/reports/financial-calculator";
import { logger } from "@/lib/logger";
import { getCurrencyForCountry } from "@/lib/currency";
import { reportDateSchema, validateReportPeriod } from "@/lib/reports/query-schemas";

// Forzar ruta dinámica
export const dynamic = 'force-dynamic';

const exportSchema = z.object({
  academyId: z.string().uuid(),
  format: z.enum(["pdf", "excel"]).default("pdf"),
  startDate: reportDateSchema,
  endDate: reportDateSchema,
  sportConfigId: z.string().uuid().optional(),
}).superRefine(validateReportPeriod);

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }

  const url = new URL(request.url);
  const params = {
    academyId: url.searchParams.get("academyId"),
    format: url.searchParams.get("format") || "pdf",
    startDate: url.searchParams.get("startDate"),
    endDate: url.searchParams.get("endDate"),
    sportConfigId: url.searchParams.get("sportConfigId"),
  };

  const parsed = exportSchema.safeParse({
    ...params,
    academyId: params.academyId || undefined,
  });
  if (!parsed.success) {
    return apiError("INVALID_QUERY", "Parámetros del reporte inválidos", 400);
  }
  const validated = parsed.data;

  if (!validated.academyId) {
    return apiError("ACADEMY_ID_REQUIRED", "Academy ID is required", 400);
  }

  const filters: FinancialReportFilters = {
    academyId: validated.academyId,
    tenantId: context.tenantId,
    startDate: validated.startDate ? new Date(validated.startDate) : undefined,
    endDate: validated.endDate ? new Date(validated.endDate) : undefined,
    sportConfigId: validated.sportConfigId,
  };

  try {
    const [academy] = await db
      .select({ name: academies.name, country: academies.country, countryCode: academies.countryCode })
      .from(academies)
      .where(and(eq(academies.id, validated.academyId), eq(academies.tenantId, context.tenantId)))
      .limit(1);
    const currency = getCurrencyForCountry(academy?.countryCode ?? academy?.country);

    const [stats, monthly, delinquency] = await Promise.all([
      calculateFinancialStats(filters),
      calculateMonthlyRevenue(filters),
      analyzeDelinquency(filters),
    ]);

    if (validated.format === "excel") {
      const workbook = XLSX.utils.book_new();

      // Hoja de resumen
      const summarySheet = XLSX.utils.json_to_sheet([
        { Métrica: "Ingresos Totales", Valor: `${stats.totalRevenue.toFixed(2)} ${currency}` },
        { Métrica: "Pagado", Valor: `${stats.paidAmount.toFixed(2)} ${currency}` },
        { Métrica: "Pendiente", Valor: `${stats.pendingAmount.toFixed(2)} ${currency}` },
        { Métrica: "Vencido", Valor: `${stats.overdueAmount.toFixed(2)} ${currency}` },
        { Métrica: "Total Cargos", Valor: stats.totalCharges },
        { Métrica: "Cargos Pagados", Valor: stats.paidCharges },
        { Métrica: "Cargos Pendientes", Valor: stats.pendingCharges },
        { Métrica: "Cargos Vencidos", Valor: stats.overdueCharges },
        { Métrica: "Tiempo Promedio de Pago", Valor: `${stats.averagePaymentTime} días` },
      ]);
      XLSX.utils.book_append_sheet(workbook, summarySheet, "Resumen");

      // Hoja de ingresos mensuales
      if (monthly.length > 0) {
        const monthlySheet = XLSX.utils.json_to_sheet(
          monthly.map((m) => ({
            Mes: m.month,
            [`Ingresos Totales (${currency})`]: m.revenue,
            [`Pagado (${currency})`]: m.paid,
            [`Pendiente (${currency})`]: m.pending,
          }))
        );
        XLSX.utils.book_append_sheet(workbook, monthlySheet, "Ingresos Mensuales");
      }

      if (stats.bySportConfig && stats.bySportConfig.length > 0) {
        const sportSheet = XLSX.utils.json_to_sheet(
          stats.bySportConfig.map((item) => ({
            Rama: item.label,
            [`Ingresos Totales (${currency})`]: item.totalRevenue,
            [`Pagado (${currency})`]: item.paidAmount,
            [`Pendiente (${currency})`]: item.pendingAmount,
            [`Morosidad (${currency})`]: item.overdueAmount,
            Cargos: item.totalCharges,
            "Cargos Pagados": item.paidCharges,
            "Cargos Pendientes": item.pendingCharges,
            "Cargos Vencidos": item.overdueCharges,
            "Becas Activas": item.activeScholarships,
            [`Descuentos (${currency})`]: item.discountAmount,
            [`Coste entrenadores (${currency})`]: item.coachCostAmount,
            [`Gastos directos (${currency})`]: item.directExpenseAmount,
            [`Gastos generales asignados (${currency})`]: item.allocatedAcademyExpenseAmount,
            [`Coste estimado (${currency})`]: item.estimatedCostAmount,
            [`Margen estimado (${currency})`]: item.estimatedMarginAmount,
            "Margen (%)": item.estimatedMarginRate === null ? "" : Math.round(item.estimatedMarginRate * 10000) / 100,
            Estado: item.profitabilityStatus,
          }))
        );
        XLSX.utils.book_append_sheet(workbook, sportSheet, "Por Rama");
      }

      // Hoja de morosidad
      if (delinquency.length > 0) {
        const delinquencySheet = XLSX.utils.json_to_sheet(
          delinquency.map((d) => ({
            Atleta: d.athleteName,
            Rama: d.sportConfigLabel,
            [`Total Vencido (${currency})`]: d.totalOverdue,
            "Cargos Vencidos": d.overdueCharges,
            "Más Antiguo": d.oldestOverdue
              ? new Date(d.oldestOverdue).toLocaleDateString("es-ES")
              : "",
          }))
        );
        XLSX.utils.book_append_sheet(workbook, delinquencySheet, "Morosidad");
      }

      const excelBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

      return new NextResponse(excelBuffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="reporte-financiero.xlsx"`,
        },
      });
    } else {
      // PDF
      const period = validated.startDate && validated.endDate
        ? `${validated.startDate} - ${validated.endDate}`
        : "Todos los períodos";

      const pdfBuffer = await generateFinancialPDF({
        title: "Reporte Financiero",
        academyName: academy?.name ?? "Academia",
        period,
        revenue: stats.totalRevenue,
        pending: stats.pendingAmount,
        paid: stats.paidAmount,
        currency,
      });

      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="reporte-financiero.pdf"`,
        },
      });
    }
  } catch (error: unknown) {
    logger.error("Error exporting financial report:", error);
    return apiError("EXPORT_FAILED", "Error al exportar los datos", 500);
  }
});
