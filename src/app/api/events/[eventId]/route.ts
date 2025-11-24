import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";

import { db } from "@/db";
import { events } from "@/db/schema";
import { withTenant } from "@/lib/authz";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  academyId: z.string().uuid(),
  title: z.string().min(1),
  location: z.string().optional().nullable(),
  date: z.string().optional().nullable(),
  status: z.string().optional(),
});

export const GET = withTenant(async (_request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const eventId = (context.params as { eventId?: string } | undefined)?.eventId;

  if (!eventId) {
    return NextResponse.json({ error: "EVENT_ID_REQUIRED" }, { status: 400 });
  }

  const [eventRow] = await db
    .select()
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.tenantId, context.tenantId)))
    .limit(1);

  if (!eventRow) {
    return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({
    id: eventRow.id,
    title: eventRow.title,
    date: eventRow.date?.toISOString().split("T")[0] || null,
    location: eventRow.location,
    status: eventRow.status,
    academyId: eventRow.academyId,
    createdAt: eventRow.createdAt?.toISOString(),
  });
});

export const PUT = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const eventId = (context.params as { eventId?: string } | undefined)?.eventId;

  if (!eventId) {
    return NextResponse.json({ error: "EVENT_ID_REQUIRED" }, { status: 400 });
  }

  const body = updateSchema.parse(await request.json());

  // Validar que el evento existe y pertenece al tenant
  const [eventRow] = await db
    .select({
      id: events.id,
    })
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.tenantId, context.tenantId)))
    .limit(1);

  if (!eventRow) {
    return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });
  }

  // Actualizar evento
  await db
    .update(events)
    .set({
      title: body.title,
      location: body.location || null,
      date: body.date ? new Date(body.date) : null,
      status: body.status || "draft",
    })
    .where(eq(events.id, eventId));

  return NextResponse.json({ ok: true });
});

export const DELETE = withTenant(async (_request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const eventId = (context.params as { eventId?: string } | undefined)?.eventId;

  if (!eventId) {
    return NextResponse.json({ error: "EVENT_ID_REQUIRED" }, { status: 400 });
  }

  // Validar que el evento existe y pertenece al tenant
  const [eventRow] = await db
    .select({
      id: events.id,
    })
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.tenantId, context.tenantId)))
    .limit(1);

  if (!eventRow) {
    return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });
  }

  // Eliminar evento
  await db.delete(events).where(eq(events.id, eventId));

  return NextResponse.json({ ok: true });
});

