import { randomUUID } from "node:crypto";
import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";

import { db } from "@/db";
import { academies, invitations, academyRoles } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { verifyAcademyAccess } from "@/lib/permissions";
import { markChecklistItem, markWizardStep } from "@/lib/onboarding";
import { trackEvent } from "@/lib/analytics";
import { getAppUrl } from "@/lib/env";
import { createAuditLog } from "@/lib/authz/audit-service";
import type { AuditAction, AuditModule } from "@/db/schema/audit-logs";
import { apiSuccess, apiError } from "@/lib/api-response";
import { sendEmailWithLogging } from "@/lib/email/email-service";
import { escapeHtml } from "@/lib/email/escape-html";

const bodySchema = z.object({
  academyId: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["coach", "parent", "admin", "athlete"]),
  roleId: z.string().uuid().optional(),
  customPermissions: z.array(z.string()).optional(),
  customMessage: z.string().optional(),
  groupsAssigned: z.array(z.string().uuid()).optional(),
  expiresInDays: z.number().int().min(1).max(30).default(7),
  sendEmail: z.boolean().default(true),
});

export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
  }

  if (!["owner", "admin", "super_admin"].includes(context.profile.role)) {
    return apiError("FORBIDDEN", "Prohibido", 403);
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return apiError("INVALID_PAYLOAD", "Payload inválido", 400);
  }

  const access = await verifyAcademyAccess(parsed.data.academyId, context.tenantId);
  if (!access.allowed) {
    return apiError("FORBIDDEN", access.reason ?? "Prohibido", 403);
  }

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000);

  // Si hay roleId, verificar que existe y pertenece a la academia.
  let roleName: string | null = null;
  if (parsed.data.roleId) {
    const role = await db
      .select()
      .from(academyRoles)
      .where(
        and(
          eq(academyRoles.id, parsed.data.roleId),
          eq(academyRoles.academyId, parsed.data.academyId)
        )
      )
      .limit(1);

    if (!role.length) {
      return apiError("ROLE_NOT_FOUND", "El rol no pertenece a esta academia", 400);
    }
    roleName = role[0].name;
  }

  await db.insert(invitations).values({
    id: randomUUID(),
    tenantId: context.tenantId,
    email: parsed.data.email.toLowerCase(),
    role: parsed.data.role,
    roleId: parsed.data.roleId || null,
    token,
    status: "pending",
    invitedBy: context.profile.userId,
    academyIds: [parsed.data.academyId],
    defaultAcademyId: parsed.data.academyId,
    expiresAt,
    customMessage: parsed.data.customMessage || null,
    permissions: parsed.data.customPermissions || null,
    sendEmail: parsed.data.sendEmail ? "true" : "false",
  });

  if (parsed.data.role === "coach") {
    await markChecklistItem({
      academyId: parsed.data.academyId,
      tenantId: context.tenantId,
      key: "invite_first_coach",
    });
    await markWizardStep({
      academyId: parsed.data.academyId,
      tenantId: context.tenantId,
      step: "payments-team",
    });
  }

  // Registrar en audit log
  await createAuditLog({
    tenantId: context.tenantId,
    userId: context.profile.userId,
    action: "users.invite" as AuditAction,
    module: "users" as AuditModule,
    resourceType: "invitation",
    resourceName: parsed.data.email,
    description: `Invitó a ${parsed.data.email} como ${roleName || parsed.data.role}`,
  });

  // Nunca construir un enlace con Origin/Host controlado por el caller: el
  // token debe salir únicamente bajo el dominio canónico configurado.
  const origin = getAppUrl();
  const invitationUrl =
    parsed.data.role === "parent"
      ? `${origin}/invite/parent?token=${token}`
      : parsed.data.role === "athlete"
      ? `${origin}/invite/athlete?token=${token}`
      : `${origin}/invite/accept?token=${token}`;

  await trackEvent("invitation_sent", {
    academyId: parsed.data.academyId,
    tenantId: context.tenantId,
    userId: context.userId,
    metadata: {
      role: parsed.data.role,
      roleId: parsed.data.roleId,
      roleName,
    },
  });

  if (parsed.data.role === "parent") {
    await trackEvent("first_parent_invited", {
      academyId: parsed.data.academyId,
      tenantId: context.tenantId,
      userId: context.userId,
      metadata: { role: "parent" },
    });
  }

  if (parsed.data.role === "athlete") {
    await trackEvent("first_athlete_invited", {
      academyId: parsed.data.academyId,
      tenantId: context.tenantId,
      userId: context.userId,
      metadata: { role: "athlete" },
    });
  }

  let emailSent = false;
  if (parsed.data.sendEmail) {
    const [academy] = await db
      .select({ name: academies.name })
      .from(academies)
      .where(eq(academies.id, parsed.data.academyId))
      .limit(1);
    const academyName = academy?.name ?? "Una academia";
    try {
      await sendEmailWithLogging({
        to: parsed.data.email,
        subject: `Invitación a ${academyName} en Zaltyko`,
        html: `<p>${escapeHtml(academyName)} te ha invitado a Zaltyko como ${escapeHtml(
          roleName ?? parsed.data.role
        )}.</p><p><a href="${escapeHtml(invitationUrl)}">Aceptar invitación</a></p>`,
        template: "academy-invitation",
        tenantId: context.tenantId,
        academyId: parsed.data.academyId,
        metadata: { role: parsed.data.role },
      });
      emailSent = true;
    } catch {
      // La invitación sigue siendo válida y el owner recibe el enlace para
      // compartirlo/reintentar; el fallo de proveedor no revierte el negocio.
      emailSent = false;
    }
  }

  return apiSuccess({
    invitationUrl,
    expiresAt: expiresAt.toISOString(),
    roleName,
    emailSent,
  });
});

// GET - Listar invitaciones pendientes
export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
  }

  const { searchParams } = new URL(request.url);
  const academyId = searchParams.get("academyId");

  if (!academyId) {
    return apiError("ACADEMY_REQUIRED", "Academy requerido", 400);
  }

  const access = await verifyAcademyAccess(academyId, context.tenantId);
  if (!access.allowed) {
    return apiError("FORBIDDEN", "Prohibido", 403);
  }

  const invites = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      roleId: invitations.roleId,
      status: invitations.status,
      createdAt: invitations.createdAt,
      expiresAt: invitations.expiresAt,
      invitedBy: invitations.invitedBy,
    })
    .from(invitations)
    .where(
      and(
        eq(invitations.tenantId, context.tenantId),
        eq(invitations.defaultAcademyId, academyId),
        eq(invitations.status, "pending")
      )
    );

  return apiSuccess({ invitations: invites });
});
