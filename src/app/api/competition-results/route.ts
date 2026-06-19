import { and, desc, eq, isNull, type SQL } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  athleteSportConfigs,
  athletes,
  competitionResults,
  events,
} from "@/db/schema";
import { apiCreated, apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { getAcademySportConfigOptions, verifyAcademySportConfig } from "@/lib/sport-config/service";

const querySchema = z.object({
  eventId: z.string().uuid().optional(),
  athleteId: z.string().uuid().optional(),
  sportConfigId: z.string().uuid().optional(),
});

const resultSchema = z.object({
  athleteId: z.string().uuid(),
  eventId: z.string().uuid().optional().nullable(),
  sportConfigId: z.string().uuid().optional().nullable(),
  apparatus: z.string().trim().min(1).max(120).optional().nullable(),
  dScore: z.number().int().min(0).optional().nullable(),
  eScore: z.number().int().min(0).optional().nullable(),
  finalScore: z.number().int().min(0).optional().nullable(),
  rank: z.number().int().positive().optional().nullable(),
  qualificationPoints: z.number().int().min(0).optional().nullable(),
  judgePanel: z.string().max(1000).optional().nullable(),
  round: z.string().trim().max(120).optional().nullable(),
  subdivision: z.string().trim().max(120).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const GET = withTenant(async (request, context) => {
  try {
    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
    }

    const params = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!params.success) {
      return handleApiError(params.error);
    }

    const conditions: SQL[] = [eq(competitionResults.tenantId, context.tenantId)];
    if (params.data.eventId) conditions.push(eq(competitionResults.eventId, params.data.eventId));
    if (params.data.athleteId) conditions.push(eq(competitionResults.athleteId, params.data.athleteId));
    if (params.data.sportConfigId) conditions.push(eq(competitionResults.sportConfigId, params.data.sportConfigId));

    const rows = await db
      .select({
        id: competitionResults.id,
        athleteId: competitionResults.athleteId,
        athleteName: athletes.name,
        eventId: competitionResults.eventId,
        eventTitle: events.title,
        sportConfigId: competitionResults.sportConfigId,
        apparatus: competitionResults.apparatus,
        dScore: competitionResults.dScore,
        eScore: competitionResults.eScore,
        finalScore: competitionResults.finalScore,
        rank: competitionResults.rank,
        qualificationPoints: competitionResults.qualificationPoints,
        judgePanel: competitionResults.judgePanel,
        round: competitionResults.round,
        subdivision: competitionResults.subdivision,
        notes: competitionResults.notes,
        createdAt: competitionResults.createdAt,
      })
      .from(competitionResults)
      .innerJoin(athletes, eq(competitionResults.athleteId, athletes.id))
      .leftJoin(events, eq(competitionResults.eventId, events.id))
      .where(and(...conditions))
      .orderBy(desc(competitionResults.createdAt));

    return apiSuccess({ items: rows });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/competition-results", method: "GET" });
  }
});

export const POST = withTenant(async (request, context) => {
  try {
    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
    }

    const body = resultSchema.parse(await request.json());

    const [athlete] = await db
      .select({
        id: athletes.id,
        tenantId: athletes.tenantId,
        academyId: athletes.academyId,
        primarySportConfigId: athletes.primarySportConfigId,
      })
      .from(athletes)
      .where(and(eq(athletes.id, body.athleteId), eq(athletes.tenantId, context.tenantId), isNull(athletes.deletedAt)))
      .limit(1);

    if (!athlete) {
      return apiError("ATHLETE_NOT_FOUND", "Atleta no encontrado", 404);
    }

    let eventSportConfigId: string | null = null;
    if (body.eventId) {
      const [event] = await db
        .select({
          id: events.id,
          academyId: events.academyId,
          tenantId: events.tenantId,
          sportConfigId: events.sportConfigId,
        })
        .from(events)
        .where(and(eq(events.id, body.eventId), eq(events.tenantId, context.tenantId)))
        .limit(1);

      if (!event || event.academyId !== athlete.academyId) {
        return apiError("EVENT_NOT_FOUND", "Evento no encontrado para esta academia", 404);
      }

      eventSportConfigId = event.sportConfigId;
    }

    const effectiveSportConfigId = body.sportConfigId ?? eventSportConfigId ?? athlete.primarySportConfigId ?? null;

    if (eventSportConfigId && effectiveSportConfigId !== eventSportConfigId) {
      return apiError("EVENT_SPORT_CONFIG_MISMATCH", "El resultado debe usar la misma rama/modalidad que el evento", 400);
    }

    if (effectiveSportConfigId) {
      const verifiedConfig = await verifyAcademySportConfig({
        academyId: athlete.academyId,
        tenantId: context.tenantId,
        sportConfigId: effectiveSportConfigId,
      });

      if (!verifiedConfig) {
        return apiError("SPORT_CONFIG_NOT_FOUND", "La rama/modalidad no está activa en esta academia", 400);
      }

      const athleteConfigRows = await db
        .select({ sportConfigId: athleteSportConfigs.academySportConfigId })
        .from(athleteSportConfigs)
        .where(and(eq(athleteSportConfigs.tenantId, context.tenantId), eq(athleteSportConfigs.athleteId, athlete.id)));

      const athleteSportIds = new Set([
        athlete.primarySportConfigId,
        ...athleteConfigRows.map((row) => row.sportConfigId),
      ].filter((value): value is string => Boolean(value)));

      if (athleteSportIds.size > 0 && !athleteSportIds.has(effectiveSportConfigId)) {
        return apiError("ATHLETE_SPORT_CONFIG_MISMATCH", "El atleta no está asociado a esa rama/modalidad", 400);
      }
    }

    let normalizedApparatus = body.apparatus?.trim() || null;
    if (effectiveSportConfigId && normalizedApparatus) {
      const activeConfigs = await getAcademySportConfigOptions(athlete.academyId);
      const selectedConfig = activeConfigs.find((config) => config.id === effectiveSportConfigId);
      const apparatusByInput = new Map<string, string>();
      selectedConfig?.apparatus.forEach((item) => {
        apparatusByInput.set(item.code, item.code);
        apparatusByInput.set(item.name, item.code);
        if (item.shortName) apparatusByInput.set(item.shortName, item.code);
      });

      normalizedApparatus = apparatusByInput.get(normalizedApparatus) ?? normalizedApparatus;
      const validApparatus = new Set(selectedConfig?.apparatus.map((item) => item.code) ?? []);
      if (validApparatus.size > 0 && !validApparatus.has(normalizedApparatus)) {
        return apiError("INVALID_APPARATUS", "El aparato no pertenece a la rama/modalidad seleccionada", 400);
      }
    }

    const [created] = await db
      .insert(competitionResults)
      .values({
        tenantId: context.tenantId,
        athleteId: body.athleteId,
        eventId: body.eventId ?? null,
        sportConfigId: effectiveSportConfigId,
        apparatus: normalizedApparatus,
        dScore: body.dScore ?? null,
        eScore: body.eScore ?? null,
        finalScore: body.finalScore ?? null,
        rank: body.rank ?? null,
        qualificationPoints: body.qualificationPoints ?? null,
        judgePanel: body.judgePanel ?? null,
        round: body.round?.trim() || null,
        subdivision: body.subdivision?.trim() || null,
        notes: body.notes ?? null,
      })
      .returning();

    return apiCreated({ item: created });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/competition-results", method: "POST" });
  }
});
