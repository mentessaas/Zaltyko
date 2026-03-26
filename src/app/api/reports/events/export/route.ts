import { NextResponse } from "next/server";
import { z } from "zod";
import { and, asc, eq, gte, lte, sql, count } from "drizzle-orm";

import { db } from "@/db";
import { academies, events, eventRegistrations } from "@/db/schema";
import { generateEventsPDF } from "@/lib/reports/pdf-generator";
import { withTenant } from "@/lib/authz";
import * as XLSX from "xlsx";

// Forzar ruta dinámica
export const dynamic = 'force-dynamic';

const exportSchema = z.object({
  academyId: z.string().uuid(),
  format: z.enum(["pdf", "excel"]).default("pdf"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.string().optional(),
});

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const url = new URL(request.url);
  const params = {
    academyId: url.searchParams.get("academyId"),
    format: url.searchParams.get("format") || "pdf",
    startDate: url.searchParams.get("startDate"),
    endDate: url.searchParams.get("endDate"),
    status: url.searchParams.get("status"),
  };

  const validated = exportSchema.parse({
    ...params,
    academyId: params.academyId || undefined,
  });

  if (!validated.academyId) {
    return NextResponse.json({ error: "ACADEMY_ID_REQUIRED" }, { status: 400 });
  }

  const now = new Date();

  // Obtener eventos
  const eventConditions = [
    eq(events.academyId, validated.academyId),
    validated.startDate ? gte(events.startDate, validated.startDate) : undefined,
    validated.endDate ? lte(events.startDate, validated.endDate) : undefined,
    validated.status ? eq(events.status, validated.status as any) : undefined,
  ].filter(Boolean);

  let whereClause: ReturnType<typeof sql> | undefined;
  for (const condition of eventConditions) {
    whereClause = whereClause ? and(whereClause, condition) : condition;
  }

  const eventsData = await db
    .select({
      id: events.id,
      title: events.title,
      startDate: events.startDate,
      endDate: events.endDate,
      cityName: events.cityName,
      provinceName: events.provinceName,
      countryName: events.countryName,
      level: events.level,
      discipline: events.discipline,
      status: events.status,
      maxCapacity: events.maxCapacity,
      registrationFee: events.registrationFee,
    })
    .from(events)
    .where(whereClause)
    .orderBy(asc(events.startDate));

  // Obtener conteo de inscripciones por evento
  const registrationsCounts = await db
    .select({
      eventId: eventRegistrations.eventId,
      count: count(),
    })
    .from(eventRegistrations)
    .where(eq(eventRegistrations.status, "confirmed"))
    .groupBy(eventRegistrations.eventId);

  const regCountMap = new Map(registrationsCounts.map((r) => [r.eventId, Number(r.count)]));

  // Obtener academia
  const [academy] = await db
    .select({ name: academies.name })
    .from(academies)
    .where(eq(academies.id, validated.academyId))
    .limit(1);

  const academyName = academy?.name || "Academia";

  // Calcular resumen
  const summary = {
    total: eventsData.length,
    upcoming: eventsData.filter((e) => new Date(e.startDate || "") > now).length,
    completed: eventsData.filter((e) => new Date(e.startDate || "") <= now).length,
    totalRegistrations: Array.from(regCountMap.values()).reduce((a, b) => a + b, 0),
  };

  // Formatear eventos para el PDF
  const formattedEvents = eventsData.map((event) => ({
    title: event.title,
    startDate: event.startDate || "",
    endDate: event.endDate || "",
    location: [event.cityName, event.provinceName, event.countryName].filter(Boolean).join(", ") || "No especificada",
    level: event.level || "",
    discipline: event.discipline || "",
    status: event.status || "",
    registrations: regCountMap.get(event.id) || 0,
    maxCapacity: event.maxCapacity,
    registrationFee: event.registrationFee,
  }));

  const period = validated.startDate && validated.endDate
    ? `${validated.startDate} - ${validated.endDate}`
    : "Todos los períodos";

  if (validated.format === "excel") {
    const workbook = XLSX.utils.book_new();

    // Sheet de resumen
    const summarySheet = XLSX.utils.json_to_sheet([
      { Métrica: "Total de Eventos", Valor: summary.total },
      { Métrica: "Próximos", Valor: summary.upcoming },
      { Métrica: "Completados", Valor: summary.completed },
      { Métrica: "Total de Inscripciones", Valor: summary.totalRegistrations },
    ]);
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Resumen");

    // Sheet de eventos
    const eventsSheet = XLSX.utils.json_to_sheet(formattedEvents.map((e) => ({
      Título: e.title,
      "Fecha inicio": e.startDate,
      "Fecha fin": e.endDate,
      Ubicación: e.location,
      Nivel: e.level,
      Disciplina: e.discipline,
      Estado: e.status,
      Inscripciones: e.registrations,
      "Capacidad máxima": e.maxCapacity || "",
      "Fee de inscripción": e.registrationFee ? `${(e.registrationFee / 100).toFixed(2)} €` : "",
    })));
    XLSX.utils.book_append_sheet(workbook, eventsSheet, "Eventos");

    const excelBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(excelBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="reporte-eventos.xlsx"`,
      },
    });
  }

  // Generar PDF
  const pdfBuffer = await generateEventsPDF({
    title: "Reporte de Eventos",
    academyName,
    period,
    events: formattedEvents,
    summary,
  });

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="reporte-eventos.pdf"`,
    },
  });
});
