import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { assessmentTypes } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { withTransaction } from "@/lib/db-transactions";

const CreateTypeSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(["technical", "artistic", "physical", "behavioral", "overall"]),
});

// Tipos de evaluación por defecto
const defaultTypes = [
  { name: "Técnica", description: "Evaluación de habilidades técnicas específicas del deporte", type: "technical" as const },
  { name: "Artística", description: "Evaluación de expresión artística y coreografía", type: "artistic" as const },
  { name: "Condición Física", description: "Evaluación de fuerza, flexibilidad y resistencia", type: "physical" as const },
  { name: "Comportamental", description: "Evaluación de actitud, disciplina y comportamiento", type: "behavioral" as const },
  { name: "General", description: "Evaluación integral del atleta", type: "overall" as const },
];

export const GET = withTenant(async (request, context) => {
  try {
    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    const types = await db
      .select()
      .from(assessmentTypes)
      .where(eq(assessmentTypes.tenantId, context.tenantId))
      .orderBy(desc(assessmentTypes.isDefault), desc(assessmentTypes.createdAt));

    // Si no hay tipos definidos, retornar los tipos por defecto
    if (types.length === 0) {
      return NextResponse.json({
        types: defaultTypes.map((t) => ({
          ...t,
          isDefault: true,
          isActive: true,
        })),
      });
    }

    return NextResponse.json({
      types: types.map((t) => ({
        ...t,
        createdAt: t.createdAt?.toISOString(),
        updatedAt: t.updatedAt?.toISOString(),
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
});

export const POST = withTenant(async (request, context) => {
  try {
    const body = CreateTypeSchema.parse(await request.json());

    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    const typeId = crypto.randomUUID();

    await withTransaction(async (tx) => {
      await tx.insert(assessmentTypes).values({
        id: typeId,
        tenantId: context.tenantId,
        name: body.name,
        description: body.description ?? null,
        type: body.type,
        isDefault: false,
        isActive: true,
      });
    });

    return NextResponse.json({ ok: true, id: typeId });
  } catch (error) {
    return handleApiError(error);
  }
});
