import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, sql } from "drizzle-orm";

import { db } from "@/db";
import { scheduledReports } from "@/db/schema";
import { withTenant } from "@/lib/authz";

// Forzar ruta dinámica
export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  frequency: z.enum(["daily", "weekly", "monthly"]).optional(),
  dayOfWeek: z.string().optional(),
  dayOfMonth: z.string().optional(),
  hour: z.string().optional(),
  format: z.enum(["pdf", "excel"]).optional(),
  filters: z.string().optional(),
  recipients: z.array(z.string().email()).optional(),
  active: z.boolean().optional(),
});

// GET - Obtener un scheduled report
export const GET = withTenant(async (_request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const reportId = (context.params as { id?: string })?.id;
  if (!reportId) {
    return NextResponse.json({ error: "ID_REQUIRED" }, { status: 400 });
  }

  const [report] = await db
    .select()
    .from(scheduledReports)
    .where(
      and(
        eq(scheduledReports.id, reportId),
        eq(scheduledReports.tenantId, context.tenantId)
      )
    )
    .limit(1);

  if (!report) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json(report);
});

// PUT - Actualizar scheduled report
export const PUT = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const reportId = (context.params as { id?: string })?.id;
  if (!reportId) {
    return NextResponse.json({ error: "ID_REQUIRED" }, { status: 400 });
  }

  const body = await request.json();
  const validated = updateSchema.parse(body);

  // Verificar que existe
  const [existing] = await db
    .select()
    .from(scheduledReports)
    .where(
      and(
        eq(scheduledReports.id, reportId),
        eq(scheduledReports.tenantId, context.tenantId)
      )
    )
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // Recalcular nextRun si cambió la frecuencia o fecha
  let nextRun = existing.nextRun;
  if (validated.frequency || validated.dayOfWeek || validated.dayOfMonth || validated.hour) {
    const now = new Date();
    const [hourNum] = (validated.hour || existing.hour || "09:00").split(":").map(Number);
    nextRun = new Date(now);
    nextRun.setHours(hourNum, 0, 0, 0);

    const frequency = validated.frequency || existing.frequency;
    const dayOfWeek = validated.dayOfWeek || existing.dayOfWeek;
    const dayOfMonth = validated.dayOfMonth || existing.dayOfMonth;

    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    if (frequency === "weekly" && dayOfWeek) {
      const targetDay = parseInt(dayOfWeek);
      const currentDay = nextRun.getDay();
      let daysToAdd = targetDay - currentDay;
      if (daysToAdd <= 0) daysToAdd += 7;
      nextRun.setDate(nextRun.getDate() + daysToAdd);
    } else if (frequency === "monthly" && dayOfMonth) {
      const targetDay = parseInt(dayOfMonth);
      nextRun.setDate(targetDay);
      if (nextRun <= now) {
        nextRun.setMonth(nextRun.getMonth() + 1);
      }
    }
  }

  const [updated] = await db
    .update(scheduledReports)
    .set({
      ...validated,
      nextRun,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(scheduledReports.id, reportId),
        eq(scheduledReports.tenantId, context.tenantId)
      )
    )
    .returning();

  return NextResponse.json(updated);
});

// DELETE - Eliminar scheduled report
export const DELETE = withTenant(async (_request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const reportId = (context.params as { id?: string })?.id;
  if (!reportId) {
    return NextResponse.json({ error: "ID_REQUIRED" }, { status: 400 });
  }

  const [deleted] = await db
    .delete(scheduledReports)
    .where(
      and(
        eq(scheduledReports.id, reportId),
        eq(scheduledReports.tenantId, context.tenantId)
      )
    )
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
});
