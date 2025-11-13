import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, athletes, familyContacts, guardianAthletes, groupAthletes, groups } from "@/db/schema";
import { assertWithinPlanLimits } from "@/lib/limits";
import { withTenant } from "@/lib/authz";
import { athleteStatusOptions } from "@/lib/athletes/constants";
import { handleApiError } from "@/lib/api-error-handler";
import { withTransaction } from "@/lib/db-transactions";
import { verifyAcademyAccess, verifyGroupAccess } from "@/lib/permissions";

const ContactSchema = z.object({
  name: z.string().min(1),
  relationship: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  notifyEmail: z.boolean().optional(),
  notifySms: z.boolean().optional(),
});

const BodySchema = z.object({
  academyId: z.string().uuid(),
  name: z.string().min(1),
  dob: z.string().optional(),
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

    await assertWithinPlanLimits(context.tenantId, body.academyId, "athletes");

    // Verificar acceso al grupo si se proporciona
    if (body.groupId) {
      const groupAccess = await verifyGroupAccess(body.groupId, context.tenantId, body.academyId);
      if (!groupAccess.allowed) {
        return NextResponse.json({ error: groupAccess.reason ?? "GROUP_NOT_FOUND" }, { status: 404 });
      }
    }

    const athleteId = randomUUID();

    // Usar transacción para garantizar atomicidad
    await withTransaction(async (tx) => {
      // Crear atleta
      await tx.insert(athletes).values({
        id: athleteId,
        tenantId: context.tenantId,
        academyId: body.academyId,
        name: body.name,
        dob: body.dob ?? null,
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

  // Contar total (sin paginación)
  // Usamos una subquery para contar correctamente con los joins
  const countResult = await db
    .select({ count: sql<number>`count(distinct ${athletes.id})` })
    .from(athletes)
    .leftJoin(guardianAthletes, eq(guardianAthletes.athleteId, athletes.id))
    .where(whereClause);
  
  const total = countResult[0]?.count ? Number(countResult[0].count) : 0;

  // Query paginada
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
    .orderBy(asc(athletes.name))
    .limit(pageSize)
    .offset(offset);

    const totalPages = Math.ceil(total / pageSize);

    return NextResponse.json({
      total,
      page,
      pageSize,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
      items: rows,
    });
  } catch (error) {
    return handleApiError(error);
  }
});

