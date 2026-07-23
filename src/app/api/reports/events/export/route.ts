import { and, asc, eq, gte, lte } from "drizzle-orm";
import * as XLSX from "xlsx";
import { z } from "zod";

import { db } from "@/db";
import { eventRegistrations, events, profiles } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { apiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const exportSchema = z.object({
  academyId: z.string().uuid(),
  eventId: z.string().uuid().optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
});

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant context is required", 400);
  }

  const url = new URL(request.url);
  const parsed = exportSchema.safeParse({
    academyId: url.searchParams.get("academyId"),
    eventId: url.searchParams.get("eventId") || undefined,
    startDate: url.searchParams.get("startDate") || undefined,
    endDate: url.searchParams.get("endDate") || undefined,
  });

  if (!parsed.success) {
    return apiError("INVALID_FILTERS", "Los filtros de exportación no son válidos", 400);
  }

  const { academyId, eventId, startDate, endDate } = parsed.data;
  const conditions = [
    eq(events.tenantId, context.tenantId),
    eq(events.academyId, academyId),
    eventId ? eq(events.id, eventId) : undefined,
    startDate ? gte(events.startDate, startDate) : undefined,
    endDate ? lte(events.startDate, endDate) : undefined,
  ].filter(Boolean);

  const rows = await db
    .select({
      eventId: events.id,
      title: events.title,
      startDate: events.startDate,
      endDate: events.endDate,
      status: events.status,
      level: events.level,
      discipline: events.discipline,
      eventType: events.eventType,
      competitionTypeCode: events.competitionTypeCode,
      country: events.countryName,
      province: events.provinceName,
      city: events.cityName,
      registrationFee: events.registrationFee,
      registrationStatus: eventRegistrations.status,
      registeredAt: eventRegistrations.registeredAt,
      participant: profiles.name,
    })
    .from(events)
    .leftJoin(eventRegistrations, eq(eventRegistrations.eventId, events.id))
    .leftJoin(profiles, eq(profiles.id, eventRegistrations.profileId))
    .where(and(...conditions))
    .orderBy(asc(events.startDate), asc(events.title), asc(profiles.name));

  const exportRows = rows.map((row) => ({
    Evento: row.title,
    "Fecha inicio": row.startDate,
    "Fecha fin": row.endDate ?? "",
    Estado: row.status,
    Nivel: row.level,
    Disciplina: row.discipline ?? "",
    Tipo: row.eventType ?? "",
    "Código competición": row.competitionTypeCode ?? "",
    País: row.country ?? "",
    Provincia: row.province ?? "",
    Ciudad: row.city ?? "",
    "Cuota (céntimos)": row.registrationFee ?? "",
    Participante: row.participant ?? "",
    "Estado inscripción": row.registrationStatus ?? "Sin inscripción",
    "Fecha inscripción": row.registeredAt ? row.registeredAt.toISOString() : "",
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(exportRows), "Eventos");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="eventos-${Date.now()}.xlsx"`,
      "Content-Length": String(buffer.byteLength),
    },
  });
});
