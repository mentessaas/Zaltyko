export const dynamic = 'force-dynamic';

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";

import { db } from "@/db";
import { invitations, profiles, roleMembers, academyRoles } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { verifyAcademyAccess } from "@/lib/permissions";
import { markChecklistItem, markWizardStep } from "@/lib/onboarding";
import { trackEvent } from "@/lib/analytics";
import { getAppUrl } from "@/lib/env";
import { createAuditLog } from "@/lib/authz/audit-service";
import type { AuditAction, AuditModule } from "@/db/schema/audit-logs";

const bodySchema = z.object({
  academyId: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["coach", "parent", "admin", "athlete"]),
  roleId: z.string().uuid().optional(), // Rol personalizado de academy_roles
  customPermissions: z.array(z.string()).optional(), // Permisos específicos si no hay roleId
  customMessage: z.string().optional(),
  groupsAssigned: z.array(z.string().uuid()).optional(),
  expiresInDays: z.number().int().min(1).max(30).default(7),
  sendEmail: z.boolean().default(true),
});

export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  if (!["owner", "admin", "super_admin"].includes(context.profile.role)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  const access = await verifyAcademyAccess(parsed.data.academyId, context.tenantId);
  if (!access.allowed) {
    return NextResponse.json({ error: access.reason ?? "FORBIDDEN" }, { status: 403 });
  }

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000);

  // Si hay roleId, verificar que existe y pertenece a la academia
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

    if (role.length) {
      roleName = role[0].name;
    }
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
      step: "coaches",
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

  const origin = request.headers.get("origin") ?? getAppUrl();
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
      email: parsed.data.email,
    },
  });

  if (parsed.data.role === "parent") {
    await trackEvent("first_parent_invited", {
      academyId: parsed.data.academyId,
      tenantId: context.tenantId,
      userId: context.userId,
      metadata: {
        email: parsed.data.email,
      },
    });
  }

  if (parsed.data.role === "athlete") {
    await trackEvent("first_athlete_invited", {
      academyId: parsed.data.academyId,
      tenantId: context.tenantId,
      userId: context.userId,
      metadata: {
        email: parsed.data.email,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    invitationUrl,
    expiresAt: expiresAt.toISOString(),
    roleName,
  });
});

// GET - Listar invitaciones pendientes
export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const academyId = searchParams.get("academyId");

  if (!academyId) {
    return NextResponse.json({ error: "ACADEMY_REQUIRED" }, { status: 400 });
  }

  const access = await verifyAcademyAccess(academyId, context.tenantId);
  if (!access.allowed) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
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
        eq(invitations.status, "pending")
      )
    );

  return NextResponse.json({ invitations: invites });
});