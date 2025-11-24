import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { contactMessages, academies } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { verifyAcademyAccess } from "@/lib/permissions";

export async function resolveParams(params: unknown): Promise<{ messageId: string }> {
  if (typeof params === "object" && params !== null && "messageId" in params) {
    return params as { messageId: string };
  }
  return {} as { messageId: string };
}

export const PUT = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const resolvedParams = await resolveParams(context.params);
  const messageId = resolvedParams?.messageId;

  if (!messageId) {
    return NextResponse.json({ error: "MESSAGE_ID_REQUIRED" }, { status: 400 });
  }

  // Obtener el mensaje y su academia
  const [message] = await db
    .select({
      id: contactMessages.id,
      academyId: contactMessages.academyId,
      read: contactMessages.read,
    })
    .from(contactMessages)
    .where(eq(contactMessages.id, messageId))
    .limit(1);

  if (!message) {
    return NextResponse.json({ error: "MESSAGE_NOT_FOUND" }, { status: 404 });
  }

  // Verificar acceso a la academia
  const academyAccess = await verifyAcademyAccess(message.academyId, context.tenantId);
  if (!academyAccess.allowed) {
    return NextResponse.json(
      { error: academyAccess.reason ?? "ACADEMY_NOT_FOUND" },
      { status: 403 }
    );
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
    return NextResponse.json({ error: "ACADEMY_NOT_FOUND" }, { status: 404 });
  }

  const isAdmin = context.profile.role === "admin" || context.profile.role === "super_admin";
  const isOwner = academy.ownerId === context.profile.id;

  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  // Marcar como leído
  await db
    .update(contactMessages)
    .set({
      read: true,
      readAt: new Date(),
    })
    .where(eq(contactMessages.id, messageId));

  return NextResponse.json({ ok: true });
});

