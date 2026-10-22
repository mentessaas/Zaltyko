export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import * as XLSX from "xlsx";
import { z } from "zod";

import { db } from "@/db";
import {
  academies,
  academySportConfigs,
  athletes,
  guardianAthletes,
  guardians,
  groups,
  sportLocaleConfigs,
} from "@/db/schema";
import { athleteStatusOptions } from "@/lib/athletes/constants";
import { withTenant } from "@/lib/authz";
import { apiError } from "@/lib/api-response";

export const runtime = "nodejs";

export const GET = withTenant(async (request, context) => {
  const url = new URL(request.url);
  const tenantOverride = url.searchParams.get("tenantId");
  const effectiveTenantId = context.profile.role === "super_admin"
    ? tenantOverride ?? context.tenantId ?? null
    : context.tenantId;

  if (!effectiveTenantId) {
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }

  const statusFilter = url.searchParams.get("status");
  const levelFilter = url.searchParams.get("level");
  const academyId = url.searchParams.get("academyId");

  if (academyId && !z.string().uuid().safeParse(academyId).success) {
    return apiError("INVALID_ACADEMY_ID", "Academy ID must be a valid UUID", 400);
  }

  const ageExpr = sql<number | null>`CASE WHEN ${athletes.dob} IS NULL THEN NULL ELSE floor(date_part('year', age(now(), ${athletes.dob}))) END`;
  const guardianNames = sql<string[]>`array_remove(array_agg(distinct ${guardians.name}), NULL)`;

  const whereConditions = [
    eq(athletes.tenantId, effectiveTenantId),
    isNull(athletes.deletedAt),
    academyId ? eq(athletes.academyId, academyId) : undefined,
    statusFilter && (athleteStatusOptions as readonly string[]).includes(statusFilter)
      ? eq(athletes.status, statusFilter)
      : undefined,
    levelFilter ? eq(athletes.level, levelFilter) : undefined,
  ].filter(Boolean) as Array<ReturnType<typeof eq>>;

  let whereClause: ReturnType<typeof sql> | undefined;
  for (const condition of whereConditions) {
    whereClause = whereClause ? and(whereClause, condition) : condition;
  }

  const rows = await db
    .select({
      name: athletes.name,
      level: athletes.level,
      status: athletes.status,
      dob: athletes.dob,
      academyName: academies.name,
      academyId: athletes.academyId,
      groupName: groups.name,
      groupId: athletes.groupId,
      sportConfigId: athletes.primarySportConfigId,
      sportConfigCode: sportLocaleConfigs.code,
      sportConfigName: sportLocaleConfigs.name,
      programCode: athletes.programCode,
      levelCode: athletes.levelCode,
      categoryCode: athletes.categoryCode,
      guardianNames,
      age: ageExpr,
    })
    .from(athletes)
    .leftJoin(academies, and(eq(athletes.academyId, academies.id), eq(academies.tenantId, effectiveTenantId)))
    .leftJoin(
      groups,
      and(
        eq(athletes.groupId, groups.id),
        eq(groups.tenantId, effectiveTenantId),
        isNull(groups.deletedAt),
      ),
    )
    .leftJoin(
      academySportConfigs,
      and(
        eq(athletes.primarySportConfigId, academySportConfigs.id),
        eq(academySportConfigs.tenantId, effectiveTenantId),
        eq(academySportConfigs.academyId, athletes.academyId),
        eq(academySportConfigs.isActive, true),
      ),
    )
    .leftJoin(sportLocaleConfigs, eq(academySportConfigs.sportLocaleConfigId, sportLocaleConfigs.id))
    .leftJoin(
      guardianAthletes,
      and(
        eq(guardianAthletes.athleteId, athletes.id),
        eq(guardianAthletes.tenantId, effectiveTenantId),
      ),
    )
    .leftJoin(guardians, and(eq(guardianAthletes.guardianId, guardians.id), eq(guardians.tenantId, effectiveTenantId)))
    .where(whereClause)
    .groupBy(athletes.id, academies.name, groups.name, sportLocaleConfigs.code, sportLocaleConfigs.name)
    .orderBy(asc(athletes.name))
    .limit(10000);

  // Los campos de texto pueden ser introducidos por usuarios; neutralizar
  // prefijos de fórmula evita CSV/XLSX injection al abrir la exportación.
  const safeSpreadsheetText = (value: string | null | undefined): string => {
    const text = value ?? "";
    return /^[=+\-@]/.test(text) ? `'${text}` : text;
  };

  // Helper para formatear fecha
  const formatDate = (date: Date | string | null | undefined): string => {
    if (!date) return "";
    if (typeof date === "object" && date instanceof Date) {
      return date.toISOString().split("T")[0];
    }
    const dateStr = String(date);
    return dateStr.split("T")[0];
  };

  const exportRows = rows.map((row) => ({
    Nombre: safeSpreadsheetText(row.name),
    Nivel: safeSpreadsheetText(row.level),
    "Configuración deportiva": safeSpreadsheetText(row.sportConfigName),
    sportConfigId: row.sportConfigId ?? "",
    sportConfigCode: row.sportConfigCode ?? "",
    programCode: row.programCode ?? "",
    levelCode: row.levelCode ?? "",
    categoryCode: row.categoryCode ?? "",
    Estado: safeSpreadsheetText(row.status),
    Edad: row.age ?? "",
    "Fecha de nacimiento": formatDate(row.dob),
    Academia: safeSpreadsheetText(row.academyName),
    academyId: row.academyId ?? "",
    Grupo: safeSpreadsheetText(row.groupName),
    groupId: row.groupId ?? "",
    Familia: safeSpreadsheetText(Array.isArray(row.guardianNames) ? row.guardianNames.join("; ") : ""),
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Atletas");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="athletes-${Date.now()}.xlsx"`,
      "Content-Length": buffer.byteLength.toString(),
    },
  });
});
