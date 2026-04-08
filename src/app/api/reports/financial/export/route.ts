import { NextResponse } from "next/server";
import { apiError, apiSuccess } from "@/lib/api-response";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { generateFinancialPDF } from "@/lib/reports/pdf-generator";
import { calculateFinancialStats, calculateMonthlyRevenue, analyzeDelinquency } from "@/lib/reports/financial-calculator";
import { db } from "@/db";
import { academies } from "@/db/schema";
import { eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import type { FinancialReportFilters } from "@/lib/reports/financial-calculator";

// Forzar ruta dinámica
export const dynamic = 'force-dynamic';

const exportSchema = z.object({
  academyId: z.string().uuid(),
  format: z.enum(["pdf", "excel"]).default("pdf"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

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
  };

  const validated = exportSchema.parse({
    ...params,
    academyId: params.academyId || undefined,
  });

  if (!validated.academyId) {
    return apiError("ACADEMY_ID_REQUIRED", "Academy ID is required", 400);
  }

  const filters: FinancialReportFilters = {
    academyId: validated.academyId,
    tenantId: context.tenantId,
    startDate: validated.startDate ? new Date(validated.startDate) : undefined,
    endDate: validated.endDate ? new Date(validated.endDate) : undefined,
  };

  try {
    const [stats, monthly, delinquency] = await Promise.all([
      calculateFinancialStats(filters),
      calculateMonthlyRevenue(filters),
      analyzeDelinquency(filters),
    ]);

    if (validated.format === "excel") {
      const workbook = XLSX.utils.book_new();

      // Hoja de resumen
      const summarySheet = XLSX.utils.json_to_sheet([
        { Métrica: "Ingresos Totales", Valor: `${stats.totalRevenue.toFixed(2)} €` },
        { Métrica: "Pagado", Valor: `${stats.paidAmount.toFixed(2)} €` },
        { Métrica: "Pendiente", Valor: `${stats.pendingAmount.toFixed(2)} €` },
        { Métrica: "Vencido", Valor: `${stats.overdueAmount.toFixed(2)} €` },
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
            "Ingresos Totales (€)": m.revenue,
            "Pagado (€)": m.paid,
            "Pendiente (€)": m.pending,
          }))
        );
        XLSX.utils.book_append_sheet(workbook, monthlySheet, "Ingresos Mensuales");
      }

      // Hoja de morosidad
      if (delinquency.length > 0) {
        const delinquencySheet = XLSX.utils.json_to_sheet(
          delinquency.map((d) => ({
            Atleta: d.athleteName,
            "Total Vencido (€)": d.totalOverdue,
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
      // Obtener nombre de la academia
      let academyName = "Academia";
      const [academy] = await db
        .select({ name: academies.name })
        .from(academies)
        .where(eq(academies.id, validated.academyId))
        .limit(1);
      if (academy?.name) {
        academyName = academy.name;
      }

      // PDF
      const period = validated.startDate && validated.endDate
        ? `${validated.startDate} - ${validated.endDate}`
        : "Todos los períodos";

      const pdfBuffer = await generateFinancialPDF({
        title: "Reporte Financiero",
        academyName: academyName,
        period,
        revenue: stats.totalRevenue,
        pending: stats.pendingAmount,
        paid: stats.paidAmount,
      });

      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="reporte-financiero.pdf"`,
        },
      });
    }
  } catch (error: any) {
    console.error("Error exporting financial report:", error);
    return apiError("EXPORT_FAILED", error.message, 500);
  }
});

