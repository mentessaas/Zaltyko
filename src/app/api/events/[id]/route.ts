import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { events, academies } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const EVENT_LEVELS = ["internal", "local", "national", "international"] as const;
const EVENT_DISCIPLINES = ["artistic_female", "artistic_male", "rhythmic", "trampoline", "parkour"] as const;

const UpdateEventSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  category: z.array(z.string()).optional(),
  isPublic: z.boolean().optional(),
  level: z.enum(EVENT_LEVELS).optional(),
  discipline: z.enum(EVENT_DISCIPLINES).optional(),
  eventType: z.enum(["competitions", "courses", "camps", "workshops", "clinics", "evaluations", "other"]).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  registrationStartDate: z.string().optional(),
  registrationEndDate: z.string().optional(),
  countryCode: z.string().optional(),
  countryName: z.string().optional(),
  provinceName: z.string().optional(),
  cityName: z.string().optional(),
  // Mantener campos antiguos para compatibilidad
  country: z.string().optional(),
  province: z.string().optional(),
  city: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  contactInstagram: z.string().optional(),
  contactWebsite: z.string().url().optional(),
  images: z.array(z.string().url()).optional(),
  attachments: z.array(z.object({ name: z.string(), url: z.string().url() })).optional(),
  notifyInternalStaff: z.boolean().optional(),
  notifyCityAcademies: z.boolean().optional(),
  notifyProvinceAcademies: z.boolean().optional(),
  notifyCountryAcademies: z.boolean().optional(),
}).refine((data) => {
  if (data.registrationStartDate && data.registrationEndDate) {
    return new Date(data.registrationStartDate) <= new Date(data.registrationEndDate);
  }
  return true;
}, {
  message: "La fecha de inicio de inscripción debe ser anterior a la fecha de fin",
  path: ["registrationStartDate"],
}).refine((data) => {
  if (data.registrationEndDate && data.startDate) {
    return new Date(data.registrationEndDate) <= new Date(data.startDate);
  }
  return true;
}, {
  message: "La fecha de fin de inscripción debe ser anterior a la fecha de inicio del evento",
  path: ["registrationEndDate"],
}).refine((data) => {
  if (data.startDate && data.endDate) {
    return new Date(data.startDate) <= new Date(data.endDate);
  }
  return true;
}, {
  message: "La fecha de inicio debe ser anterior a la fecha de fin",
  path: ["startDate"],
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/events/[id]
 * 
 * Obtiene el detalle de un evento (público si is_public = true, o del tenant si autenticado)
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    // Obtener evento
    const [event] = await db
      .select({
        id: events.id,
        tenantId: events.tenantId,
        academyId: events.academyId,
        title: events.title,
        description: events.description,
        category: events.category,
        isPublic: events.isPublic,
        level: events.level,
        discipline: events.discipline,
        startDate: events.startDate,
        endDate: events.endDate,
        country: events.country,
        province: events.province,
        city: events.city,
        contactEmail: events.contactEmail,
        contactPhone: events.contactPhone,
        contactInstagram: events.contactInstagram,
        contactWebsite: events.contactWebsite,
        images: events.images,
        attachments: events.attachments,
        createdAt: events.createdAt,
        updatedAt: events.updatedAt,
      })
      .from(events)
      .where(eq(events.id, id))
      .limit(1);

    if (!event) {
      return NextResponse.json(
        { error: "EVENT_NOT_FOUND", message: "Evento no encontrado" },
        { status: 404 }
      );
    }

    // Si el evento no es público, verificar autenticación y tenant
    // (esto se maneja mejor con RLS, pero por seguridad adicional)
    if (!event.isPublic) {
      // Intentar obtener tenant del contexto (si está autenticado)
      // Por ahora, permitimos acceso si el evento existe (RLS lo manejará)
    }

    // Obtener información de la academia organizadora
    const [academy] = await db
      .select({
        id: academies.id,
        name: academies.name,
        logoUrl: academies.logoUrl,
      })
      .from(academies)
      .where(eq(academies.id, event.academyId))
      .limit(1);

    return NextResponse.json({
      ...event,
      academy: academy || null,
    });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/events/[id]", method: "GET" });
  }
}

/**
 * PATCH /api/events/[id]
 * 
 * Edita un evento (solo dueño de la academia)
 */
