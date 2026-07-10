import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  academies,
  academyLinkRequests,
  authUsers,
  memberships,
  notifications,
  profiles,
} from "@/db/schema";
import { config } from "@/config";
import { apiCreated, apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { sendEmail } from "@/lib/brevo";
import { getAppUrl } from "@/lib/env";
import { logger } from "@/lib/logger";
import { verifyAcademyAccess } from "@/lib/permissions";

const createLinkRequestSchema = z.object({
  academyId: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["coach", "parent", "admin", "athlete"]),
  message: z.string().max(500).optional(),
  sendEmail: z.boolean().default(true),
});

const membershipRoleByProfileRole: Record<
  z.infer<typeof createLinkRequestSchema>["role"],
  "owner" | "coach" | "viewer"
> = {
  admin: "owner",
  coach: "coach",
  parent: "viewer",
  athlete: "viewer",
};

export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
  }

  if (!["owner", "admin", "super_admin"].includes(context.profile.role)) {
    return apiError("FORBIDDEN", "Prohibido", 403);
  }

  const parsed = createLinkRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return apiError("INVALID_PAYLOAD", "Payload invalido", 400, parsed.error.flatten());
  }

  const access = await verifyAcademyAccess(parsed.data.academyId, context.tenantId);
  if (!access.allowed) {
    return apiError("FORBIDDEN", access.reason ?? "Prohibido", 403);
  }

  const [academy] = await db
    .select({ name: academies.name })
    .from(academies)
    .where(eq(academies.id, parsed.data.academyId))
    .limit(1);

  const email = parsed.data.email.toLowerCase().trim();
  const [target] = await db
    .select({
      profileId: profiles.id,
      tenantId: profiles.tenantId,
      userId: profiles.userId,
      name: profiles.name,
      email: authUsers.email,
    })
    .from(profiles)
    .innerJoin(authUsers, eq(authUsers.id, profiles.userId))
    .where(eq(authUsers.email, email))
    .limit(1);

  if (!target) {
    return apiError(
      "USER_NOT_FOUND",
      "No existe una cuenta con ese email. Usa una invitacion por email.",
      404
    );
  }

  const [existingMembership] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, target.userId),
        eq(memberships.academyId, parsed.data.academyId)
      )
    )
    .limit(1);

  if (existingMembership) {
    return apiError("ALREADY_LINKED", "Este usuario ya esta vinculado a la academia", 409);
  }

  const [existingRequest] = await db
    .select({ id: academyLinkRequests.id })
    .from(academyLinkRequests)
    .where(
      and(
        eq(academyLinkRequests.academyId, parsed.data.academyId),
        eq(academyLinkRequests.targetProfileId, target.profileId),
        eq(academyLinkRequests.status, "pending")
      )
    )
    .limit(1);

  if (existingRequest) {
    return apiError("REQUEST_ALREADY_PENDING", "Ya existe una solicitud pendiente", 409);
  }

  const [linkRequest] = await db
    .insert(academyLinkRequests)
    .values({
      tenantId: context.tenantId,
      academyId: parsed.data.academyId,
      targetProfileId: target.profileId,
      requestedByProfileId: context.profile.id,
      requestedProfileRole: parsed.data.role,
      requestedMembershipRole: membershipRoleByProfileRole[parsed.data.role],
      status: "pending",
      message: parsed.data.message ?? null,
    })
    .returning({
      id: academyLinkRequests.id,
      status: academyLinkRequests.status,
      createdAt: academyLinkRequests.createdAt,
    });

  await db.insert(notifications).values({
    tenantId: target.tenantId,
    userId: target.profileId,
    type: "academy_link_request",
    title: "Solicitud de vinculacion",
    message: "Una academia quiere vincular tu cuenta a su espacio en Zaltyko.",
    data: {
      linkRequestId: linkRequest.id,
      academyId: parsed.data.academyId,
      role: parsed.data.role,
    },
  });

  if (parsed.data.sendEmail && target.email) {
    const profileUrl = new URL("/dashboard/profile", getAppUrl()).toString();
    const academyName = academy?.name ?? "una academia";
    try {
      await sendEmail({
        to: target.email,
        subject: `Solicitud de vinculacion en ${config.appName}`,
        html: `
          <p>Hola${target.name ? ` ${target.name}` : ""},</p>
          <p>${academyName} quiere vincular tu cuenta de Zaltyko como ${parsed.data.role}.</p>
          <p>Para aceptar o rechazar la solicitud, entra a tu perfil:</p>
          <p>
            <a href="${profileUrl}" style="padding: 12px 20px; border-radius: 9999px; background: #0f766e; color: #ffffff; font-weight: 600; text-decoration: none;">
              Revisar solicitud
            </a>
          </p>
          <p>Si no esperabas esta solicitud, puedes rechazarla desde Zaltyko.</p>
        `,
        text: `${academyName} quiere vincular tu cuenta de Zaltyko como ${parsed.data.role}. Revisa la solicitud en ${profileUrl}`,
        replyTo: config.brevo.supportEmail,
      });
    } catch (error) {
      logger.error("Error enviando email de solicitud de vinculo", error);
    }
  }

  return apiCreated({
    linkRequest,
    target: {
      name: target.name,
      email: target.email,
    },
  });
});

