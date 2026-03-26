import { and, desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { athletes, eventCategories, eventRegistrations, eventWaitlist, events } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { withRateLimit, getUserIdentifier } from "@/lib/rate-limit";
import { withPayloadValidation } from "@/lib/payload-validator";

export const dynamic = "force-dynamic";

const CreateRegistrationSchema = z.object({
  athleteId: z.string().uuid("ID de atleta inválido"),
  categoryId: z.string().uuid().optional(),
  notes: z.string().optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  billingName: z.string().optional(),
  billingNif: z.string().optional(),
});

const QuerySchema = z.object({
  athleteId: z.string().uuid().optional(),
  status: z.enum(["pending", "confirmed", "cancelled", "waitlisted"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

/**
 * POST /api/events/[id]/registrations
 * Inscribe un atleta a un evento
 */
export const POST = withRateLimit(
  withPayloadValidation(
    withTenant(async (request, context) => {
      try {
        const body = CreateRegistrationSchema.parse(await request.json());
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

        // Verificar que el evento permite inscripciones
        if (event.status === "cancelled") {
          return NextResponse.json({ error: "EVENT_CANCELLED" }, { status: 400 });
        }

        // Verificar que está dentro del período de inscripción
        const now = new Date();
        if (event.registrationStartDate && new Date(event.registrationStartDate) > now) {
          return NextResponse.json({ error: "REGISTRATION_NOT_STARTED" }, { status: 400 });
        }
        if (event.registrationEndDate && new Date(event.registrationEndDate) < now) {
          return NextResponse.json({ error: "REGISTRATION_ENDED" }, { status: 400 });
        }

        // Verificar que el atleta existe
        const [athlete] = await db
          .select()
          .from(athletes)
          .where(eq(athletes.id, body.athleteId))
          .limit(1);

        if (!athlete) {
          return NextResponse.json({ error: "ATHLETE_NOT_FOUND" }, { status: 404 });
        }

        // Verificar que no existe una inscripción previa
        const [existingRegistration] = await db
          .select()
          .from(eventRegistrations)
          .where(
            and(
              eq(eventRegistrations.eventId, eventId),
              eq(eventRegistrations.athleteId, body.athleteId)
            )
          )
          .limit(1);

        if (existingRegistration) {
          return NextResponse.json(
            { error: "ALREADY_REGISTERED", registrationId: existingRegistration.id },
            { status: 400 }
          );
        }

        // Verificar si está en waitlist
        const [existingWaitlist] = await db
          .select()
          .from(eventWaitlist)
          .where(
            and(
              eq(eventWaitlist.eventId, eventId),
              eq(eventWaitlist.athleteId, body.athleteId),
              eq(eventWaitlist.status, "waiting")
            )
          )
          .limit(1);

        if (existingWaitlist) {
          return NextResponse.json({ error: "ALREADY_IN_WAITLIST" }, { status: 400 });
        }

        // Contar inscripciones actuales
        const [countResult] = await db
          .select({ count: sql<number>`count(*)` })
          .from(eventRegistrations)
          .where(
            and(
              eq(eventRegistrations.eventId, eventId),
              eq(eventRegistrations.status, "confirmed")
            )
          );

        const currentRegistrations = Number(countResult?.count ?? 0);
        const isFull = event.maxCapacity ? currentRegistrations >= event.maxCapacity : false;

        // Determinar estado de inscripción
        let status: "pending" | "confirmed" | "waitlisted" = "pending";
        if (!isFull) {
          status = "confirmed";
        } else if (event.allowWaitlist) {
          // Verificar si la waitlist no está llena
          const [waitlistCount] = await db
            .select({ count: sql<number>`count(*)` })
            .from(eventWaitlist)
            .where(
              and(
                eq(eventWaitlist.eventId, eventId),
                eq(eventWaitlist.status, "waiting")
              )
            );

          const currentWaitlist = Number(waitlistCount?.count ?? 0);
          if (!event.waitlistMaxSize || currentWaitlist < event.waitlistMaxSize) {
            status = "waitlisted";
          } else {
            return NextResponse.json({ error: "EVENT_FULL" }, { status: 400 });
          }
        } else {
          return NextResponse.json({ error: "EVENT_FULL" }, { status: 400 });
        }

        // Obtener información de categoría si se especifica
        let categoryName: string | null = null;
        if (body.categoryId) {
          const [category] = await db
            .select({ name: eventCategories.name })
            .from(eventCategories)
            .where(eq(eventCategories.id, body.categoryId))
            .limit(1);
          categoryName = category?.name ?? null;
        }

        // Crear inscripción
        const [registration] = await db
          .insert(eventRegistrations)
          .values({
            eventId,
            athleteId: body.athleteId,
            athleteName: athlete.name,
            athleteDob: athlete.dob,
            athleteLevel: athlete.level,
            categoryId: body.categoryId ?? null,
            categoryName,
            status,
            notes: body.notes ?? null,
            contactName: body.contactName ?? null,
            contactEmail: body.contactEmail ?? null,
            contactPhone: body.contactPhone ?? null,
            billingName: body.billingName ?? null,
            billingNif: body.billingNif ?? null,
          })
          .returning();

        // Si está en waitlist, añadir a la cola
        if (status === "waitlisted") {
          const [waitlistCount] = await db
            .select({ count: sql<number>`count(*)` })
            .from(eventWaitlist)
            .where(
              and(
                eq(eventWaitlist.eventId, eventId),
                eq(eventWaitlist.status, "waiting")
              )
            );

          await db.insert(eventWaitlist).values({
            eventId,
            athleteId: body.athleteId,
            athleteName: athlete.name,
            athleteDob: athlete.dob,
            athleteLevel: athlete.level,
            categoryId: body.categoryId ?? null,
            categoryName,
            status: "waiting",
            position: Number(waitlistCount?.count ?? 0) + 1,
            notes: body.notes ?? null,
          });
        }

        return NextResponse.json({
          ok: true,
          registration,
          status,
          isWaitlisted: status === "waitlisted",
        });
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          return NextResponse.json(
            { error: "VALIDATION_ERROR", details: error.errors },
            { status: 400 }
          );
        }
        return handleApiError(error, { endpoint: "/api/events/registrations", method: "POST" });
      }
    }),
    { maxSize: 1024 }
  ),
  { identifier: getUserIdentifier }
);

/**
 * GET /api/events/[id]/registrations
 * Lista inscripciones de un evento
 */
export const GET = withTenant(async (request, context) => {
  try {
    const url = new URL(request.url);
    const { id: eventId } = await (context.params as Promise<{ id: string }>);
    const parsed = QuerySchema.safeParse({
      ...Object.fromEntries(url.searchParams),
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "INVALID_FILTERS", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { status, page, limit } = parsed.data;
    const offset = (page - 1) * limit;

    const filters = [eq(eventRegistrations.eventId, eventId)];
    if (status) {
      filters.push(eq(eventRegistrations.status, status));
    }

    // Contar total
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(eventRegistrations)
      .where(and(...filters));

    const total = Number(countResult?.count ?? 0);
    const totalPages = Math.ceil(total / limit);

    // Obtener inscripciones
    const items = await db
      .select({
        id: eventRegistrations.id,
        athleteId: eventRegistrations.athleteId,
        athleteName: eventRegistrations.athleteName,
        athleteDob: eventRegistrations.athleteDob,
        athleteLevel: eventRegistrations.athleteLevel,
        categoryId: eventRegistrations.categoryId,
        categoryName: eventRegistrations.categoryName,
        status: eventRegistrations.status,
        notes: eventRegistrations.notes,
        contactName: eventRegistrations.contactName,
        contactEmail: eventRegistrations.contactEmail,
        contactPhone: eventRegistrations.contactPhone,
        billingName: eventRegistrations.billingName,
        billingNif: eventRegistrations.billingNif,
        createdAt: eventRegistrations.createdAt,
      })
      .from(eventRegistrations)
      .where(and(...filters))
      .orderBy(desc(eventRegistrations.createdAt))
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
    return handleApiError(error, { endpoint: "/api/events/registrations", method: "GET" });
  }
});
