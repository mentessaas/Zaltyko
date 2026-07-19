export const dynamic = 'force-dynamic';

import { randomUUID } from "node:crypto";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, athleteSportConfigs, athletes, familyContacts, guardianAthletes, groupAthletes, groups } from "@/db/schema";
import { assertWithinPlanLimits, getUpgradeInfo } from "@/lib/limits";
import { LimitError } from "@/lib/limits/errors";
import { withTenant } from "@/lib/authz";
import { rateLimit, getUserIdentifier, withRateLimit } from "@/lib/rate-limit";
import { athleteStatusOptions } from "@/lib/athletes/constants";
import { handleApiError } from "@/lib/api-error-handler";
import { withTransaction } from "@/lib/db-transactions";
import { verifyAcademyAccess, verifyGroupAccess } from "@/lib/permissions";
import { markChecklistItem, markWizardStep } from "@/lib/onboarding";
import { trackEvent } from "@/lib/analytics";
import { logEvent } from "@/lib/event-logging";
import { formatDateForDB } from "@/lib/validation/date-utils";
import { apiSuccess, apiCreated, apiError } from "@/lib/api-response";
import { getAcademySportConfigOptions, verifyAcademySportConfig } from "@/lib/sport-config/service";
import {
  isCategoryCodeAllowed,
  isLevelCodeAllowed,
  isProgramCodeAllowed,
} from "@/lib/sport-config/validation";
import { NextResponse } from "next/server";

const ContactSchema = z.object({
  name: z.string().min(1),
  relationship: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  notifyEmail: z.boolean().optional(),
  notifySms: z.boolean().optional(),
});

// Validador custom para fechas que acepta ISO 8601 y YYYY-MM-DD
const dateStringSchema = z
  .string()
  .optional()
  .refine(
    (val) => {
      if (!val || val.trim() === "") return true; // Permitir vacío
      const parsed = new Date(val);
      return !Number.isNaN(parsed.getTime());
    },
    { message: "El formato de fecha no es válido. Use formato YYYY-MM-DD o ISO 8601" }
  )
  .transform((val) => {
    if (!val || val.trim() === "") return null;
    const parsed = new Date(val);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  });

const BodySchema = z.object({
  academyId: z.string().uuid(),
  name: z.string().min(1),
  dob: dateStringSchema,
  level: z.string().optional(),
  status: z.enum(athleteStatusOptions).optional(),
  age: z.number().int().min(0).optional(),
  contacts: z.array(ContactSchema).optional(),
  groupId: z.string().uuid().optional(),
  primarySportConfigId: z.string().uuid().nullable().optional(),
  programCode: z.string().trim().min(1).max(80).nullable().optional(),
  levelCode: z.string().trim().min(1).max(80).nullable().optional(),
  categoryCode: z.string().trim().min(1).max(80).nullable().optional(),
});

