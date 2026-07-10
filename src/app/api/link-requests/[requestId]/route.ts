import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academyLinkRequests, memberships, profiles } from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { resolveUserHome } from "@/lib/auth/resolve-user-home";

const responseSchema = z.object({
  action: z.enum(["accept", "reject"]),
});

export const PATCH = withTenant(async (request, context) => {
  const params = context.params as { requestId?: string } | undefined;
  const requestId = params?.requestId;
  if (!requestId) {
    return apiError("REQUEST_ID_REQUIRED", "Solicitud requerida", 400);
  }

  const parsed = responseSchema.safeParse(await request.json());
  if (!parsed.success) {
    return apiError("INVALID_PAYLOAD", "Payload invalido", 400, parsed.error.flatten());
  }

  const [linkRequest] = await db
    .select()
    .from(academyLinkRequests)
    .where(
      and(
        eq(academyLinkRequests.id, requestId),
        eq(academyLinkRequests.targetProfileId, context.profile.id)
      )
    )
    .limit(1);

  if (!linkRequest) {
    return apiError("LINK_REQUEST_NOT_FOUND", "Solicitud no encontrada", 404);
  }

  if (linkRequest.status !== "pending") {
    return apiError("LINK_REQUEST_CLOSED", "Esta solicitud ya fue respondida", 400);
  }

  const now = new Date();

  if (parsed.data.action === "reject") {
    await db
      .update(academyLinkRequests)
      .set({
        status: "rejected",
        respondedAt: now,
        updatedAt: now,
      })
      .where(eq(academyLinkRequests.id, linkRequest.id));

    return apiSuccess({
      success: true,
      status: "rejected",
    });
  }

  const [existingMembership] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, context.profile.userId),
        eq(memberships.academyId, linkRequest.academyId)
      )
    )
    .limit(1);

  if (!existingMembership) {
    await db.insert(memberships).values({
      userId: context.profile.userId,
      academyId: linkRequest.academyId,
      role: linkRequest.requestedMembershipRole,
    });
  }

  // El portal limitado y withTenant usan el tenant del perfil como contexto.
  // Al aceptar el primer vínculo, alinear ambos valores habilita las rutas
  // permitidas (my-dashboard, messages y notifications) sin abrir rutas admin.
  await db
    .update(profiles)
    .set({
      activeAcademyId: linkRequest.academyId,
      tenantId: linkRequest.tenantId,
    })
    .where(eq(profiles.id, context.profile.id));

  await db
    .update(academyLinkRequests)
    .set({
      status: "accepted",
      respondedAt: now,
      updatedAt: now,
    })
    .where(eq(academyLinkRequests.id, linkRequest.id));

  const home = await resolveUserHome({
    userId: context.profile.userId,
    email: undefined,
  });

  return apiSuccess({
    success: true,
    status: "accepted",
    academyId: linkRequest.academyId,
    redirectUrl: home.redirectUrl,
  });
});
