import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { events, academies, memberships } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { withRateLimit, getUserIdentifier } from "@/lib/rate-limit";
import { withPayloadValidation, type PayloadValidationContext } from "@/lib/payload-validator";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const EVENT_LEVELS = ["internal", "local", "national", "international"] as const;
const EVENT_DISCIPLINES = ["artistic_female", "artistic_male", "rhythmic", "trampoline", "parkour"] as const;

const CreateEventSchema = z.object({
  academyId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  category: z.array(z.string()).optional(),
  isPublic: z.boolean().default(false),
  level: z.enum(EVENT_LEVELS).default("internal"),
  discipline: z.enum(EVENT_DISCIPLINES).optional(),
  eventType: z.enum(["competitions", "courses", "camps", "workshops", "clinics", "evaluations", "other"]).optional(),
  startDate: z.string().min(1, "La fecha de inicio es requerida"),
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
  notifyInternalStaff: z.boolean().default(false),
  notifyCityAcademies: z.boolean().default(false),
  notifyProvinceAcademies: z.boolean().default(false),
  notifyCountryAcademies: z.boolean().default(false),
}).refine((data) => {
  // Validar fechas de inscripción
  if (data.registrationStartDate && data.registrationEndDate) {
    return new Date(data.registrationStartDate) <= new Date(data.registrationEndDate);
  }
  return true;
}, {
  message: "La fecha de inicio de inscripción debe ser anterior a la fecha de fin",
  path: ["registrationStartDate"],
}).refine((data) => {
  // Validar que fecha de fin de inscripción sea anterior a inicio del evento
  if (data.registrationEndDate && data.startDate) {
    return new Date(data.registrationEndDate) <= new Date(data.startDate);
  }
  return true;
}, {
  message: "La fecha de fin de inscripción debe ser anterior a la fecha de inicio del evento",
  path: ["registrationEndDate"],
}).refine((data) => {
  // Validar que fecha de inicio sea anterior a fecha de fin
  if (data.startDate && data.endDate) {
    return new Date(data.startDate) <= new Date(data.endDate);
  }
  return true;
}, {
  message: "La fecha de inicio debe ser anterior a la fecha de fin",
  path: ["startDate"],
});

const QuerySchema = z.object({
  academyId: z.string().uuid().optional(),
  country: z.string().optional(),
  province: z.string().optional(),
  city: z.string().optional(),
  discipline: z.enum(EVENT_DISCIPLINES).optional(),
  level: z.enum(EVENT_LEVELS).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(1000).default(50),
});

/**
 * POST /api/events
 * 
 * Crea un nuevo evento (requiere autenticación, solo academias)
 */
