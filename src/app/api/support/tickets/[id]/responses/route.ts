import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { profiles, ticketResponses, tickets } from "@/db/schema";
import { getCurrentProfile, withTenant } from "@/lib/authz";
import { apiCreated, apiError, apiSuccess } from "@/lib/api-response";
import { verifyAcademyAccessForProfile } from "@/lib/permissions";

const idSchema = z.string().uuid();

type SupportContext = {
  tenantId: string;
  profile: NonNullable<Awaited<ReturnType<typeof getCurrentProfile>>>;
  params?: unknown;
};

async function getTicket(id: string) {
  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1);
  return ticket ?? null;
}

async function canAccess(
  ticket: NonNullable<Awaited<ReturnType<typeof getTicket>>>,
  context: SupportContext
) {
  if (context.profile.role === "super_admin" || ticket.createdBy === context.profile.id) return true;
  if (!ticket.academyId) return false;
  const result = await verifyAcademyAccessForProfile({
    academyId: ticket.academyId,
    tenantId: context.tenantId,
    profile: context.profile,
  });
  return result.allowed;
}

export const GET = withTenant(async (_request, context) => {
  const id = ((context.params ?? {}) as { id?: string }).id;
  if (!id || !idSchema.safeParse(id).success) return apiError("INVALID_ID", "Ticket inválido", 400);

  const ticket = await getTicket(id);
  if (!ticket) return apiError("NOT_FOUND", "Ticket no encontrado", 404);
  if (!(await canAccess(ticket, context))) return apiError("FORBIDDEN", "No tienes acceso a este ticket", 403);

  const responses = await db
    .select({
      id: ticketResponses.id,
      ticketId: ticketResponses.ticketId,
      userId: ticketResponses.userId,
      message: ticketResponses.message,
      isInternal: ticketResponses.isInternal,
      createdAt: ticketResponses.createdAt,
      userName: profiles.name,
    })
    .from(ticketResponses)
    .leftJoin(profiles, eq(ticketResponses.userId, profiles.id))
    .where(
      and(
        eq(ticketResponses.ticketId, id),
        context.profile.role === "super_admin" ? undefined : eq(ticketResponses.isInternal, false),
      ),
    )
    .orderBy(asc(ticketResponses.createdAt));

  return apiSuccess(responses);
});

export const POST = withTenant(async (request, context) => {
  const id = ((context.params ?? {}) as { id?: string }).id;
  if (!id || !idSchema.safeParse(id).success) return apiError("INVALID_ID", "Ticket inválido", 400);

  const ticket = await getTicket(id);
  if (!ticket) return apiError("NOT_FOUND", "Ticket no encontrado", 404);
  if (!(await canAccess(ticket, context))) return apiError("FORBIDDEN", "No tienes acceso a este ticket", 403);
  if (ticket.status === "closed" || ticket.status === "resolved") {
    return apiError("TICKET_CLOSED", "No se puede responder a un ticket cerrado", 400);
  }

  const form = await request.formData();
  const message = z.string().trim().min(1).max(10_000).safeParse(form.get("message"));
  if (!message.success) return apiError("VALIDATION_ERROR", "El mensaje es requerido", 400);

  const isInternal = form.get("isInternal") === "true" && context.profile.role === "super_admin";
  const [response] = await db
    .insert(ticketResponses)
    .values({
      ticketId: id,
      userId: context.profile.id,
      message: message.data,
      isInternal,
    })
    .returning();

  await db
    .update(tickets)
    .set({
      updatedAt: new Date(),
      status: context.profile.role === "super_admin" ? "in_progress" : "waiting",
    })
    .where(and(eq(tickets.id, id), eq(tickets.status, ticket.status)));

  return apiCreated(response);
});
