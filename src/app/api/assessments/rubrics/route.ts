import { NextResponse } from "next/server";
import { eq, desc, and, or, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { assessmentRubrics, rubricCriteria } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { withTransaction } from "@/lib/db-transactions";
import { verifyAcademyAccess } from "@/lib/permissions";

const CreateRubricSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(["technical", "artistic", "physical", "behavioral", "overall"]),
  academyId: z.string().uuid().optional(),
  criteria: z.array(
    z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      maxScore: z.number().int().positive(),
      weight: z.number().int().positive(),
    })
  ).optional(),
});

const QuerySchema = z.object({
  academyId: z.string().uuid().optional(),
  type: z.enum(["technical", "artistic", "physical", "behavioral", "overall"]).optional(),
});

export const GET = withTenant(async (request, context) => {
  try {
    const { searchParams } = new URL(request.url);
    const query = QuerySchema.parse({
      academyId: searchParams.get("academyId"),
      type: searchParams.get("type"),
    });

    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    // Construir condiciones de búsqueda
    const conditions = [
      eq(assessmentRubrics.tenantId, context.tenantId),
      eq(assessmentRubrics.isActive, true),
    ];

    if (query.type) {
      conditions.push(eq(assessmentRubrics.type, query.type));
    }

    // Buscar rúbricas globales o de la academia específica
    if (query.academyId) {
      conditions.push(
        or(
          eq(assessmentRubrics.isGlobal, true),
          eq(assessmentRubrics.academyId, query.academyId)
        )!
      );
    } else {
      conditions.push(eq(assessmentRubrics.isGlobal, true));
    }

    const rubrics = await db
      .select()
      .from(assessmentRubrics)
      .where(and(...conditions))
      .orderBy(desc(assessmentRubrics.createdAt));

    // Obtener criterios para cada rúbrica
    const rubricsWithCriteria = await Promise.all(
      rubrics.map(async (rubric) => {
        const criteria = await db
          .select()
          .from(rubricCriteria)
          .where(eq(rubricCriteria.rubricId, rubric.id))
          .orderBy(rubricCriteria.orderIndex);

        return {
          ...rubric,
          criteria: criteria.map((c) => ({
            id: c.id,
            name: c.name,
            description: c.description,
            maxScore: c.maxScore,
            weight: c.weight,
            order: c.orderIndex,
          })),
          createdAt: rubric.createdAt?.toISOString(),
          updatedAt: rubric.updatedAt?.toISOString(),
        };
      })
    );

    return NextResponse.json({ rubrics: rubricsWithCriteria });
  } catch (error) {
    return handleApiError(error);
  }
});

export const POST = withTenant(async (request, context) => {
  try {
    const body = CreateRubricSchema.parse(await request.json());

    if (!context.tenantId) {
      return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
    }

    // Verificar acceso a la academia si se especifica
    if (body.academyId) {
      const academyAccess = await verifyAcademyAccess(body.academyId, context.tenantId);
      if (!academyAccess.allowed) {
        return NextResponse.json({ error: academyAccess.reason ?? "ACADEMY_ACCESS_DENIED" }, { status: 403 });
      }
    }

    const rubricId = crypto.randomUUID();

    await withTransaction(async (tx) => {
      // Crear rúbrica
      await tx.insert(assessmentRubrics).values({
        id: rubricId,
        tenantId: context.tenantId,
        academyId: body.academyId ?? null,
        name: body.name,
        description: body.description ?? null,
        type: body.type,
        isGlobal: !body.academyId,
        isActive: true,
      });

      // Crear criterios si se proporcionan
      if (body.criteria && body.criteria.length > 0) {
        const criteriaData = body.criteria.map((c, index) => ({
          id: crypto.randomUUID(),
          rubricId,
          name: c.name,
          description: c.description ?? null,
          maxScore: c.maxScore,
          weight: c.weight,
          orderIndex: index,
        }));

        await tx.insert(rubricCriteria).values(criteriaData);
      }
    });

    return NextResponse.json({ ok: true, id: rubricId });
  } catch (error) {
    return handleApiError(error);
  }
});