export const POST = withRateLimit(
  withPayloadValidation(
    withTenant(async (request, context) => {
      try {
        const body = CreateEventSchema.parse(await request.json());

        // Obtener tenantId de la academia si no está disponible en el contexto
        // Esto es necesario porque withTenant puede no tener el tenantId si el perfil no lo tiene
        let effectiveTenantId = context.tenantId;

        // Si tenantId está vacío o no existe, obtenerlo de la academia
        if (!effectiveTenantId || effectiveTenantId === "" || effectiveTenantId.trim() === "") {
          // Verificar que la academia existe y obtener su tenantId
          const [academy] = await db
            .select({ tenantId: academies.tenantId })
            .from(academies)
            .where(eq(academies.id, body.academyId))
            .limit(1);

          if (!academy) {
            return NextResponse.json({ error: "ACADEMY_NOT_FOUND" }, { status: 404 });
          }

          // Verificar que el usuario tiene acceso a esta academia
          if (context.profile.role !== "super_admin" && context.profile.role !== "admin") {
            // Para owners, verificar que son dueños de la academia
            const [membership] = await db
              .select()
              .from(memberships)
              .where(
                and(
                  eq(memberships.academyId, body.academyId),
                  eq(memberships.userId, context.userId)
                )
              )
              .limit(1);

            if (!membership) {
              return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
            }
          }

          effectiveTenantId = academy.tenantId;
        } else {
          // Si ya tenemos tenantId, verificar que la academia pertenece a ese tenant
          const [academy] = await db
            .select({ tenantId: academies.tenantId })
            .from(academies)
            .where(eq(academies.id, body.academyId))
            .limit(1);

          if (!academy) {
            return NextResponse.json({ error: "ACADEMY_NOT_FOUND" }, { status: 404 });
          }

          if (academy.tenantId !== effectiveTenantId) {
            return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
          }
        }

        const [newEvent] = await db
          .insert(events)
          .values({
            tenantId: effectiveTenantId,
            academyId: body.academyId,
            title: body.title,
            description: body.description || null,
            category: body.category || null,
            isPublic: body.isPublic ?? false,
            level: body.level || "internal",
            discipline: body.discipline || null,
            eventType: body.eventType || null,
            startDate: body.startDate || new Date().toISOString().split("T")[0],
            endDate: body.endDate || null,
            registrationStartDate: body.registrationStartDate || null,
            registrationEndDate: body.registrationEndDate || null,
            countryCode: body.countryCode || null,
            countryName: body.countryName || body.country || null,
            provinceName: body.provinceName || body.province || null,
            cityName: body.cityName || body.city || null,
            // Mantener campos antiguos para compatibilidad
            country: body.countryName || body.country || null,
            province: body.provinceName || body.province || null,
            city: body.cityName || body.city || null,
            contactEmail: body.contactEmail || null,
            contactPhone: body.contactPhone || null,
            contactInstagram: body.contactInstagram || null,
            contactWebsite: body.contactWebsite || null,
            images: body.images || null,
            attachments: body.attachments || null,
            notifyInternalStaff: body.notifyInternalStaff ?? false,
            notifyCityAcademies: body.notifyCityAcademies ?? false,
            notifyProvinceAcademies: body.notifyProvinceAcademies ?? false,
            notifyCountryAcademies: body.notifyCountryAcademies ?? false,
          })
          .returning();

        // Enviar notificaciones según toggles activados
        if (body.notifyInternalStaff) {
          try {
            const { notifyInternalStaff } = await import("@/lib/notifications/eventsNotifier");
            await notifyInternalStaff(body.academyId, newEvent.id);
          } catch (err) {
            logger.error("Error enviando notificación a personal interno", err as Error, { academyId: body.academyId, eventId: newEvent.id });
          }
        }
        if (body.notifyCityAcademies && body.cityName) {
          try {
            const { notifyCity } = await import("@/lib/notifications/eventsNotifier");
            await notifyCity(body.academyId, newEvent.id);
          } catch (err) {
            logger.error("Error enviando notificación a academias de la ciudad", err as Error, { academyId: body.academyId, eventId: newEvent.id });
          }
        }
        if (body.notifyProvinceAcademies && body.provinceName) {
          try {
            const { notifyProvince } = await import("@/lib/notifications/eventsNotifier");
            await notifyProvince(body.academyId, newEvent.id);
          } catch (err) {
            logger.error("Error enviando notificación a academias de la provincia", err as Error, { academyId: body.academyId, eventId: newEvent.id });
          }
        }
        if (body.notifyCountryAcademies && body.countryName) {
          try {
            const { notifyCountry } = await import("@/lib/notifications/eventsNotifier");
            await notifyCountry(body.academyId, newEvent.id);
          } catch (err) {
            logger.error("Error enviando notificación a academias del país", err as Error, { academyId: body.academyId, eventId: newEvent.id });
          }
        }

        return NextResponse.json({ ok: true, event: newEvent });
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          return NextResponse.json(
            { error: "VALIDATION_ERROR", details: error.errors },
            { status: 400 }
          );
        }
        return handleApiError(error, { endpoint: "/api/events", method: "POST" });
      }
    }),
    { maxSize: 512 * 1024 }
  ),
  { identifier: getUserIdentifier }
);

/**
 * GET /api/events
 * 
 * Lista eventos públicos con filtros (requiere autenticación para ver eventos privados del tenant)
 */
export const GET = withTenant(async (request, context) => {
  try {
    const url = new URL(request.url);
    const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "INVALID_FILTERS",
          message: "Los filtros proporcionados no son válidos",
          details: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const { academyId, country, province, city, discipline, level, startDate, endDate, search, page, limit } = parsed.data;

    // Construir filtros
    const filters: SQL[] = [];

    // Si hay tenantId, mostrar eventos públicos Y eventos del tenant
    if (context.tenantId) {
      filters.push(
        or(
          eq(events.isPublic, true),
          eq(events.tenantId, context.tenantId)
        )!
      );
    } else {
      // Sin autenticación, solo eventos públicos
      filters.push(eq(events.isPublic, true));
    }

    if (academyId) {
      filters.push(eq(events.academyId, academyId));
    }

    if (search) {
      filters.push(
        or(
          ilike(events.title, `%${search}%`),
          ilike(events.description, `%${search}%`)
        )!
      );
    }

    if (discipline) {
      filters.push(eq(events.discipline, discipline));
    }

    if (level) {
      filters.push(eq(events.level, level));
    }

    if (country) {
      const normalizedCountry = country.trim().toLowerCase();
      filters.push(sql`LOWER(TRIM(${events.country})) = LOWER(TRIM(${normalizedCountry}))`);
    }

    if (province) {
      const normalizedProvince = province.trim().toLowerCase();
      filters.push(sql`LOWER(TRIM(${events.province})) = LOWER(TRIM(${normalizedProvince}))`);
    }

    if (city) {
      const normalizedCity = city.trim().toLowerCase();
      filters.push(sql`LOWER(TRIM(${events.city})) = LOWER(TRIM(${normalizedCity}))`);
    }

    if (startDate) {
      filters.push(sql`${events.startDate} >= ${startDate}::date`);
    }

    if (endDate) {
      filters.push(sql`${events.endDate} <= ${endDate}::date`);
    }

    // Contar total de resultados
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(events)
      .where(and(...filters));

    const total = Number(countResult?.count ?? 0);
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;

    // Obtener eventos
    const items = await db
      .select({
        id: events.id,
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
        academyId: events.academyId,
        createdAt: events.createdAt,
      })
      .from(events)
      .where(and(...filters))
      .orderBy(desc(events.startDate), desc(events.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      total,
      page,
      pageSize: limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
      items,
    });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/events", method: "GET" });
  }
});
