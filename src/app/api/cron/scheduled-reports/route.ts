import { and, eq, inArray, lte } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, scheduledReports } from "@/db/schema";
import { apiSuccess } from "@/lib/api-response";
import { requireCronAuth } from "@/lib/cron-auth";
import { runCronWithLease } from "@/lib/cron-lease";
import { sendEmailWithLogging } from "@/lib/email/email-service";
import { logger } from "@/lib/logger";
import { isFeatureEnabled } from "@/lib/product/features";
import { calculateGeneralAttendance } from "@/lib/reports/attendance-calculator";
import { calculateFinancialStats } from "@/lib/reports/financial-calculator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const recipientsSchema = z.array(z.string().email()).max(20);

function parseObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function nextRunAt(schedule: Record<string, unknown>, from = new Date()) {
  const next = new Date(from);
  const [hour, minute] = String(schedule.hour ?? "09:00").split(":").map(Number);
  next.setSeconds(0, 0);
  next.setHours(hour || 0, minute || 0, 0, 0);
  const frequency = String(schedule.frequency ?? "weekly");
  if (frequency === "daily") {
    if (next <= from) next.setDate(next.getDate() + 1);
  } else if (frequency === "weekly") {
    const target = Number(schedule.dayOfWeek ?? 1);
    let delta = (target - next.getDay() + 7) % 7;
    if (delta === 0 && next <= from) delta = 7;
    next.setDate(next.getDate() + delta);
  } else {
    next.setDate(Number(schedule.dayOfMonth ?? 1));
    if (next <= from) next.setMonth(next.getMonth() + 1);
  }
  return next;
}

function periodFor(schedule: Record<string, unknown>, now: Date) {
  const start = new Date(now);
  const frequency = String(schedule.frequency ?? "weekly");
  if (frequency === "daily") start.setDate(start.getDate() - 1);
  else if (frequency === "monthly") start.setMonth(start.getMonth() - 1);
  else start.setDate(start.getDate() - 7);
  return { startDate: start, endDate: now };
}

function htmlEscape(value: unknown) {
  return String(value ?? "").replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char] ?? char);
}

async function buildSummary(row: typeof scheduledReports.$inferSelect, academyName: string) {
  let parsedSchedule: unknown = {};
  try { parsedSchedule = JSON.parse(row.schedule); } catch { parsedSchedule = {}; }
  const schedule = parseObject(parsedSchedule);
  const params = parseObject(row.params);
  const period = periodFor(schedule, new Date());
  return { schedule, params, period, academyName };
}

export async function POST(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;
  if (!isFeatureEnabled("scheduledReports")) return apiSuccess({ skipped: true, reason: "FEATURE_DISABLED" });

  const execution = await runCronWithLease("cron:scheduled-reports", async () => {
    const due = await db.select({ report: scheduledReports, academyName: academies.name, tenantId: academies.tenantId })
      .from(scheduledReports)
      .innerJoin(academies, eq(academies.id, scheduledReports.academyId))
      .where(and(
        eq(scheduledReports.isActive, "true"),
        inArray(academies.status, ["active", "trial"]),
        lte(scheduledReports.nextRunAt, new Date())
      ))
      .limit(100);
    let sent = 0;
    let failed = 0;
    for (const item of due) {
      const row = item.report;
      try {
        const summary = await buildSummary(row, item.academyName);
        const recipients = recipientsSchema.safeParse(parseObject(row.params).recipients);
        if (!recipients.success || recipients.data.length === 0) throw new Error("REPORT_RECIPIENTS_INVALID");
        const range = summary.period;
        let metrics: Record<string, unknown>;
        if (row.reportType === "attendance") {
          metrics = { ...await calculateGeneralAttendance({ academyId: row.academyId, tenantId: item.tenantId, ...range }) };
        } else if (row.reportType === "financial") {
          metrics = { ...await calculateFinancialStats({ academyId: row.academyId, tenantId: item.tenantId, ...range }) };
        } else {
          metrics = { nota: "El resumen de eventos se consulta desde el exportador de eventos." };
        }
        const rows = Object.entries(metrics).filter(([, value]) => typeof value !== "object").map(([key, value]) => `<tr><td>${htmlEscape(key)}</td><td>${htmlEscape(value)}</td></tr>`).join("");
        const html = `<h2>${htmlEscape(row.name)}</h2><p>${htmlEscape(item.academyName)} · ${range.startDate.toLocaleDateString("es-ES")} – ${range.endDate.toLocaleDateString("es-ES")}</p><table><tbody>${rows}</tbody></table>`;
        for (const recipient of recipients.data) {
          const delivered = await sendEmailWithLogging({ to: recipient, subject: `${row.name} · ${item.academyName}`, html, template: `scheduled_report:${row.id}`, tenantId: item.tenantId, academyId: row.academyId, dedupeKey: `scheduled-report:${row.id}:${row.nextRunAt?.toISOString()}:${recipient}` });
          if (delivered) sent++;
        }
        await db.update(scheduledReports).set({ lastRunAt: new Date(), nextRunAt: nextRunAt(summary.schedule) }).where(eq(scheduledReports.id, row.id));
      } catch (error) {
        failed++;
        logger.error("Scheduled report failed", error, { reportId: row.id });
      }
    }
    return { processed: due.length, sent, failed };
  });
  if (!execution.acquired) return apiSuccess({ skipped: true, reason: "ALREADY_RUNNING" });
  return apiSuccess(execution.value ?? { processed: 0, sent: 0, failed: 0 });
}