// Handler for POST - separated to apply rate limiting
const createAthleteHandler = withTenant(async (request, context) => {
  try {
    const body = BodySchema.parse(await request.json());

    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
    }

    // Verificar acceso a la academia
    const academyAccess = await verifyAcademyAccess(body.academyId, context.tenantId);
    if (!academyAccess.allowed) {
      return apiError(academyAccess.reason ?? "ACADEMY_ACCESS_DENIED", "Access denied", 403);
    }

    // Verificar límites del plan antes de crear el atleta
    try {
      await assertWithinPlanLimits(context.tenantId, body.academyId, "athletes");
    } catch (error: unknown) {
      if (error instanceof LimitError) {
        const upgradeTo = error.payload?.upgradeTo ?? "pro";
        const currentPlan =
          upgradeTo === "pro" ? "free" : upgradeTo === "premium" ? "pro" : "premium";
        const upgradeInfo = getUpgradeInfo(currentPlan);

        return NextResponse.json(
          {
            ok: false,
            error: "LIMIT_REACHED",
            message: `Has alcanzado el límite de atletas de tu plan actual. Actualiza a ${upgradeTo.toUpperCase()} (${upgradeInfo.price}) para agregar más atletas.`,
            details: {
              ...error.payload,
              upgradeInfo: {
                plan: upgradeTo,
                price: upgradeInfo.price,
                benefits: upgradeInfo.benefits,
              },
            },
          },
          { status: 402 }
        );
      }
      throw error;
    }

    let groupRow: {
      id: string;
      sportConfigId: string | null;
      programCode: string | null;
      levelCode: string | null;
      categoryCode: string | null;
    } | null = null;

    // Verificar acceso al grupo si se proporciona
    if (body.groupId) {
      const groupAccess = await verifyGroupAccess(body.groupId, context.tenantId, body.academyId);
      if (!groupAccess.allowed) {
        return apiError(groupAccess.reason ?? "GROUP_NOT_FOUND", "Group not found", 404);
      }

      const [selectedGroup] = await db
        .select({
          id: groups.id,
          sportConfigId: groups.sportConfigId,
          programCode: groups.programCode,
          levelCode: groups.levelCode,
          categoryCode: groups.categoryCode,
        })
        .from(groups)
        .where(and(eq(groups.id, body.groupId), eq(groups.tenantId, context.tenantId), eq(groups.academyId, body.academyId)))
        .limit(1);

      groupRow = selectedGroup ?? null;
    }

    const effectiveSportConfigId = body.primarySportConfigId ?? groupRow?.sportConfigId ?? null;
    const effectiveProgramCode = body.programCode ?? groupRow?.programCode ?? null;
    const effectiveLevelCode = body.levelCode ?? groupRow?.levelCode ?? null;
    const effectiveCategoryCode = body.categoryCode ?? groupRow?.categoryCode ?? null;

    if (effectiveSportConfigId) {
      const verifiedConfig = await verifyAcademySportConfig({
        academyId: body.academyId,
        tenantId: context.tenantId,
        sportConfigId: effectiveSportConfigId,
      });

      if (!verifiedConfig) {
        return apiError("SPORT_CONFIG_NOT_FOUND", "La configuración deportiva no está activa en esta academia", 400);
      }

      const activeConfigs = await getAcademySportConfigOptions(body.academyId);
      const selectedConfig = activeConfigs.find((config) => config.id === effectiveSportConfigId);

      if (!selectedConfig) {
        return apiError("SPORT_CONFIG_NOT_FOUND", "La configuración deportiva no está disponible", 400);
      }

      if (!isProgramCodeAllowed(selectedConfig, effectiveProgramCode)) {
        return apiError("INVALID_PROGRAM", "El programa no pertenece a la configuración deportiva seleccionada", 400);
      }

      if (!isLevelCodeAllowed(selectedConfig, effectiveLevelCode, effectiveProgramCode)) {
        return apiError("INVALID_LEVEL", "El nivel no pertenece a la configuración deportiva seleccionada", 400);
      }

      if (!isCategoryCodeAllowed(selectedConfig, effectiveCategoryCode)) {
        return apiError("INVALID_CATEGORY", "La categoría no pertenece a la configuración deportiva seleccionada", 400);
      }
    }

    const athleteId = randomUUID();

    // Validar fecha de nacimiento si se proporciona
    let dobDate: Date | null = null;
    if (body.dob !== null && body.dob !== undefined) {
      // body.dob ya viene parseado como Date o null del transform
      if (body.dob instanceof Date) {
        // Verificar que la fecha sea razonable
        const year = body.dob.getFullYear();
        if (year < 1900 || year > 2100) {
          return apiError("INVALID_DOB", "El año de nacimiento debe estar entre 1900 y 2100", 400);
        }
        dobDate = body.dob;
      } else {
        // Si es null del transform, significa que la fecha era inválida
        return apiError("INVALID_DOB", "El formato de fecha de nacimiento no es válido. Use formato YYYY-MM-DD o ISO 8601", 400);
      }
    }

    // Usar transacción para garantizar atomicidad
    await withTransaction(async (tx) => {
      // Crear atleta
      await tx.insert(athletes).values({
        id: athleteId,
        tenantId: context.tenantId,
        academyId: body.academyId,
        name: body.name,
        dob: dobDate ? formatDateForDB(dobDate) : null,
        level: body.level,
        status: body.status ?? "active",
        primarySportConfigId: effectiveSportConfigId,
        programCode: effectiveProgramCode,
        levelCode: effectiveLevelCode,
        categoryCode: effectiveCategoryCode,
        groupId: body.groupId ?? null,
      });

      if (effectiveSportConfigId) {
        await tx
          .insert(athleteSportConfigs)
          .values({
            id: randomUUID(),
            tenantId: context.tenantId,
            athleteId,
            academySportConfigId: effectiveSportConfigId,
            programCode: effectiveProgramCode,
            levelCode: effectiveLevelCode,
            categoryCode: effectiveCategoryCode,
          })
          .onConflictDoNothing();
      }

      // Crear contactos si existen
      if (body.contacts?.length) {
        const rows = body.contacts.map((contact) => ({
          id: randomUUID(),
          tenantId: context.tenantId,
          athleteId,
          name: contact.name,
          relationship: contact.relationship ?? null,
          email: contact.email ?? null,
          phone: contact.phone ?? null,
          notifyEmail: contact.notifyEmail ?? true,
          notifySms: contact.notifySms ?? false,
        }));

        await tx.insert(familyContacts).values(rows).onConflictDoNothing();
      }

      // Asociar con grupo si existe
      if (body.groupId) {
        await tx
          .insert(groupAthletes)
          .values({
            id: randomUUID(),
            tenantId: context.tenantId,
            groupId: body.groupId,
            athleteId,
          })
          .onConflictDoNothing();
      }
    });

    await markWizardStep({
      academyId: body.academyId,
      tenantId: context.tenantId,
      step: "athletes",
    });

    const countResult = await db
      .select({
        value: sql<number>`count(*)`,
      })
      .from(athletes)
      .where(and(eq(athletes.academyId, body.academyId), eq(athletes.tenantId, context.tenantId)));

    const totalAthletes = Number(countResult?.[0]?.value ?? 0);

    if (totalAthletes === 1) {
      await trackEvent("first_athlete_added", { academyId: body.academyId, tenantId: context.tenantId });
    }

    if (totalAthletes >= 5) {
      await markChecklistItem({
        academyId: body.academyId,
        tenantId: context.tenantId,
        key: "add_5_athletes",
      });
    }

    // Log event for Super Admin metrics
    await logEvent({
      academyId: body.academyId,
      eventType: "athlete_created",
      metadata: {
        athleteId,
        level: body.level,
        status: body.status ?? "active",
      },
    });

    return apiCreated({ id: athleteId });
  } catch (error) {
    return handleApiError(error);
  }
});

