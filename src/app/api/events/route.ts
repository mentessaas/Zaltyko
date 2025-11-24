import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";

import { db } from "@/db";
import { events, academies } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  academyId: z.string().uuid(),
  title: z.string().min(1),
  location: z.string().optional().nullable(),
  date: z.string().optional().nullable(),
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
  try {
    if (!context.tenantId) {
      // Intentar obtener tenantId desde academyId si no está en el contexto
      const bodyRaw = await request.json();
      const parsedBody = BodySchema.safeParse(bodyRaw);
      
      if (!parsedBody.success) {
        return NextResponse.json(
          { error: "INVALID_BODY", details: parsedBody.error.errors },
          { status: 400 }
        );
      }

      const academyId = parsedBody.data.academyId;
      const [academy] = await db
        .select({ tenantId: academies.tenantId })
        .from(academies)
        .where(eq(academies.id, academyId))
        .limit(1);

      if (!academy || !academy.tenantId) {
        return NextResponse.json({ error: "ACADEMY_NOT_FOUND" }, { status: 404 });
      }

      // Usar el tenantId de la academia
      const effectiveTenantId = academy.tenantId;

      await db.insert(events).values({
        id: crypto.randomUUID(),
        tenantId: effectiveTenantId,
        academyId: parsedBody.data.academyId,
        title: parsedBody.data.title,
        location: parsedBody.data.location || null,
        date: parsedBody.data.date ? new Date(parsedBody.data.date) : null,
        status: parsedBody.data.status || "draft",
      });

      return NextResponse.json({ ok: true });
    }

    // Si tenemos tenantId en el contexto, proceder normalmente
    const body = BodySchema.parse(await request.json());

    // Verificar que la academia pertenece al tenant
    const [academy] = await db
      .select({ tenantId: academies.tenantId })
      .from(academies)
      .where(eq(academies.id, body.academyId))
      .limit(1);

    if (!academy) {
      return NextResponse.json({ error: "ACADEMY_NOT_FOUND" }, { status: 404 });
    }

    if (academy.tenantId !== context.tenantId) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    await db.insert(events).values({
      id: crypto.randomUUID(),
      tenantId: context.tenantId,
      academyId: body.academyId,
      title: body.title,
      location: body.location || null,
      date: body.date ? new Date(body.date) : null,
      status: body.status || "draft",
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    logger.error("Error creating event", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: error.message || "Error al crear evento" },
      { status: 500 }
    );
  }
});
