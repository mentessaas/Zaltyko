/**
 * Lógica de negocio para eventos
 * Extraída para facilitar testing y mantenimiento
 */
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { events, academies, memberships } from "@/db/schema";
import { apiSuccess, apiCreated, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const EVENT_LEVELS = ["internal", "local", "national", "international"] as const;
const EVENT_DISCIPLINES = ["artistic_female", "artistic_male", "rhythmic", "trampoline", "parkour"] as const;

export const EVENT_LEVELS_CONST = EVENT_LEVELS;
export const EVENT_DISCIPLINES_CONST = EVENT_DISCIPLINES;

export const CreateEventSchema = z.object({
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
  status: z.enum(["draft", "published", "cancelled", "completed"]).default("draft"),
  maxCapacity: z.number().int().positive().optional(),
  registrationFee: z.number().int().positive().optional(),
  allowWaitlist: z.boolean().default(true),
  waitlistMaxSize: z.number().int().positive().optional(),
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

export const QuerySchema = z.object({
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

export interface CreateEventContext {
  tenantId: string | null;
  userId: string;
  profile: { role: string };
}

export async function createEvent(body: z.infer<typeof CreateEventSchema>, context: CreateEventContext) {
  let effectiveTenantId = context.tenantId;

  if (!effectiveTenantId || effectiveTenantId === "" || effectiveTenantId.trim() === "") {
    const [academy] = await db
      .select({ tenantId: academies.tenantId })
      .from(academies)
      .where(eq(academies.id, body.academyId))
      .limit(1);

    if (!academy) {
      return { error: apiError("ACADEMY_NOT_FOUND", "Academy not found", 404) };
    }

    if (context.profile.role !== "super_admin" && context.profile.role !== "admin") {
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
        return { error: apiError("FORBIDDEN", "Forbidden", 403) };
      }
    }

    effectiveTenantId = academy.tenantId;
  } else {
    const [academy] = await db
      .select({ tenantId: academies.tenantId })
      .from(academies)
      .where(eq(academies.id, body.academyId))
      .limit(1);

    if (!academy) {
      return { error: apiError("ACADEMY_NOT_FOUND", "Academy not found", 404) };
    }

    if (academy.tenantId !== effectiveTenantId) {
      return { error: apiError("FORBIDDEN", "Forbidden", 403) };
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
      status: body.status ?? "draft",
      maxCapacity: body.maxCapacity ?? null,
      registrationFee: body.registrationFee ?? null,
      allowWaitlist: body.allowWaitlist ?? true,
      waitlistMaxSize: body.waitlistMaxSize ?? null,
    })
    .returning();

  // Enviar notificaciones
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

  return { event: newEvent };
}

export interface ListEventsParams {
  academyId?: string;
  country?: string;
  province?: string;
  city?: string;
  discipline?: string;
  level?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  page: number;
  limit: number;
}

export async function listEvents(params: ListEventsParams, tenantId: string | null) {
  const filters: SQL[] = [];

  if (tenantId) {
    filters.push(
      or(
        eq(events.isPublic, true),
        eq(events.tenantId, tenantId)
      )!
    );
  } else {
    filters.push(eq(events.isPublic, true));
  }

  if (params.academyId) {
    filters.push(eq(events.academyId, params.academyId));
  }

  if (params.search) {
    filters.push(
      or(
        ilike(events.title, `%${params.search}%`),
        ilike(events.description, `%${params.search}%`)
      )!
    );
  }

  if (params.discipline) {
    filters.push(eq(events.discipline, params.discipline));
  }

  if (params.level) {
    filters.push(eq(events.level, params.level));
  }

  if (params.country) {
    const normalizedCountry = params.country.trim().toLowerCase();
    filters.push(sql`LOWER(TRIM(${events.country})) = LOWER(TRIM(${normalizedCountry}))`);
  }

  if (params.province) {
    const normalizedProvince = params.province.trim().toLowerCase();
    filters.push(sql`LOWER(TRIM(${events.province})) = LOWER(TRIM(${normalizedProvince}))`);
  }

  if (params.city) {
    const normalizedCity = params.city.trim().toLowerCase();
    filters.push(sql`LOWER(TRIM(${events.city})) = LOWER(TRIM(${normalizedCity}))`);
  }

  if (params.startDate) {
    filters.push(sql`${events.startDate} >= ${params.startDate}::date`);
  }

  if (params.endDate) {
    filters.push(sql`${events.endDate} <= ${params.endDate}::date`);
  }

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(events)
    .where(and(...filters));

  const total = Number(countResult?.count ?? 0);
  const offset = (params.page - 1) * params.limit;

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
    .limit(params.limit)
    .offset(offset);

  return { items, total };
}
