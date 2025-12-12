import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { events, academies } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import {
  notifyInternalStaff,
  notifyCity,
  notifyProvince,
  notifyCountry,
} from "@/lib/notifications/eventsNotifier";

export const dynamic = "force-dynamic";

const NotifySchema = z.object({
  type: z.enum(["internal_staff", "city", "province", "country"]),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/events/[id]/notify
 * 
 * Envía notificaciones sobre un evento a diferentes grupos:
 * - internal_staff: Personal interno de la academia
 * - city: Academias de la misma ciudad
 * - province: Academias de la misma provincia
 * - country: Academias del mismo país
 */
export const POST = withTenant(async (request, context) => {
  try {
    const { id } = await (context.params as Promise<{ id: string }>);

    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    const body = NotifySchema.parse(await request.json());

    // Verificar que el evento existe y pertenece al tenant
    const [event] = await db
      .select({
        id: events.id,
        academyId: events.academyId,
        tenantId: events.tenantId,
      })
      .from(events)
      .where(and(eq(events.id, id), eq(events.tenantId, context.tenantId)))
      .limit(1);

    if (!event) {
      return NextResponse.json(
        { error: "EVENT_NOT_FOUND", message: "Evento no encontrado" },
        { status: 404 }
      );
    }

    // Verificar que la academia pertenece al tenant
    const [academy] = await db
      .select({ tenantId: academies.tenantId })
      .from(academies)
      .where(eq(academies.id, event.academyId))
      .limit(1);

    if (!academy || academy.tenantId !== context.tenantId) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    // Enviar notificaciones según el tipo
    let result: { sent: number; errors: number };

    switch (body.type) {
      case "internal_staff":
        result = await notifyInternalStaff(event.academyId, event.id);
        break;
      case "city":
        result = await notifyCity(event.academyId, event.id);
        break;
      case "province":
        result = await notifyProvince(event.academyId, event.id);
        break;
      case "country":
        result = await notifyCountry(event.academyId, event.id);
        break;
      default:
        return NextResponse.json(
          { error: "INVALID_TYPE", message: "Tipo de notificación inválido" },
          { status: 400 }
        );
    }

    return NextResponse.json({
      ok: true,
      type: body.type,
      sent: result.sent,
      errors: result.errors,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", details: error.errors },
        { status: 400 }
      );
    }
    return handleApiError(error, { endpoint: "/api/events/[id]/notify", method: "POST" });
  }
});

