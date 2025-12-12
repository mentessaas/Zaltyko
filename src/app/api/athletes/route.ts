import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, athletes, familyContacts, guardianAthletes, groupAthletes, groups } from "@/db/schema";
import { assertWithinPlanLimits, getUpgradeInfo } from "@/lib/limits";
import { withTenant } from "@/lib/authz";
import { athleteStatusOptions } from "@/lib/athletes/constants";
import { handleApiError } from "@/lib/api-error-handler";
import { withTransaction } from "@/lib/db-transactions";
import { verifyAcademyAccess, verifyGroupAccess } from "@/lib/permissions";
import { markChecklistItem, markWizardStep } from "@/lib/onboarding";
import { trackEvent } from "@/lib/analytics";
import { logEvent } from "@/lib/event-logging";
import { validateDateWithError, formatDateForDB } from "@/lib/validation/date-utils";

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
});

export const POST = withTenant(async (request, context) => {
  try {
    const body = BodySchema.parse(await request.json());

    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    // Verificar acceso a la academia
    const academyAccess = await verifyAcademyAccess(body.academyId, context.tenantId);
    if (!academyAccess.allowed) {
      return NextResponse.json({ error: academyAccess.reason ?? "ACADEMY_ACCESS_DENIED" }, { status: 403 });
    }

    // Verificar límites del plan antes de crear el atleta
    try {
      await assertWithinPlanLimits(context.tenantId, body.academyId, "athletes");
    } catch (error: any) {
      if (error?.status === 402 && error?.payload?.code === "LIMIT_REACHED") {
        const upgradeTo = error.payload?.upgradeTo ?? "pro";
        const upgradeInfo = getUpgradeInfo(upgradeTo === "pro" ? "free" : "pro");
        
        return NextResponse.json(
          {
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

    // Verificar acceso al grupo si se proporciona
    if (body.groupId) {
      const groupAccess = await verifyGroupAccess(body.groupId, context.tenantId, body.academyId);
      if (!groupAccess.allowed) {
        return NextResponse.json({ error: groupAccess.reason ?? "GROUP_NOT_FOUND" }, { status: 404 });
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
          return NextResponse.json(
            { error: "INVALID_DOB", message: "El año de nacimiento debe estar entre 1900 y 2100" },
            { status: 400 }
          );
        }
        dobDate = body.dob;
      } else {
        // Si es null del transform, significa que la fecha era inválida
        return NextResponse.json(
          { error: "INVALID_DOB", message: "El formato de fecha de nacimiento no es válido. Use formato YYYY-MM-DD o ISO 8601" },
          { status: 400 }
        );
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
        groupId: body.groupId ?? null,
      });

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

    return NextResponse.json({ ok: true, id: athleteId });
  } catch (error) {
    return handleApiError(error);
  }
});

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

  const { level, status, academyId, minAge, maxAge, tenantId: tenantOverride, groupId, page = 1, limit = 50 } = filters.data;

  const effectiveTenantId = context.tenantId ?? tenantOverride ?? null;

  if (!effectiveTenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const levelList = Array.isArray(level) ? level : level ? [level] : [];
  const statusList = Array.isArray(status) ? status : status ? [status] : [];

  // Paginación
  const pageSize = Math.min(200, Math.max(1, limit));
  const offset = (page - 1) * pageSize;

  const ageExpr = sql<number | null>`CASE WHEN ${athletes.dob} IS NULL THEN NULL ELSE floor(date_part('year', age(now(), ${athletes.dob}))) END`;
  const guardianCount = sql<number>`count(distinct ${guardianAthletes.id})`;

  const whereConditions = [
    eq(athletes.tenantId, effectiveTenantId),
    levelList.length ? inArray(athletes.level, levelList) : undefined,
    statusList.length ? inArray(athletes.status, statusList) : undefined,
    academyId ? eq(athletes.academyId, academyId) : undefined,
    groupId ? eq(athletes.groupId, groupId) : undefined,
    typeof minAge === "number"
      ? sql`(${ageExpr}) IS NULL OR (${ageExpr}) >= ${minAge}`
      : undefined,
    typeof maxAge === "number"
      ? sql`(${ageExpr}) IS NULL OR (${ageExpr}) <= ${maxAge}`
      : undefined,
  ].filter(Boolean) as Array<ReturnType<typeof eq> | ReturnType<typeof sql>>;

  let whereClause: ReturnType<typeof sql> | undefined;
  for (const condition of whereConditions) {
    whereClause = whereClause ? and(whereClause, condition) : condition;
  }

  // Query y paginación manejada en memoria (datasets pequeños en onboarding)
  const rows = await db
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
      age: ageExpr,
      guardianCount,
    })
    .from(athletes)
    .leftJoin(academies, eq(athletes.academyId, academies.id))
    .leftJoin(groups, eq(athletes.groupId, groups.id))
    .leftJoin(guardianAthletes, eq(guardianAthletes.athleteId, athletes.id))
    .where(whereClause)
    .groupBy(athletes.id, academies.name, groups.name, groups.color)
    .orderBy(asc(athletes.name));

  const total = rows.length;
  const paginatedItems = rows.slice(offset, offset + pageSize);

    const totalPages = Math.ceil(total / pageSize);

    return NextResponse.json({
      total,
      page,
      pageSize,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
      items: paginatedItems,
    });
  } catch (error) {
    return handleApiError(error);
  }
});

