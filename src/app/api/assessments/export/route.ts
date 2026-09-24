export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { and, asc, eq, gte, isNull, lte, sql, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, athletes, athleteAssessments, coaches } from "@/db/schema";
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
    return apiError("TENANT_REQUIRED", "Tenant context is required", 400);
  }

  const academyId = url.searchParams.get("academyId");
  if (academyId && !z.string().uuid().safeParse(academyId).success) {
    return apiError("INVALID_ACADEMY_ID", "Academy ID must be a valid UUID", 400);
  }
  const athleteIds = url.searchParams.get("athleteIds")?.split(",").filter(Boolean);
  const startDate = url.searchParams.get("startDate");
  const endDate = url.searchParams.get("endDate");
  const assessmentType = url.searchParams.get("assessmentType") as any;

  const whereConditions = [
    eq(athleteAssessments.tenantId, effectiveTenantId),
    academyId ? eq(athleteAssessments.academyId, academyId) : undefined,
    athleteIds && athleteIds.length > 0 ? inArray(athleteAssessments.athleteId, athleteIds) : undefined,
    startDate ? gte(athleteAssessments.assessmentDate, startDate) : undefined,
    endDate ? lte(athleteAssessments.assessmentDate, endDate) : undefined,
    assessmentType ? eq(athleteAssessments.assessmentType, assessmentType) : undefined,
  ].filter(Boolean);

  let whereClause: ReturnType<typeof sql> | undefined;
  for (const condition of whereConditions) {
    whereClause = whereClause ? and(whereClause, condition) : condition;
  }

  const rows = await db
    .select({
      id: athleteAssessments.id,
      athleteName: athletes.name,
      assessmentDate: athleteAssessments.assessmentDate,
      assessmentType: athleteAssessments.assessmentType,
      apparatus: athleteAssessments.apparatus,
      overallComment: athleteAssessments.overallComment,
      totalScore: athleteAssessments.totalScore,
      assessedByName: coaches.name,
      academyName: academies.name,
    })
    .from(athleteAssessments)
    .innerJoin(
      athletes,
      and(
        eq(athleteAssessments.athleteId, athletes.id),
        eq(athletes.tenantId, effectiveTenantId),
        eq(athletes.academyId, athleteAssessments.academyId),
        isNull(athletes.deletedAt),
      ),
    )
    .leftJoin(coaches, and(eq(athleteAssessments.assessedBy, coaches.id), eq(coaches.tenantId, effectiveTenantId)))
    .leftJoin(academies, and(eq(athleteAssessments.academyId, academies.id), eq(academies.tenantId, effectiveTenantId)))
    .where(whereClause)
    .orderBy(asc(athleteAssessments.assessmentDate))
    .limit(10000);

  // Helper para formatear fecha
  const formatDate = (date: Date | string | null | undefined): string => {
    if (!date) return "";
    if (typeof date === "object" && date instanceof Date) {
      return date.toISOString().split("T")[0];
    }
    const dateStr = String(date);
    return dateStr.split("T")[0];
  };

  // Helper para formatear tipo de evaluación
  const formatAssessmentType = (type: string): string => {
    const typeMap: Record<string, string> = {
      technical: "Técnica",
      physical: "Física",
      psychological: "Psicológica",
      tactical: "Táctica",
      routine: "Rutina",
      competition: "Competición",
    };
    return typeMap[type] || type;
  };

  // Helper para formatear puntuación
  const formatScore = (score: string | null): string => {
    if (!score) return "";
    try {
      const parsed = JSON.parse(score);
      if (typeof parsed === "object") {
        return Object.entries(parsed)
          .map(([key, value]) => `${key}: ${value}`)
          .join(", ");
      }
      return String(score);
    } catch {
      return String(score);
    }
  };

  const XLSX = await import("xlsx");

  const exportRows = rows.map((row) => ({
    ID: row.id,
    Atleta: row.athleteName || "",
    "Fecha de evaluación": formatDate(row.assessmentDate),
    "Tipo de evaluación": formatAssessmentType(row.assessmentType),
    Aparato: row.apparatus || "",
    Puntuación: formatScore(row.totalScore),
    Comentario: row.overallComment || "",
    Evaluado: row.assessedByName || "",
    Academia: row.academyName || "",
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Evaluaciones");

  // Agregar sheet con estadísticas
  const statsByType = rows.reduce((acc, row) => {
    const type = formatAssessmentType(row.assessmentType);
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const statsRows = Object.entries(statsByType).map(([type, count]) => ({
    Tipo: type,
    "Cantidad de evaluaciones": count,
  }));

  const statsSheet = XLSX.utils.json_to_sheet(statsRows);
  XLSX.utils.book_append_sheet(workbook, statsSheet, "Estadísticas");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="evaluaciones-${Date.now()}.xlsx"`,
      "Content-Length": buffer.byteLength.toString(),
    },
  });
});
