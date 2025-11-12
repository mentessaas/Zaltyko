import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";

import { db } from "@/db";
import { classes } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { generateRecurringSessions } from "@/lib/sessions-generator";

const bodySchema = z.object({
  classId: z.string().uuid(),
  startDate: z.string().min(1), // ISO date string
  endDate: z.string().min(1), // ISO date string
});

export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const body = bodySchema.parse(await request.json());

  // Validar que la clase existe y pertenece al tenant
  const [classRow] = await db
    .select({
      id: classes.id,
      name: classes.name,
      weekday: classes.weekday,
    })
    .from(classes)
    .where(and(eq(classes.id, body.classId), eq(classes.tenantId, context.tenantId)))
    .limit(1);

  if (!classRow) {
    return NextResponse.json({ error: "CLASS_NOT_FOUND" }, { status: 404 });
  }

  if (classRow.weekday === null || classRow.weekday === undefined) {
    return NextResponse.json(
      { error: "CLASS_HAS_NO_WEEKDAY", message: "La clase no tiene un día de la semana configurado" },
      { status: 400 }
    );
  }

  // Validar fechas
  const startDate = new Date(body.startDate);
  const endDate = new Date(body.endDate);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return NextResponse.json({ error: "INVALID_DATE_FORMAT" }, { status: 400 });
  }

  if (startDate > endDate) {
    return NextResponse.json(
      { error: "INVALID_DATE_RANGE", message: "La fecha de inicio debe ser anterior a la fecha de fin" },
      { status: 400 }
    );
  }

  try {
    const result = await generateRecurringSessions({
      classId: body.classId,
      tenantId: context.tenantId,
      startDate,
      endDate,
    });

    return NextResponse.json({
      ok: true,
      ...result,
      className: classRow.name,
    });
  } catch (error: any) {
    console.error("Error generating sessions", error);
    
    if (error.message === "CLASS_NOT_FOUND") {
      return NextResponse.json({ error: "CLASS_NOT_FOUND" }, { status: 404 });
    }
    
    if (error.message === "CLASS_HAS_NO_WEEKDAY") {
      return NextResponse.json(
        { error: "CLASS_HAS_NO_WEEKDAY", message: error.message },
        { status: 400 }
      );
    }

    if (error.message?.includes("RANGE_TOO_LARGE")) {
      return NextResponse.json(
        { error: "RANGE_TOO_LARGE", message: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "GENERATION_FAILED", message: error.message ?? "Error al generar sesiones" },
      { status: 500 }
    );
  }
});

