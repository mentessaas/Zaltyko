import { and, desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { eventPayments, eventRegistrations, events } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { handleApiError } from "@/lib/api-error-handler";
import { withRateLimit, getUserIdentifier } from "@/lib/rate-limit";
import { withPayloadValidation } from "@/lib/payload-validator";

export const dynamic = "force-dynamic";

const CreatePaymentSchema = z.object({
  registrationId: z.string().uuid("ID de inscripción inválido"),
  amount: z.number().int().positive("El monto debe ser positivo"),
  paymentMethod: z.enum(["cash", "transfer", "card", "bizum", "other"]).default("transfer"),
  externalReference: z.string().optional(),
});

const QuerySchema = z.object({
  registrationId: z.string().uuid().optional(),
  status: z.enum(["pending", "paid", "failed", "refunded"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

/**
 * POST /api/events/[id]/payments
 * Registra un pago de inscripción
 */
export const POST = withRateLimit(
  withPayloadValidation(
    withTenant(async (request, context) => {
      try {
        const body = CreatePaymentSchema.parse(await request.json());
        const { id: eventId } = await (context.params as Promise<{ id: string }>);

        // Verificar que la inscripción existe y pertenece al evento
        const [registration] = await db
          .select()
          .from(eventRegistrations)
          .where(
            and(
              eq(eventRegistrations.id, body.registrationId),
              eq(eventRegistrations.eventId, eventId)
            )
          )
          .limit(1);

        if (!registration) {
          return NextResponse.json({ error: "REGISTRATION_NOT_FOUND" }, { status: 404 });
        }

        // Verificar que no existe un pago ya pagado para esta inscripción
        const [existingPayment] = await db
          .select()
          .from(eventPayments)
          .where(
            and(
              eq(eventPayments.registrationId, body.registrationId),
              eq(eventPayments.status, "paid")
            )
          )
          .limit(1);

        if (existingPayment) {
          return NextResponse.json({ error: "PAYMENT_ALREADY_EXISTS" }, { status: 400 });
        }

        // Verificar que el evento permite pagos
        const [event] = await db
          .select({ registrationFee: events.registrationFee })
          .from(events)
          .where(eq(events.id, eventId))
          .limit(1);

        if (!event || !event.registrationFee) {
          return NextResponse.json({ error: "NO_FEE_REQUIRED" }, { status: 400 });
        }

        // Verificar que el monto coincide con la tarifa del evento
        if (body.amount !== event.registrationFee) {
          return NextResponse.json(
            { error: "INVALID_AMOUNT", expected: event.registrationFee },
            { status: 400 }
          );
        }

        // Crear registro de pago
        const [payment] = await db
          .insert(eventPayments)
          .values({
            registrationId: body.registrationId,
            eventId,
            athleteId: registration.athleteId,
            amount: body.amount,
            paymentMethod: body.paymentMethod,
            externalReference: body.externalReference ?? null,
            status: "paid",
            paymentDate: new Date(),
          })
          .returning();

        // Actualizar estado de inscripción a confirmado
        await db
          .update(eventRegistrations)
          .set({
            status: "confirmed",
            updatedAt: new Date(),
          })
          .where(eq(eventRegistrations.id, body.registrationId));

        return NextResponse.json({
          ok: true,
          payment,
        });
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          return NextResponse.json(
            { error: "VALIDATION_ERROR", details: error.errors },
            { status: 400 }
          );
        }
        return handleApiError(error, { endpoint: "/api/events/payments", method: "POST" });
      }
    }),
    { maxSize: 1024 }
  ),
  { identifier: getUserIdentifier }
);

/**
 * GET /api/events/[id]/payments
 * Lista pagos de inscripciones de un evento
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

    const { registrationId, status, page, limit } = parsed.data;
    const offset = (page - 1) * limit;

    const filters = [eq(eventPayments.eventId, eventId)];
    if (registrationId) {
      filters.push(eq(eventPayments.registrationId, registrationId));
    }
    if (status) {
      filters.push(eq(eventPayments.status, status));
    }

    // Contar total
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(eventPayments)
      .where(and(...filters));

    const total = Number(countResult?.count ?? 0);
    const totalPages = Math.ceil(total / limit);

    // Obtener pagos
    const items = await db
      .select({
        id: eventPayments.id,
        registrationId: eventPayments.registrationId,
        athleteId: eventPayments.athleteId,
        amount: eventPayments.amount,
        currency: eventPayments.currency,
        status: eventPayments.status,
        paymentMethod: eventPayments.paymentMethod,
        externalReference: eventPayments.externalReference,
        paymentDate: eventPayments.paymentDate,
        failureReason: eventPayments.failureReason,
        refundedAt: eventPayments.refundedAt,
        createdAt: eventPayments.createdAt,
      })
      .from(eventPayments)
      .where(and(...filters))
      .orderBy(desc(eventPayments.createdAt))
      .limit(limit)
      .offset(offset);

    // Calcular totales
    const [totalsResult] = await db
      .select({
        total: sql<number>`COALESCE(SUM(${eventPayments.amount}), 0)`,
        paid: sql<number>`COALESCE(SUM(CASE WHEN ${eventPayments.status} = 'paid' THEN ${eventPayments.amount} ELSE 0 END), 0)`,
        pending: sql<number>`COALESCE(SUM(CASE WHEN ${eventPayments.status} = 'pending' THEN ${eventPayments.amount} ELSE 0 END), 0)`,
      })
      .from(eventPayments)
      .where(and(...filters));

    return NextResponse.json({
      total,
      page,
      pageSize: limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
      items,
      summary: {
        total: totalsResult?.total ?? 0,
        paid: totalsResult?.paid ?? 0,
        pending: totalsResult?.pending ?? 0,
      },
    });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/events/payments", method: "GET" });
  }
});
