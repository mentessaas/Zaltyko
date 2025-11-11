import { NextResponse } from "next/server";
import { and, asc, eq, sql } from "drizzle-orm";
import * as XLSX from "xlsx";

import { db } from "@/db";
import {
  academies,
  athletes,
  guardianAthletes,
  guardians,
} from "@/db/schema";
import { athleteStatusOptions } from "@/lib/athletes/constants";
import { withTenant } from "@/lib/authz";

export const runtime = "nodejs";

export const GET = withTenant(async (request, context) => {
  const url = new URL(request.url);
  const tenantOverride = url.searchParams.get("tenantId");
  const effectiveTenantId = context.tenantId ?? tenantOverride ?? null;

  if (!effectiveTenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const statusFilter = url.searchParams.get("status");
  const levelFilter = url.searchParams.get("level");

  const ageExpr = sql<number | null>`CASE WHEN ${athletes.dob} IS NULL THEN NULL ELSE floor(date_part('year', age(now(), ${athletes.dob}))) END`;
  const guardianNames = sql<string[]>`array_remove(array_agg(distinct ${guardians.name}), NULL)`;

  const whereConditions = [
    eq(athletes.tenantId, effectiveTenantId),
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
      guardianNames,
      age: ageExpr,
    })
    .from(athletes)
    .leftJoin(academies, eq(athletes.academyId, academies.id))
    .leftJoin(guardianAthletes, eq(guardianAthletes.athleteId, athletes.id))
    .leftJoin(guardians, eq(guardianAthletes.guardianId, guardians.id))
    .where(whereClause)
    .groupBy(athletes.id, academies.name)
    .orderBy(asc(athletes.name));

  const exportRows = rows.map((row) => ({
    Nombre: row.name,
    Nivel: row.level ?? "",
    Estado: row.status,
    Edad: row.age ?? "",
    "Fecha de nacimiento": row.dob ? row.dob.toISOString().split("T")[0] : "",
    Academia: row.academyName ?? "",
    Familia: Array.isArray(row.guardianNames) ? row.guardianNames.join("; ") : "",
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


