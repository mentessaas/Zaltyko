export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { roleMembers, profiles, academyRoles } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { createAuditLog } from "@/lib/authz/audit-service";
import type { AuditAction, AuditModule } from "@/db/schema/audit-logs";

// GET /api/academies/[academyId]/roles/[roleId]/members
export const GET = withTenant(async (request, context) => {
  const { searchParams } = new URL(request.url);
  const roleId = searchParams.get("roleId");
  const academyId = searchParams.get("academyId");

  if (!roleId || !academyId) {
    return NextResponse.json({ error: "ROLE_ID_AND_ACADEMY_REQUIRED" }, { status: 400 });
  }

  // Verificar acceso
  const access = await import("@/lib/permissions").then(m =>
    m.verifyAcademyAccess(academyId, context.tenantId)
  );

  if (!access.allowed) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const members = await db
    .select({
      id: roleMembers.id,
      userId: roleMembers.userId,
      memberRole: roleMembers.memberRole,
      customPermissions: roleMembers.customPermissions,
      assignedAt: roleMembers.assignedAt,
      expiresAt: roleMembers.expiresAt,
      userName: profiles.name,
    })
    .from(roleMembers)
    .leftJoin(profiles, eq(roleMembers.userId, profiles.userId))
    .where(eq(roleMembers.roleId, roleId));

  return NextResponse.json({ members });
});

// POST /api/academies/[academyId]/roles/[roleId]/members - Asignar usuario a rol
const assignSchema = z.object({
  userId: z.string().uuid(),
  memberRole: z.enum(["owner", "admin", "coach", "assistant", "viewer", "parent"]),
  customPermissions: z.array(z.string()).optional(),
  expiresAt: z.string().datetime().optional(),
});

export const POST = withTenant(async (request, context) => {
  const { searchParams } = new URL(request.url);
  const roleId = searchParams.get("roleId");
  const academyId = searchParams.get("academyId");

  if (!roleId || !academyId) {
    return NextResponse.json({ error: "ROLE_ID_AND_ACADEMY_REQUIRED" }, { status: 400 });
  }

  // Verificar acceso
  const access = await import("@/lib/permissions").then(m =>
    m.verifyAcademyAccess(academyId, context.tenantId)
  );

  if (!access.allowed) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  // Solo admin pueden asignar roles
  if (!["owner", "admin", "super_admin"].includes(context.profile.role)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = assignSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  const { userId, memberRole, customPermissions, expiresAt } = parsed.data;

  // Eliminar membresías existentes del usuario en esa academia
  await db
    .delete(roleMembers)
    .where(
      and(
        eq(roleMembers.userId, userId),
        eq(roleMembers.academyId, academyId)
      )
    );

  // Crear nueva membresía
  const [member] = await db
    .insert(roleMembers)
    .values({
      roleId,
      userId,
      academyId,
      memberRole,
      customPermissions: customPermissions as any,
      assignedBy: context.profile.userId,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    })
    .returning();

  // Audit log
  await createAuditLog({
    tenantId: context.tenantId,
    userId: context.profile.userId,
    action: "users.role_change" as AuditAction,
    module: "users" as AuditModule,
    resourceType: "user",
    resourceId: userId,
    description: `Asignó rol a usuario: ${userId}`,
  });

  return NextResponse.json({ member }, { status: 201 });
});