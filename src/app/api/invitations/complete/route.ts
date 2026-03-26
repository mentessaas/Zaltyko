import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { invitations, memberships, profiles, roleMembers } from "@/db/schema";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { withRateLimit, getUserIdentifier } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/api-error-handler";
import { withPayloadValidation } from "@/lib/payload-validator";
import { createAuditLog } from "@/lib/authz/audit-service";
import type { AuditAction, AuditModule } from "@/db/schema/audit-logs";

const AcceptSchema = z.object({
  token: z.string().min(1),
  // Password es opcional si el usuario ya existe y está autenticado
  password: z.string().min(8).optional(),
  name: z.string().min(2).max(120).optional(),
});

const handler = async (request: Request) => {
  try {
    const body = AcceptSchema.parse(await request.json());

    const [invitation] = await db
      .select()
      .from(invitations)
      .where(eq(invitations.token, body.token))
      .limit(1);

    if (!invitation) {
      return NextResponse.json({ error: "INVITATION_NOT_FOUND" }, { status: 404 });
    }

    if (invitation.status !== "pending") {
      return NextResponse.json({ error: "INVITATION_ALREADY_USED" }, { status: 409 });
    }

    if (invitation.expiresAt && invitation.expiresAt < new Date()) {
      return NextResponse.json({ error: "INVITATION_EXPIRED" }, { status: 410 });
    }

    const adminClient = getSupabaseAdminClient();

    let user = null;

    // Sin contraseña → buscar usuario existente (flujo "ya tengo cuenta")
    if (!body.password) {
      const { data: usersData } = await adminClient.auth.admin.listUsers();
      const existingUser = usersData.users.find((u) => u.email === invitation.email);
      if (!existingUser) {
        return NextResponse.json(
          {
            error: "USER_NOT_FOUND",
            message:
              "No se encontró un usuario existente con este email. Se requiere contraseña para crear la cuenta.",
          },
          { status: 400 }
        );
      }
      user = existingUser;
    } else {
      // Crear nuevo usuario o usar existente (flujo "crear cuenta nueva")
      const createResult = await adminClient.auth.admin.createUser({
        email: invitation.email,
        password: body.password,
        email_confirm: true,
        user_metadata: {
          tenantId: invitation.tenantId,
          role: invitation.role,
        },
      });

      if (createResult.error) {
        if (
          createResult.error.message.includes("already registered") ||
          createResult.error.message.includes("User already exists")
        ) {
          const { data: usersData } = await adminClient.auth.admin.listUsers();
          const existingUser = usersData.users.find((u) => u.email === invitation.email);
          if (!existingUser) {
            return NextResponse.json({ error: "USER_EXISTS_NO_ACCESS" }, { status: 409 });
          }
          user = existingUser;
          if (body.password) {
            await adminClient.auth.admin.updateUserById(user.id, {
              password: body.password,
            });
          }
        } else {
          console.error(createResult.error);
          return NextResponse.json({ error: "SUPABASE_ERROR" }, { status: 500 });
        }
      } else {
        user = createResult.data.user;
      }
    }

    if (!user) {
      return NextResponse.json({ error: "USER_NOT_CREATED" }, { status: 500 });
    }

    const displayName = body.name?.trim() || invitation.email.split("@")[0];

    await db
      .insert(profiles)
      .values({
        userId: user.id,
        tenantId: invitation.tenantId,
        name: displayName,
        role: invitation.role,
        activeAcademyId: invitation.defaultAcademyId,
      })
      .onConflictDoUpdate({
        target: profiles.userId,
        set: {
          tenantId: invitation.tenantId,
          role: invitation.role,
          name: displayName,
          activeAcademyId: invitation.defaultAcademyId,
        },
      });

    const academyIds = invitation.academyIds ?? [];

    if (academyIds.length > 0) {
      // athlete → viewer (puede ver su propio perfil/datos)
      const membershipRole: "coach" | "owner" | "viewer" =
        invitation.role === "coach"
          ? "coach"
          : invitation.role === "owner"
          ? "owner"
          : "viewer";

      await db
        .insert(memberships)
        .values(
          academyIds.map((academyId) => ({
            userId: user.id,
            academyId,
            role: membershipRole,
          }))
        )
        .onConflictDoNothing();
    }

    await db
      .update(invitations)
      .set({
        status: "accepted",
        acceptedAt: new Date(),
        supabaseUserId: user.id,
      })
      .where(eq(invitations.id, invitation.id));

    if (invitation.roleId && invitation.defaultAcademyId) {
      const memberRoleMap: Record<string, "owner" | "admin" | "coach" | "assistant" | "viewer" | "parent"> = {
        owner: "owner",
        admin: "admin",
        coach: "coach",
        parent: "parent",
        athlete: "viewer", // atletas tienen rol viewer en membership
      };

      await db
        .insert(roleMembers)
        .values({
          roleId: invitation.roleId,
          userId: user.id,
          academyId: invitation.defaultAcademyId,
          memberRole: memberRoleMap[invitation.role] || "viewer",
          customPermissions: invitation.permissions as any,
          assignedBy: invitation.invitedBy,
        })
        .onConflictDoNothing();

      await createAuditLog({
        tenantId: invitation.tenantId,
        userId: user.id,
        action: "users.create" as AuditAction,
        module: "users" as AuditModule,
        resourceType: "user",
        resourceId: user.id,
        description: `Usuario aceptó invitación con rol personalizado`,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/invitations/complete", method: "POST" });
  }
};

export const POST = withRateLimit(
  withPayloadValidation(handler, { maxSize: 256 * 1024 }),
  { identifier: getUserIdentifier }
);
