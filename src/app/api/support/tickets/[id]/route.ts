import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { profiles, ticketResponses, tickets } from "@/db/schema";
import { getCurrentProfile, withTenant } from "@/lib/authz";
import { apiError, apiSuccess } from "@/lib/api-response";
import { verifyAcademyAccessForProfile } from "@/lib/permissions";

const updateSchema = z.object({
  status: z.enum(["open", "in_progress", "waiting", "resolved", "closed"]).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
}).refine((value) => value.status !== undefined || value.assignedTo !== undefined, {
  message: "Se requiere estado o asignación",
});

type SupportContext = {
  tenantId: string;
  profile: NonNullable<Awaited<ReturnType<typeof getCurrentProfile>>>;
  params?: unknown;
};

async function resolveTicket(id: string) {
  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1);
  return ticket ?? null;
}

async function canAccessTicket(
  ticket: NonNullable<Awaited<ReturnType<typeof resolveTicket>>>,
  context: SupportContext
) {
  if (context.profile.role === "super_admin" || ticket.createdBy === context.profile.id) return true;
  if (!ticket.academyId) return false;
  const access = await verifyAcademyAccessForProfile({
    academyId: ticket.academyId,
    tenantId: context.tenantId,
    profile: context.profile,
  });
  return access.allowed;
}

export const GET = withTenant(async (_request, context) => {
  const params = (context.params ?? {}) as { id?: string };
  const id = params.id;
  if (!id || !z.string().uuid().safeParse(id).success) return apiError("INVALID_ID", "Ticket inválido", 400);

  const ticket = await resolveTicket(id);
  if (!ticket) return apiError("NOT_FOUND", "Ticket no encontrado", 404);
  if (!(await canAccessTicket(ticket, context))) return apiError("FORBIDDEN", "No tienes acceso a este ticket", 403);

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
    .where(eq(ticketResponses.ticketId, id));

  return apiSuccess({ ticket, responses });
});

export const PATCH = withTenant(async (request, context) => {
  const params = (context.params ?? {}) as { id?: string };
  const id = params.id;
  if (!id || !z.string().uuid().safeParse(id).success) return apiError("INVALID_ID", "Ticket inválido", 400);

  const ticket = await resolveTicket(id);
  if (!ticket) return apiError("NOT_FOUND", "Ticket no encontrado", 404);
  if (!(await canAccessTicket(ticket, context))) return apiError("FORBIDDEN", "No tienes acceso a este ticket", 403);

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Actualización inválida", 400);

  const isAdmin = context.profile.role === "super_admin";
  if (parsed.data.assignedTo !== undefined && !isAdmin) {
    return apiError("PERMISSION_DENIED", "Solo soporte puede asignar tickets", 403);
  }
  if (parsed.data.status && !isAdmin && ticket.createdBy !== context.profile.id) {
    return apiError("PERMISSION_DENIED", "Solo soporte o la persona creadora puede cambiar el estado", 403);
  }

  const now = new Date();
  const [updated] = await db
    .update(tickets)
    .set({
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.assignedTo !== undefined ? { assignedTo: parsed.data.assignedTo } : {}),
      updatedAt: now,
      ...(parsed.data.status === "resolved" ? { resolvedAt: now } : {}),
      ...(parsed.data.status === "closed" ? { closedAt: now } : {}),
    })
    .where(eq(tickets.id, id))
    .returning();

  return apiSuccess(updated);
});
