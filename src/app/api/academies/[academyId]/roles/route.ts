export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academyRoles, roleMembers, profiles } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { createAuditLog } from "@/lib/authz/audit-service";
import type { AuditAction, AuditModule } from "@/db/schema/audit-logs";

// GET /api/academies/[academyId]/roles - Lista roles de una academia
export const GET = withTenant(async (request, context) => {
  const { searchParams } = new URL(request.url);
  const academyId = searchParams.get("academyId");

  if (!academyId) {
    return NextResponse.json({ error: "ACADEMY_REQUIRED" }, { status: 400 });
  }

  // Verificar que el tenant tiene acceso a la academia
  const access = await import("@/lib/permissions").then(m =>
    m.verifyAcademyAccess(academyId, context.tenantId)
  );

  if (!access.allowed) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const roles = await db
    .select({
      id: academyRoles.id,
      name: academyRoles.name,
      description: academyRoles.description,
      type: academyRoles.type,
      permissions: academyRoles.permissions,
      inheritsFrom: academyRoles.inheritsFrom,
      isDefault: academyRoles.isDefault,
      isActive: academyRoles.isActive,
      createdAt: academyRoles.createdAt,
      updatedAt: academyRoles.updatedAt,
    })
    .from(academyRoles)
    .where(eq(academyRoles.academyId, academyId))
    .orderBy(desc(academyRoles.isDefault));

  return NextResponse.json({ roles });
});

// POST /api/academies/[academyId]/roles - Crear nuevo rol
const createRoleSchema = z.object({
  academyId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  permissions: z.array(z.string()),
  inheritsFrom: z.string().uuid().optional(),
  isDefault: z.enum(["admin", "coach", "assistant", "invited"]).optional(),
});

export const POST = withTenant(async (request, context) => {
  const parsed = createRoleSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  const { academyId, name, description, permissions, inheritsFrom, isDefault } = parsed.data;

  // Verificar acceso
  const access = await import("@/lib/permissions").then(m =>
    m.verifyAcademyAccess(academyId, context.tenantId)
  );

  if (!access.allowed) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  // Solo owner/admin pueden crear roles
  if (!["owner", "admin", "super_admin"].includes(context.profile.role)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const [role] = await db
    .insert(academyRoles)
    .values({
      academyId,
      name,
      description: description || null,
      type: "custom",
      permissions: permissions as any,
      inheritsFrom: inheritsFrom || null,
      isDefault: isDefault || null,
      isActive: "true",
      createdBy: context.profile.userId,
    })
    .returning();

  // Audit log
  await createAuditLog({
    tenantId: context.tenantId,
    userId: context.profile.userId,
    action: "settings.role_create" as AuditAction,
    module: "settings" as AuditModule,
    resourceType: "role",
    resourceId: role.id,
    resourceName: name,
    description: `Creó rol: ${name}`,
  });

  return NextResponse.json({ role }, { status: 201 });
});