import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academyLinkRequests, memberships, profiles } from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { resolveUserHome } from "@/lib/auth/resolve-user-home";
import { withTransaction } from "@/lib/db-transactions";

const responseSchema = z.object({
  action: z.enum(["accept", "reject"]),
});

/** @resource-scope self — only the request target profile may respond. */

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
    const [rejected] = await db
      .update(academyLinkRequests)
      .set({
        status: "rejected",
        respondedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(academyLinkRequests.id, linkRequest.id),
          eq(academyLinkRequests.status, "pending"),
          eq(academyLinkRequests.targetProfileId, context.profile.id)
        )
      )
      .returning({ id: academyLinkRequests.id });

    if (!rejected) {
      return apiError("LINK_REQUEST_CLOSED", "Esta solicitud ya fue respondida", 400);
    }

    return apiSuccess({
      success: true,
      status: "rejected",
    });
  }

  const accepted = await withTransaction(async (tx) => {
    const [claimed] = await tx
      .update(academyLinkRequests)
      .set({ status: "processing", updatedAt: now })
      .where(
        and(
          eq(academyLinkRequests.id, linkRequest.id),
          eq(academyLinkRequests.status, "pending"),
          eq(academyLinkRequests.targetProfileId, context.profile.id)
        )
      )
      .returning();
    if (!claimed) return false;

    await tx
      .insert(memberships)
      .values({
        userId: context.profile.userId,
        academyId: claimed.academyId,
        role: claimed.requestedMembershipRole,
      })
      .onConflictDoNothing({ target: [memberships.userId, memberships.academyId] });

    // El portal limitado y withTenant usan el tenant del perfil como contexto.
    await tx
      .update(profiles)
      .set({ activeAcademyId: claimed.academyId, tenantId: claimed.tenantId })
      .where(eq(profiles.id, context.profile.id));

    await tx
      .update(academyLinkRequests)
      .set({ status: "accepted", respondedAt: now, updatedAt: now })
      .where(
        and(
          eq(academyLinkRequests.id, claimed.id),
          eq(academyLinkRequests.status, "processing")
        )
      );
    return true;
  });

  if (!accepted) {
    return apiError("LINK_REQUEST_CLOSED", "Esta solicitud ya fue respondida", 400);
  }

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
