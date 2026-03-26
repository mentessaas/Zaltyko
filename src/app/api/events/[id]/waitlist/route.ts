import { and, asc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { eventRegistrations, eventWaitlist, events } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { withRateLimit, getUserIdentifier } from "@/lib/rate-limit";
import { withPayloadValidation } from "@/lib/payload-validator";

export const dynamic = "force-dynamic";

const UpdateWaitlistStatusSchema = z.object({
  waitlistId: z.string().uuid("ID de waitlist inválido"),
  status: z.enum(["waiting", "notified", "converted", "expired"]),
});

/**
 * GET /api/events/[id]/waitlist
 * Lista la waitlist de un evento
 */
export const GET = withTenant(async (request, context) => {
  try {
    const url = new URL(request.url);
    const { id: eventId } = await (context.params as Promise<{ id: string }>);
    const status = url.searchParams.get("status");
    const page = parseInt(url.searchParams.get("page") ?? "1");
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20") || 20, 100);
    const offset = (page - 1) * limit;

    const filters = [eq(eventWaitlist.eventId, eventId)];
    if (status && ["waiting", "notified", "converted", "expired"].includes(status)) {
      filters.push(eq(eventWaitlist.status, status as any));
    }

    // Contar total
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(eventWaitlist)
      .where(and(...filters));

    const total = Number(countResult?.count ?? 0);
    const totalPages = Math.ceil(total / limit);

    // Obtener waitlist ordenada por posición
    const items = await db
      .select({
        id: eventWaitlist.id,
        athleteId: eventWaitlist.athleteId,
        athleteName: eventWaitlist.athleteName,
        athleteDob: eventWaitlist.athleteDob,
        athleteLevel: eventWaitlist.athleteLevel,
        categoryId: eventWaitlist.categoryId,
        categoryName: eventWaitlist.categoryName,
        status: eventWaitlist.status,
        position: eventWaitlist.position,
        notifiedAt: eventWaitlist.notifiedAt,
        responseDeadline: eventWaitlist.responseDeadline,
        notes: eventWaitlist.notes,
        createdAt: eventWaitlist.createdAt,
      })
      .from(eventWaitlist)
      .where(and(...filters))
      .orderBy(asc(eventWaitlist.position))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      total,
      page,
      pageSize: limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
      items,
    });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/events/waitlist", method: "GET" });
  }
});

/**
 * PATCH /api/events/[id]/waitlist
 * Actualiza el estado de una entrada en la waitlist
 */
export const PATCH = withRateLimit(
  withPayloadValidation(
    withTenant(async (request, context) => {
      try {
        const body = UpdateWaitlistStatusSchema.parse(await request.json());
        const { id: eventId } = await (context.params as Promise<{ id: string }>);

        // Verificar que la entrada existe
        const [waitlistEntry] = await db
          .select()
          .from(eventWaitlist)
          .where(
            and(
              eq(eventWaitlist.id, body.waitlistId),
              eq(eventWaitlist.eventId, eventId)
            )
          )
          .limit(1);

        if (!waitlistEntry) {
          return NextResponse.json({ error: "WAITLIST_ENTRY_NOT_FOUND" }, { status: 404 });
        }

        // Actualizar estado
        const [updated] = await db
          .update(eventWaitlist)
          .set({
            status: body.status,
            notifiedAt: body.status === "notified" ? new Date() : waitlistEntry.notifiedAt,
            updatedAt: new Date(),
          })
          .where(eq(eventWaitlist.id, body.waitlistId))
          .returning();

        // Si se convierte, crear inscripción
        if (body.status === "converted") {
          // Buscar información del atleta
          const [registration] = await db
            .select()
            .from(eventRegistrations)
            .where(
              and(
                eq(eventRegistrations.eventId, eventId),
                eq(eventRegistrations.athleteId, waitlistEntry.athleteId)
              )
            )
            .limit(1);

          if (!registration) {
            // Crear inscripción desde waitlist
            await db.insert(eventRegistrations).values({
              eventId,
              athleteId: waitlistEntry.athleteId,
              athleteName: waitlistEntry.athleteName,
              athleteDob: waitlistEntry.athleteDob,
              athleteLevel: waitlistEntry.athleteLevel,
              categoryId: waitlistEntry.categoryId,
              categoryName: waitlistEntry.categoryName,
              status: "confirmed",
              notes: waitlistEntry.notes,
            });
          }
        }

        // Reordenar posiciones si es necesario
        if (body.status === "converted" || body.status === "expired") {
          const remaining = await db
            .select()
            .from(eventWaitlist)
            .where(
              and(
                eq(eventWaitlist.eventId, eventId),
                eq(eventWaitlist.status, "waiting")
              )
            )
            .orderBy(asc(eventWaitlist.position));

          // Actualizar posiciones
          for (let i = 0; i < remaining.length; i++) {
            await db
              .update(eventWaitlist)
              .set({ position: i + 1, updatedAt: new Date() })
              .where(eq(eventWaitlist.id, remaining[i].id));
          }
        }

        return NextResponse.json({
          ok: true,
          entry: updated,
        });
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          return NextResponse.json(
            { error: "VALIDATION_ERROR", details: error.errors },
            { status: 400 }
          );
        }
        return handleApiError(error, { endpoint: "/api/events/waitlist", method: "PATCH" });
      }
    }),
    { maxSize: 512 }
  ),
  { identifier: getUserIdentifier }
);

/**
 * DELETE /api/events/[id]/waitlist
 * Elimina una entrada de la waitlist
 */
export const DELETE = withRateLimit(
  withTenant(async (request, context) => {
    try {
      const url = new URL(request.url);
      const { id: eventId } = await (context.params as Promise<{ id: string }>);
      const waitlistId = url.searchParams.get("waitlistId");

      if (!waitlistId) {
        return NextResponse.json({ error: "WAITLIST_ID_REQUIRED" }, { status: 400 });
      }

      // Verificar que la entrada existe
      const [entry] = await db
        .select()
        .from(eventWaitlist)
        .where(
          and(
            eq(eventWaitlist.id, waitlistId),
            eq(eventWaitlist.eventId, eventId)
          )
        )
        .limit(1);

      if (!entry) {
        return NextResponse.json({ error: "WAITLIST_ENTRY_NOT_FOUND" }, { status: 404 });
      }

      // Eliminar entrada
      await db
        .delete(eventWaitlist)
        .where(eq(eventWaitlist.id, waitlistId));

      // Reordenar posiciones
      const remaining = await db
        .select()
        .from(eventWaitlist)
        .where(
          and(
            eq(eventWaitlist.eventId, eventId),
            eq(eventWaitlist.status, "waiting")
          )
        )
        .orderBy(asc(eventWaitlist.position));

      for (let i = 0; i < remaining.length; i++) {
        await db
          .update(eventWaitlist)
          .set({ position: i + 1, updatedAt: new Date() })
          .where(eq(eventWaitlist.id, remaining[i].id));
      }

      return NextResponse.json({ ok: true });
    } catch (error) {
      return handleApiError(error, { endpoint: "/api/events/waitlist", method: "DELETE" });
    }
  })
);
