import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { eventCategories, events } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { withRateLimit, getUserIdentifier } from "@/lib/rate-limit";
import { withPayloadValidation } from "@/lib/payload-validator";

export const dynamic = "force-dynamic";

const CreateCategorySchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(100),
  description: z.string().optional(),
  minAge: z.number().int().min(0).optional(),
  maxAge: z.number().int().min(0).optional(),
  levels: z.array(z.enum(["beginner", "intermediate", "advanced", "elite"])).optional(),
  gender: z.enum(["female", "male", "mixed"]).optional(),
  maxCapacity: z.number().int().positive().optional(),
  registrationFee: z.number().int().positive().optional(),
  sortOrder: z.number().int().default(0),
});

const UpdateCategorySchema = z.object({
  categoryId: z.string().uuid("ID de categoría inválido"),
  name: z.string().min(1, "El nombre es requerido").max(100).optional(),
  description: z.string().optional(),
  minAge: z.number().int().min(0).optional(),
  maxAge: z.number().int().min(0).optional(),
  levels: z.array(z.enum(["beginner", "intermediate", "advanced", "elite"])).optional(),
  gender: z.enum(["female", "male", "mixed"]).optional(),
  maxCapacity: z.number().int().positive().optional(),
  registrationFee: z.number().int().positive().optional(),
  sortOrder: z.number().int().optional(),
});

/**
 * POST /api/events/[id]/categories
 * Crea una categoría para un evento
 */
export const POST = withRateLimit(
  withPayloadValidation(
    withTenant(async (request, context) => {
      try {
        const body = CreateCategorySchema.parse(await request.json());
        const { id: eventId } = await (context.params as Promise<{ id: string }>);

        // Verificar que el evento existe
        const [event] = await db
          .select()
          .from(events)
          .where(eq(events.id, eventId))
          .limit(1);

        if (!event) {
          return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });
        }

        // Verificar que no existe una categoría con el mismo nombre
        const [existing] = await db
          .select()
          .from(eventCategories)
          .where(
            and(
              eq(eventCategories.eventId, eventId),
              eq(eventCategories.name, body.name)
            )
          )
          .limit(1);

        if (existing) {
          return NextResponse.json({ error: "CATEGORY_ALREADY_EXISTS" }, { status: 400 });
        }

        // Crear categoría
        const [category] = await db
          .insert(eventCategories)
          .values({
            eventId,
            name: body.name,
            description: body.description ?? null,
            minAge: body.minAge ?? null,
            maxAge: body.maxAge ?? null,
            levels: body.levels ?? null,
            gender: body.gender ?? null,
            maxCapacity: body.maxCapacity ?? null,
            registrationFee: body.registrationFee ?? null,
            sortOrder: body.sortOrder ?? 0,
          })
          .returning();

        return NextResponse.json({
          ok: true,
          category,
        });
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          return NextResponse.json(
            { error: "VALIDATION_ERROR", details: error.errors },
            { status: 400 }
          );
        }
        return handleApiError(error, { endpoint: "/api/events/categories", method: "POST" });
      }
    }),
    { maxSize: 1024 }
  ),
  { identifier: getUserIdentifier }
);

/**
 * GET /api/events/[id]/categories
 * Lista categorías de un evento
 */
export const GET = withTenant(async (request, context) => {
  try {
    const { id: eventId } = await (context.params as Promise<{ id: string }>);

    const categories = await db
      .select()
      .from(eventCategories)
      .where(eq(eventCategories.eventId, eventId))
      .orderBy(asc(eventCategories.sortOrder), asc(eventCategories.name));

    return NextResponse.json({
      items: categories,
    });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/events/categories", method: "GET" });
  }
});

/**
 * PATCH /api/events/[id]/categories
 * Actualiza una categoría
 */
export const PATCH = withRateLimit(
  withPayloadValidation(
    withTenant(async (request, context) => {
      try {
        const body = UpdateCategorySchema.parse(await request.json());
        const { id: eventId } = await (context.params as Promise<{ id: string }>);

        // Verificar que la categoría existe
        const [category] = await db
          .select()
          .from(eventCategories)
          .where(
            and(
              eq(eventCategories.id, body.categoryId),
              eq(eventCategories.eventId, eventId)
            )
          )
          .limit(1);

        if (!category) {
          return NextResponse.json({ error: "CATEGORY_NOT_FOUND" }, { status: 404 });
        }

        // Si se cambia el nombre, verificar que no existe otra categoría con ese nombre
        if (body.name && body.name !== category.name) {
          const [existing] = await db
            .select()
            .from(eventCategories)
            .where(
              and(
                eq(eventCategories.eventId, eventId),
                eq(eventCategories.name, body.name)
              )
            )
            .limit(1);

          if (existing) {
            return NextResponse.json({ error: "CATEGORY_ALREADY_EXISTS" }, { status: 400 });
          }
        }

        // Actualizar categoría
        const [updated] = await db
          .update(eventCategories)
          .set({
            name: body.name ?? category.name,
            description: body.description ?? category.description,
            minAge: body.minAge ?? category.minAge,
            maxAge: body.maxAge ?? category.maxAge,
            levels: body.levels ?? category.levels,
            gender: body.gender ?? category.gender,
            maxCapacity: body.maxCapacity ?? category.maxCapacity,
            registrationFee: body.registrationFee ?? category.registrationFee,
            sortOrder: body.sortOrder ?? category.sortOrder,
            updatedAt: new Date(),
          })
          .where(eq(eventCategories.id, body.categoryId))
          .returning();

        return NextResponse.json({
          ok: true,
          category: updated,
        });
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          return NextResponse.json(
            { error: "VALIDATION_ERROR", details: error.errors },
            { status: 400 }
          );
        }
        return handleApiError(error, { endpoint: "/api/events/categories", method: "PATCH" });
      }
    }),
    { maxSize: 1024 }
  ),
  { identifier: getUserIdentifier }
);

/**
 * DELETE /api/events/[id]/categories
 * Elimina una categoría
 */
export const DELETE = withRateLimit(
  withTenant(async (request, context) => {
    try {
      const url = new URL(request.url);
      const { id: eventId } = await (context.params as Promise<{ id: string }>);
      const categoryId = url.searchParams.get("categoryId");

      if (!categoryId) {
        return NextResponse.json({ error: "CATEGORY_ID_REQUIRED" }, { status: 400 });
      }

      // Verificar que la categoría existe
      const [category] = await db
        .select()
        .from(eventCategories)
        .where(
          and(
            eq(eventCategories.id, categoryId),
            eq(eventCategories.eventId, eventId)
          )
        )
        .limit(1);

      if (!category) {
        return NextResponse.json({ error: "CATEGORY_NOT_FOUND" }, { status: 404 });
      }

      // Eliminar categoría
      await db
        .delete(eventCategories)
        .where(eq(eventCategories.id, categoryId));

      return NextResponse.json({ ok: true });
    } catch (error) {
      return handleApiError(error, { endpoint: "/api/events/categories", method: "DELETE" });
    }
  })
);
