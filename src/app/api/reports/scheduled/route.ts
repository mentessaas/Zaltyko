import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { academies, scheduledReports } from "@/db/schema";
import { apiCreated, apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { isFeatureEnabled } from "@/lib/product/features";
import { getAcademyPlanGate } from "@/lib/plans/gate";
import { verifyAcademyAccess } from "@/lib/permissions";

export const dynamic = 'force-dynamic';

const querySchema = z.object({ academyId: z.string().uuid() });
const createSchema = z.object({
  academyId: z.string().uuid(),
  reportType: z.enum(["attendance", "financial", "events"]),
  name: z.string().trim().min(1).max(200),
  frequency: z.enum(["daily", "weekly", "monthly"]),
  dayOfWeek: z.coerce.number().int().min(0).max(6).optional(),
  dayOfMonth: z.coerce.number().int().min(1).max(28).optional(),
  hour: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  format: z.enum(["pdf", "excel"]),
  recipients: z.array(z.string().email()).min(1).max(20),
  active: z.boolean().default(true),
}).superRefine((value, ctx) => {
  if (value.frequency === "weekly" && value.dayOfWeek === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["dayOfWeek"], message: "El día semanal es obligatorio" });
  }
  if (value.frequency === "monthly" && value.dayOfMonth === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["dayOfMonth"], message: "El día mensual es obligatorio" });
  }
  // El exportador de eventos solo genera XLSX; aceptar PDF aquí produciría
  // una programación que nunca podría entregarse correctamente.
  if (value.reportType === "events" && value.format !== "excel") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["format"], message: "Los reportes de eventos requieren formato Excel" });
  }
});

function nextRunAt(input: { frequency: string; dayOfWeek?: number; dayOfMonth?: number; hour: string }) {
  const [hour, minute] = input.hour.split(":").map(Number);
  const next = new Date();
  next.setSeconds(0, 0);
  next.setHours(hour, minute, 0, 0);
  if (input.frequency === "daily") {
    if (next <= new Date()) next.setDate(next.getDate() + 1);
  } else if (input.frequency === "weekly") {
    const target = input.dayOfWeek ?? 1;
    let delta = (target - next.getDay() + 7) % 7;
    if (delta === 0 && next <= new Date()) delta = 7;
    next.setDate(next.getDate() + delta);
  } else {
    next.setDate(input.dayOfMonth ?? 1);
    if (next <= new Date()) next.setMonth(next.getMonth() + 1);
  }
  return next;
}

function parseSchedule(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function requireGrowthPlan(academyId: string) {
  if (!academyId) return null;
  const gate = await getAcademyPlanGate(academyId);
  if (!gate.allowedForGrowth) {
    return apiError(
      "UPGRADE_REQUIRED",
      "Reportes programados requieren plan Growth. Actualiza para desbloquear automatizaciones y reportes ejecutivos.",
      402
    );
  }
  return null;
}

export const GET = withTenant(async (req, ctx) => {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return apiError("INVALID_QUERY", "academyId inválido", 400);
  const academyId = parsed.data.academyId;
  if (!(await verifyAcademyAccess(academyId, ctx.tenantId)).allowed) return apiError("ACADEMY_NOT_FOUND", "Academia no encontrada", 404);
  const planError = await requireGrowthPlan(academyId);
  if (planError) return planError;
  if (!isFeatureEnabled("scheduledReports")) {
    return apiError("FEATURE_DISABLED", "Reportes programados no disponibles en esta versión", 404);
  }

  const rows = await db
    .select()
    .from(scheduledReports)
    .innerJoin(academies, and(eq(scheduledReports.academyId, academies.id), eq(academies.tenantId, ctx.tenantId)))
    .where(eq(scheduledReports.academyId, academyId))
    .orderBy(desc(scheduledReports.createdAt))
    .limit(100);
  return apiSuccess({ items: rows.map(({ scheduled_reports: row }) => {
    const schedule = parseSchedule(row.schedule);
    const params = (row.params ?? {}) as Record<string, unknown>;
    return { id: row.id, reportType: row.reportType, name: row.name, frequency: schedule.frequency ?? "weekly", dayOfWeek: schedule.dayOfWeek?.toString(), dayOfMonth: schedule.dayOfMonth?.toString(), hour: schedule.hour ?? "09:00", format: params.format ?? "pdf", recipients: Array.isArray(params.recipients) ? params.recipients : [], nextRun: row.nextRunAt?.toISOString() ?? new Date().toISOString(), lastRun: row.lastRunAt?.toISOString(), active: row.isActive === "true" };
  }), total: rows.length });
});

export const POST = withTenant(async (req, ctx) => {
  const body = createSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return apiError("INVALID_PAYLOAD", "Configuración de reporte inválida", 400);
  const { academyId, ...input } = body.data;
  if (!(await verifyAcademyAccess(academyId, ctx.tenantId)).allowed) return apiError("ACADEMY_NOT_FOUND", "Academia no encontrada", 404);
  const planError = await requireGrowthPlan(academyId);
  if (planError) return planError;
  if (!isFeatureEnabled("scheduledReports")) {
    return apiError("FEATURE_DISABLED", "Reportes programados no disponibles en esta versión", 404);
  }
  const next = nextRunAt(input);
  const [created] = await db.insert(scheduledReports).values({
    academyId,
    name: input.name,
    reportType: input.reportType,
    schedule: JSON.stringify({ frequency: input.frequency, dayOfWeek: input.dayOfWeek, dayOfMonth: input.dayOfMonth, hour: input.hour }),
    params: { format: input.format, recipients: input.recipients },
    nextRunAt: next,
    isActive: input.active ? "true" : "false",
  }).returning();
  return apiCreated({ item: created });
});