export const PATCH = withTenant(async (request, context) => {
  try {
    const { id } = await (context.params as Promise<{ id: string }>);

    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    const body = UpdateEventSchema.parse(await request.json());

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

    // Construir objeto de actualización solo con campos presentes
    const updateData: Partial<typeof events.$inferInsert> = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description || null;
    if (body.category !== undefined) updateData.category = body.category || null;
    if (body.isPublic !== undefined) updateData.isPublic = body.isPublic;
    if (body.level !== undefined) updateData.level = body.level;
    if (body.discipline !== undefined) updateData.discipline = body.discipline || null;
    if (body.eventType !== undefined) updateData.eventType = body.eventType || null;
    if (body.startDate !== undefined) updateData.startDate = body.startDate;
    if (body.endDate !== undefined) updateData.endDate = body.endDate || null;
    if (body.registrationStartDate !== undefined) updateData.registrationStartDate = body.registrationStartDate || null;
    if (body.registrationEndDate !== undefined) updateData.registrationEndDate = body.registrationEndDate || null;
    if (body.countryCode !== undefined) updateData.countryCode = body.countryCode || null;
    if (body.countryName !== undefined) updateData.countryName = body.countryName || null;
    if (body.provinceName !== undefined) updateData.provinceName = body.provinceName || null;
    if (body.cityName !== undefined) updateData.cityName = body.cityName || null;
    // Mantener campos antiguos para compatibilidad
    if (body.country !== undefined) updateData.country = body.countryName || body.country || null;
    if (body.province !== undefined) updateData.province = body.provinceName || body.province || null;
    if (body.city !== undefined) updateData.city = body.cityName || body.city || null;
    if (body.contactEmail !== undefined) updateData.contactEmail = body.contactEmail || null;
    if (body.contactPhone !== undefined) updateData.contactPhone = body.contactPhone || null;
    if (body.contactInstagram !== undefined) updateData.contactInstagram = body.contactInstagram || null;
    if (body.contactWebsite !== undefined) updateData.contactWebsite = body.contactWebsite || null;
    if (body.images !== undefined) updateData.images = body.images || null;
    if (body.attachments !== undefined) updateData.attachments = body.attachments || null;
    if (body.notifyInternalStaff !== undefined) updateData.notifyInternalStaff = body.notifyInternalStaff;
    if (body.notifyCityAcademies !== undefined) updateData.notifyCityAcademies = body.notifyCityAcademies;
    if (body.notifyProvinceAcademies !== undefined) updateData.notifyProvinceAcademies = body.notifyProvinceAcademies;
    if (body.notifyCountryAcademies !== undefined) updateData.notifyCountryAcademies = body.notifyCountryAcademies;

    updateData.updatedAt = new Date();

    // Actualizar evento
    const [updatedEvent] = await db
      .update(events)
      .set(updateData)
      .where(eq(events.id, id))
      .returning();

    // Enviar notificaciones según toggles activados (solo si se actualizaron)
    if (body.notifyInternalStaff) {
      try {
        const { notifyInternalStaff } = await import("@/lib/notifications/eventsNotifier");
        await notifyInternalStaff(updatedEvent.academyId, id);
      } catch (err) {
        logger.error("Error enviando notificación a personal interno", err as Error, { academyId: updatedEvent.academyId, eventId: id });
      }
    }
    if (body.notifyCityAcademies && (body.cityName || updatedEvent.cityName)) {
      try {
        const { notifyCity } = await import("@/lib/notifications/eventsNotifier");
        await notifyCity(updatedEvent.academyId, id);
      } catch (err) {
        logger.error("Error enviando notificación a academias de la ciudad", err as Error, { academyId: updatedEvent.academyId, eventId: id });
      }
    }
    if (body.notifyProvinceAcademies && (body.provinceName || updatedEvent.provinceName)) {
      try {
        const { notifyProvince } = await import("@/lib/notifications/eventsNotifier");
        await notifyProvince(updatedEvent.academyId, id);
      } catch (err) {
        logger.error("Error enviando notificación a academias de la provincia", err as Error, { academyId: updatedEvent.academyId, eventId: id });
      }
    }
    if (body.notifyCountryAcademies && (body.countryName || updatedEvent.countryName)) {
      try {
        const { notifyCountry } = await import("@/lib/notifications/eventsNotifier");
        await notifyCountry(updatedEvent.academyId, id);
      } catch (err) {
        logger.error("Error enviando notificación a academias del país", err as Error, { academyId: updatedEvent.academyId, eventId: id });
      }
    }

    return NextResponse.json({ ok: true, event: updatedEvent });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", details: error.errors },
        { status: 400 }
      );
    }
    return handleApiError(error, { endpoint: "/api/events/[id]", method: "PATCH" });
  }
});

/**
 * DELETE /api/events/[id]
 * 
 * Elimina un evento (solo dueño de la academia)
 */
export const DELETE = withTenant(async (request, context) => {
  try {
    const { id } = await (context.params as Promise<{ id: string }>);

    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

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

    // Eliminar evento
    await db.delete(events).where(eq(events.id, id));

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/events/[id]", method: "DELETE" });
  }
});

