import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";

import { db } from "@/db";
import { events } from "@/db/schema";
import { withTenant } from "@/lib/authz";

const BodySchema = z.object({
  academyId: z.string().uuid(),
  title: z.string().min(1),
  location: z.string().optional(),
  date: z.string().optional(),
  status: z.string().optional(),
});

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const url = new URL(request.url);
  const academyId = url.searchParams.get("academyId");

  if (!academyId) {
    return NextResponse.json({ error: "ACADEMY_ID_REQUIRED" }, { status: 400 });
  }

  const eventRows = await db
    .select()
    .from(events)
    .where(and(eq(events.tenantId, context.tenantId), eq(events.academyId, academyId)))
    .orderBy(desc(events.date), desc(events.createdAt));

  return NextResponse.json({
    items: eventRows.map((event) => ({
      id: event.id,
      title: event.title,
      date: event.date?.toISOString().split("T")[0] || null,
      location: event.location,
      status: event.status,
      academyId: event.academyId,
      createdAt: event.createdAt?.toISOString(),
    })),
  });
});

export const POST = withTenant(async (request, context) => {
  const body = BodySchema.parse(await request.json());

  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  await db.insert(events).values({
    id: crypto.randomUUID(),
    tenantId: context.tenantId,
    academyId: body.academyId,
    title: body.title,
    location: body.location,
    date: body.date ? new Date(body.date) : null,
    status: body.status ?? undefined,
  });

  return NextResponse.json({ ok: true });
});
