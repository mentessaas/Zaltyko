import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { invitations } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { apiError, apiSuccess } from "@/lib/api-response";
import { verifyAcademyAccess } from "@/lib/permissions";
import { createAuditLog } from "@/lib/authz/audit-service";
import type { AuditAction, AuditModule } from "@/db/schema/audit-logs";

const idSchema = z.string().uuid();

/** Cancela una invitación de equipo aún pendiente, sin borrar su historial. */
export const DELETE = withTenant(async (request, context) => {
  if (!context.tenantId) return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
  if (!["owner", "admin", "super_admin"].includes(context.profile.role)) {
    return apiError("FORBIDDEN", "Prohibido", 403);
  }

  const invitationId = new URL(request.url).pathname.split("/").pop() ?? "";
  const parsedId = idSchema.safeParse(invitationId);
  if (!parsedId.success) return apiError("INVALID_INVITATION_ID", "Invitación inválida", 400);

  const body = await request.json().catch(() => null);
  const parsedBody = z.object({ academyId: z.string().uuid() }).safeParse(body);
  if (!parsedBody.success) return apiError("INVALID_PAYLOAD", "academyId inválido", 400);

  const { academyId } = parsedBody.data;
  const access = await verifyAcademyAccess(academyId, context.tenantId);
  if (!access.allowed) return apiError("FORBIDDEN", access.reason ?? "Prohibido", 403);

  const [cancelled] = await db
    .update(invitations)
    .set({ status: "cancelled" })
    .where(and(
      eq(invitations.id, parsedId.data),
      eq(invitations.tenantId, context.tenantId),
      eq(invitations.defaultAcademyId, academyId),
      eq(invitations.status, "pending"),
    ))
    .returning({ id: invitations.id, email: invitations.email, role: invitations.role });

  if (!cancelled) return apiError("INVITATION_NOT_CANCELLABLE", "La invitación no existe, ya fue utilizada o no pertenece a esta academia", 409);

  await createAuditLog({
    tenantId: context.tenantId,
    userId: context.profile.userId,
    action: "users.update" as AuditAction,
    module: "users" as AuditModule,
    resourceType: "invitation",
    resourceName: cancelled.email,
    description: `Canceló la invitación de ${cancelled.email} como ${cancelled.role}`,
  });

  return apiSuccess({ cancelled: true, invitationId: cancelled.id });
});
