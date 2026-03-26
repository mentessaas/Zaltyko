import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";

import { db } from "@/db";
import { scheduledReports } from "@/db/schema";
import { withTenant } from "@/lib/authz";

// Forzar ruta dinámica
export const dynamic = 'force-dynamic';

// Schema para crear/actualizar scheduled report
const createSchema = z.object({
  academyId: z.string().uuid(),
  reportType: z.enum(["attendance", "financial", "progress", "class", "coach", "churn", "events"]),
  name: z.string().min(1),
  description: z.string().optional(),
  frequency: z.enum(["daily", "weekly", "monthly"]),
  dayOfWeek: z.string().optional(), // 0-6
  dayOfMonth: z.string().optional(), // 1-31
  hour: z.string().default("09:00"),
  format: z.enum(["pdf", "excel"]).default("pdf"),
  filters: z.string().optional(), // JSON string
  recipients: z.array(z.string().email()),
  active: z.boolean().default(true),
});

const updateSchema = createSchema.partial();

// Calcular próxima ejecución
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
      // Ya está configurado para mañana a la hora especificada
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

// GET - Listar scheduled reports
export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const url = new URL(request.url);
  const academyId = url.searchParams.get("academyId");
  const active = url.searchParams.get("active");

  const conditions = [
    eq(scheduledReports.tenantId, context.tenantId),
    academyId ? eq(scheduledReports.academyId, academyId) : undefined,
    active !== null ? eq(scheduledReports.active, active === "true") : undefined,
  ].filter(Boolean);

  let whereClause: ReturnType<typeof sql> | undefined;
  for (const condition of conditions) {
    whereClause = whereClause ? and(whereClause, condition) : condition;
  }

  const reports = await db
    .select()
    .from(scheduledReports)
    .where(whereClause)
    .orderBy(desc(scheduledReports.createdAt));

  return NextResponse.json(reports);
});

// POST - Crear scheduled report
export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const body = await request.json();
  const validated = createSchema.parse(body);

  const nextRun = calculateNextRun(
    validated.frequency,
    validated.dayOfWeek,
    validated.dayOfMonth,
    validated.hour
  );

  const [created] = await db
    .insert(scheduledReports)
    .values({
      tenantId: context.tenantId,
      academyId: validated.academyId,
      reportType: validated.reportType,
      name: validated.name,
      description: validated.description,
      frequency: validated.frequency,
      dayOfWeek: validated.dayOfWeek,
      dayOfMonth: validated.dayOfMonth,
      hour: validated.hour,
      format: validated.format,
      filters: validated.filters,
      recipients: validated.recipients,
      active: validated.active,
      nextRun,
      createdBy: context.userId,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
});
