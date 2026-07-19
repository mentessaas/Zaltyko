import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { contactMessages, academies } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { verifyAcademyAccess } from "@/lib/permissions";
import { apiSuccess, apiError } from "@/lib/api-response";

export const PUT = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
  }

  const params = context.params as { messageId?: string };
  const messageId = params?.messageId;

  if (!messageId) {
    return apiError("MESSAGE_ID_REQUIRED", "ID de mensaje requerido", 400);
  }

  // Obtener el mensaje y su academia
  const [message] = await db
    .select({
      id: contactMessages.id,
      academyId: contactMessages.academyId,
      archived: contactMessages.archived,
    })
    .from(contactMessages)
    .where(eq(contactMessages.id, messageId))
    .limit(1);

  if (!message) {
    return apiError("MESSAGE_NOT_FOUND", "Mensaje no encontrado", 404);
  }

  // Verificar acceso a la academia
  const academyAccess = await verifyAcademyAccess(message.academyId, context.tenantId);
  if (!academyAccess.allowed) {
    return apiError("ACADEMY_NOT_FOUND", academyAccess.reason ?? "Academia no encontrada", 403);
  }

  // Verificar que el usuario es propietario o admin de la academia
  const [academy] = await db
    .select({
      ownerId: academies.ownerId,
    })
    .from(academies)
    .where(eq(academies.id, message.academyId))
    .limit(1);

  if (!academy) {
    return apiError("ACADEMY_NOT_FOUND", "Academia no encontrada", 404);
  }

  const isAdmin = context.profile.role === "admin" || context.profile.role === "super_admin";
  const isOwner = academy.ownerId === context.profile.id;

  if (!isAdmin && !isOwner) {
    return apiError("FORBIDDEN", "No autorizado", 403);
  }

  // Toggle archived
  await db
    .update(contactMessages)
    .set({
      archived: !message.archived,
    })
    .where(eq(contactMessages.id, messageId));

  return apiSuccess({ ok: true, archived: !message.archived });
});
