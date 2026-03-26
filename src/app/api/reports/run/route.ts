import { NextResponse } from "next/server";
import { eq, and, lte, sql, desc } from "drizzle-orm";

import { db } from "@/db";
import { scheduledReports, academies } from "@/db/schema";
import { generateAttendancePDF } from "@/lib/reports/pdf-generator";
import { generateFinancialPDF } from "@/lib/reports/pdf-generator";
import { generateEventsPDF } from "@/lib/reports/pdf-generator";

// Forzar ruta dinámica
export const dynamic = 'force-dynamic';

// Endpoint para ejecutar reportes programados
// Este endpoint debería ser llamado por un cron job (ej. Vercel Cron, GitHub Actions, etc.)
// Ejemplo: curl -X POST https://tu-dominio.com/api/reports/run?key=tu-secret-key

const CRON_SECRET = process.env.CRON_SECRET || "dev-secret-key";

export const POST = async (request: Request) => {
  const url = new URL(request.url);
  const secretKey = url.searchParams.get("key");

  // Verificar secret key para prevenir ejecución no autorizada
  if (secretKey !== CRON_SECRET && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const now = new Date();

  // Obtener reportes pendientes (activos y con nextRun <= ahora)
  const pendingReports = await db
    .select()
    .from(scheduledReports)
    .where(
      and(
        eq(scheduledReports.active, true),
        lte(scheduledReports.nextRun, now)
      )
    )
    .orderBy(desc(scheduledReports.nextRun))
    .limit(50); // Limitar a 50 por ejecución

  if (pendingReports.length === 0) {
    return NextResponse.json({
      message: "No pending reports to run",
      executed: 0,
    });
  }

  const results = [];

  for (const report of pendingReports) {
    try {
      // Obtener datos de la academia
      const [academy] = await db
        .select({ name: academies.name })
        .from(academies)
        .where(eq(academies.id, report.academyId))
        .limit(1);

      const academyName = academy?.name || "Academia";

      // Generar reporte según el tipo
      let pdfBuffer: Buffer | null = null;
      let reportData: any = null;

      switch (report.reportType) {
        case "attendance":
          // Por defecto, últimos 30 días
          const startDate = new Date(now);
          startDate.setDate(startDate.getDate() - 30);

          reportData = {
            title: `Reporte de Asistencia - ${academyName}`,
            academyName,
            stats: {
              totalSessions: 0,
              present: 0,
              absent: 0,
              late: 0,
              excused: 0,
              attendanceRate: 0,
            },
            details: [],
          };
          pdfBuffer = await generateAttendancePDF(reportData);
          break;

        case "financial":
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          reportData = {
            title: `Reporte Financiero - ${academyName}`,
            academyName,
            period: monthStart.toLocaleDateString("es-ES", { month: "long", year: "numeric" }),
            revenue: 0,
            pending: 0,
            paid: 0,
          };
          pdfBuffer = await generateFinancialPDF(reportData);
          break;

        case "events":
          const yearStart = new Date(now.getFullYear(), 0, 1);
          reportData = {
            title: `Reporte de Eventos - ${academyName}`,
            academyName,
            period: now.getFullYear().toString(),
            events: [],
            summary: {
              total: 0,
              upcoming: 0,
              completed: 0,
              totalRegistrations: 0,
            },
          };
          pdfBuffer = await generateEventsPDF(reportData);
          break;

        default:
          console.log(`Report type ${report.reportType} not yet implemented for scheduled execution`);
          continue;
      }

      if (!pdfBuffer) continue;

      // Enviar email con el reporte adjunto
      // Por ahora, solo logueamos. En producción, usar un servicio de email
      console.log(`Sending scheduled report "${report.name}" to: ${report.recipients.join(", ")}`);

      // En producción, aquí llamarías a un servicio de email como:
      // await sendEmail({
      //   to: report.recipients,
      //   subject: `Reporte: ${report.name}`,
      //   text: `Se adjunta el reporte ${report.name} generado automáticamente.`,
      //   attachments: [{ filename: `reporte.${report.format}`, data: pdfBuffer }],
      // });

      // Actualizar lastRun y calcular próxima ejecución
      const nextRun = calculateNextRun(
        report.frequency,
        report.dayOfWeek || undefined,
        report.dayOfMonth || undefined,
        report.hour || undefined
      );

      await db
        .update(scheduledReports)
        .set({
          lastRun: now,
          nextRun,
          updatedAt: now,
        })
        .where(eq(scheduledReports.id, report.id));

      results.push({
        id: report.id,
        name: report.name,
        status: "success",
        recipients: report.recipients.length,
      });
    } catch (error) {
      console.error(`Error running scheduled report ${report.id}:`, error);
      results.push({
        id: report.id,
        name: report.name,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({
    message: `Executed ${results.length} scheduled reports`,
    results,
  });
};

// Función auxiliar para calcular próxima ejecución
function calculateNextRun(
  frequency: "daily" | "weekly" | "monthly",
  dayOfWeek?: string,
  dayOfMonth?: string,
  hour?: string
): Date {
  const now = new Date();
  const [hourNum] = (hour || "09:00").split(":").map(Number);

  let next = new Date(now);
  next.setHours(hourNum, 0, 0, 0);

  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  switch (frequency) {
    case "daily":
      break;
    case "weekly":
      if (dayOfWeek) {
        const targetDay = parseInt(dayOfWeek);
        const currentDay = next.getDay();
        let daysToAdd = targetDay - currentDay;
        if (daysToAdd <= 0) daysToAdd += 7;
        next.setDate(next.getDate() + daysToAdd);
      }
      break;
    case "monthly":
      if (dayOfMonth) {
        const targetDay = parseInt(dayOfMonth);
        next.setDate(targetDay);
        if (next <= now) {
          next.setMonth(next.getMonth() + 1);
        }
      }
      break;
  }

  return next;
}