export const GET = withTenant(async (request, context) => {
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope") ?? "incoming";
  const academyId = searchParams.get("academyId");

  if (!['incoming', 'outgoing', 'academy'].includes(scope)) {
    return apiError("INVALID_SCOPE", "Scope invalido", 400);
  }

  if (scope === "academy") {
    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
    }
    if (!academyId) {
      return apiError("ACADEMY_REQUIRED", "Academy requerido", 400);
    }

    const access = await verifyAcademyAccess(academyId, context.tenantId);
    if (!access.allowed) {
      return apiError("FORBIDDEN", access.reason ?? "Prohibido", 403);
    }

    const requests = await db
      .select({
        id: academyLinkRequests.id,
        status: academyLinkRequests.status,
        requestedProfileRole: academyLinkRequests.requestedProfileRole,
        requestedMembershipRole: academyLinkRequests.requestedMembershipRole,
        message: academyLinkRequests.message,
        createdAt: academyLinkRequests.createdAt,
        respondedAt: academyLinkRequests.respondedAt,
        targetName: profiles.name,
        targetEmail: authUsers.email,
      })
      .from(academyLinkRequests)
      .innerJoin(profiles, eq(profiles.id, academyLinkRequests.targetProfileId))
      .innerJoin(authUsers, eq(authUsers.id, profiles.userId))
      .where(eq(academyLinkRequests.academyId, academyId))
      .orderBy(desc(academyLinkRequests.createdAt));

    return apiSuccess({ requests });
  }

  if (scope === "outgoing") {
    const requests = await db
      .select({
        id: academyLinkRequests.id,
        status: academyLinkRequests.status,
        requestedProfileRole: academyLinkRequests.requestedProfileRole,
        requestedMembershipRole: academyLinkRequests.requestedMembershipRole,
        message: academyLinkRequests.message,
        createdAt: academyLinkRequests.createdAt,
        respondedAt: academyLinkRequests.respondedAt,
        academyId: academyLinkRequests.academyId,
        academyName: academies.name,
        targetName: profiles.name,
        targetEmail: authUsers.email,
      })
      .from(academyLinkRequests)
      .innerJoin(academies, eq(academies.id, academyLinkRequests.academyId))
      .innerJoin(profiles, eq(profiles.id, academyLinkRequests.targetProfileId))
      .innerJoin(authUsers, eq(authUsers.id, profiles.userId))
      .where(eq(academyLinkRequests.requestedByProfileId, context.profile.id))
      .orderBy(desc(academyLinkRequests.createdAt));

    return apiSuccess({ requests });
  }

  const requests = await db
    .select({
      id: academyLinkRequests.id,
      status: academyLinkRequests.status,
      requestedProfileRole: academyLinkRequests.requestedProfileRole,
      requestedMembershipRole: academyLinkRequests.requestedMembershipRole,
      message: academyLinkRequests.message,
      createdAt: academyLinkRequests.createdAt,
      respondedAt: academyLinkRequests.respondedAt,
      academyId: academyLinkRequests.academyId,
      academyName: academies.name,
    })
    .from(academyLinkRequests)
    .innerJoin(academies, eq(academies.id, academyLinkRequests.academyId))
    .where(eq(academyLinkRequests.targetProfileId, context.profile.id))
    .orderBy(desc(academyLinkRequests.createdAt));

  return apiSuccess({ requests });
});