// Rate-limited POST handler: 10 requests per minute for athlete creation
export const POST = withRateLimit(
  async (request) => {
    return (await createAthleteHandler(request, {} as any)) as NextResponse;
  },
  { identifier: getUserIdentifier, limit: 10, window: 60 }
);

const levelArraySchema = z
  .string()
  .transform((value) => value.split(",").map((item) => item.trim()).filter(Boolean));

const filterSchema = z.object({
  level: z.union([z.string(), levelArraySchema]).optional(),
  status: z
    .union([
      z.enum(athleteStatusOptions),
      z
        .string()
        .transform((value) =>
          value
            .split(",")
            .map((item) => item.trim())
            .filter((item): item is (typeof athleteStatusOptions)[number] =>
              (athleteStatusOptions as readonly string[]).includes(item)
            )
        ),
    ])
    .optional(),
  academyId: z.string().uuid().optional(),
  minAge: z.coerce.number().min(0).optional(),
  maxAge: z.coerce.number().min(0).optional(),
  tenantId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
  sportConfigId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const GET = withTenant(async (request, context) => {
  try {
    const url = new URL(request.url);
    const filters = filterSchema.safeParse(Object.fromEntries(url.searchParams));

    if (!filters.success) {
      return handleApiError(filters.error);
    }

  const { level, status, academyId, minAge, maxAge, tenantId: tenantOverride, groupId, sportConfigId, page = 1, limit = 50 } = filters.data;

  const effectiveTenantId = context.tenantId ?? tenantOverride ?? null;

  if (!effectiveTenantId) {
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }

  const levelList = Array.isArray(level) ? level : level ? [level] : [];
  const statusList = Array.isArray(status) ? status : status ? [status] : [];

  // Paginación
  const pageSize = Math.min(200, Math.max(1, limit));
  const offset = (page - 1) * pageSize;

  const ageExpr = sql<number | null>`CASE WHEN ${athletes.dob} IS NULL THEN NULL ELSE floor(date_part('year', age(now(), ${athletes.dob}))) END`;
  const guardianCount = sql<number>`count(distinct ${guardianAthletes.id})`;

  // Build where clause - only add filters that are actually provided
  // Use sql template literals to ensure all conditions are compatible
  const conditions: ReturnType<typeof sql>[] = [];

  // Always filter by tenant
  conditions.push(sql`${athletes.tenantId} = ${effectiveTenantId}`);

  if (levelList.length > 0) {
    // Use eq/inArray for simple cases, sql for complex
    const levelConditions = levelList.map(level => sql`${athletes.level} = ${level}`);
    if (levelConditions.length === 1) {
      conditions.push(levelConditions[0]);
    } else {
      conditions.push(sql`(${sql.join(levelConditions, sql` OR `)})`);
    }
  }

  if (statusList.length > 0) {
    const statusConditions = statusList.map(status => sql`${athletes.status} = ${status}`);
    if (statusConditions.length === 1) {
      conditions.push(statusConditions[0]);
    } else {
      conditions.push(sql`(${sql.join(statusConditions, sql` OR `)})`);
    }
  }

  if (academyId) {
    conditions.push(sql`${athletes.academyId} = ${academyId}`);
  }

  if (groupId) {
    conditions.push(sql`${athletes.groupId} = ${groupId}`);
  }

  if (sportConfigId) {
    conditions.push(sql`${athletes.primarySportConfigId} = ${sportConfigId}`);
  }

  if (typeof minAge === "number") {
    conditions.push(sql`(${ageExpr}) IS NULL OR (${ageExpr}) >= ${minAge}`);
  }

  if (typeof maxAge === "number") {
    conditions.push(sql`(${ageExpr}) IS NULL OR (${ageExpr}) <= ${maxAge}`);
  }

  // Combine all conditions with AND - simple approach
  let whereClause: any;
  if (conditions.length > 0) {
    whereClause = conditions[0];
    for (let i = 1; i < conditions.length; i++) {
      whereClause = and(whereClause, conditions[i]);
    }
  }

  // Get count efficiently using SQL COUNT instead of fetching all IDs
  const countResult = await db
    .select({ value: count() })
    .from(athletes)
    .leftJoin(guardianAthletes, eq(guardianAthletes.athleteId, athletes.id))
    .where(whereClause);

  const total = countResult[0]?.value ?? 0;

  // Query paginada con LIMIT y OFFSET en la base de datos
  const paginatedItems = await db
    .select({
      id: athletes.id,
      name: athletes.name,
      level: athletes.level,
      status: athletes.status,
      dob: athletes.dob,
      academyId: athletes.academyId,
      academyName: academies.name,
      groupId: athletes.groupId,
      groupName: groups.name,
      groupColor: groups.color,
      primarySportConfigId: athletes.primarySportConfigId,
      programCode: athletes.programCode,
      levelCode: athletes.levelCode,
      categoryCode: athletes.categoryCode,
      groupSportConfigId: groups.sportConfigId,
      groupProgramCode: groups.programCode,
      groupLevelCode: groups.levelCode,
      groupCategoryCode: groups.categoryCode,
      age: ageExpr,
      guardianCount,
    })
    .from(athletes)
    .leftJoin(academies, eq(athletes.academyId, academies.id))
    .leftJoin(groups, eq(athletes.groupId, groups.id))
    .leftJoin(guardianAthletes, eq(guardianAthletes.athleteId, athletes.id))
    .where(whereClause)
    .groupBy(athletes.id, academies.name, groups.name, groups.color, groups.sportConfigId, groups.programCode, groups.levelCode, groups.categoryCode)
    .orderBy(asc(athletes.name))
    .limit(pageSize)
    .offset(offset);

  const totalPages = Math.ceil(total / pageSize);

  return apiSuccess(paginatedItems, { total, page, pageSize });
  } catch (error) {
    return handleApiError(error);
  }
});
