import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { apiSuccess, apiCreated, apiError } from "@/lib/api-response";

import { db } from "@/db";
import { profiles } from "@/db/schema";
import { withSuperAdmin } from "@/lib/authz";
import { withRateLimit, getUserIdentifier } from "@/lib/rate-limit";
import { getAllUsers } from "@/lib/superAdminService";
import { createAuthUser, deleteAuthUser } from "@/lib/supabase/admin-operations";
import { logAdminAction } from "@/lib/admin-logs";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  name: z.string().trim().optional(),
  role: z.enum(["owner", "admin", "coach", "athlete", "parent", "super_admin"]),
});

// POST /api/super-admin/users — crear una cuenta (Auth + perfil) con el rol elegido.
export const POST = withSuperAdmin(async (request, context) => {
  const json = await request.json().catch(() => null);
  const parsed = CreateUserSchema.safeParse(json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Datos inválidos", 400);
  }
  const { email, password, name, role } = parsed.data;

  let userId: string;
  let profileId: string | null = null;
  try {
    ({ userId } = await createAuthUser({ email, password }));
  } catch (e) {
    return apiError("AUTH_CREATE_FAILED", e instanceof Error ? e.message : "No se pudo crear la cuenta", 400);
  }

  try {
    // El trigger handle_new_user crea el perfil (rol owner). Lo ajustamos al rol/nombre pedido.
    const updated = await db
      .update(profiles)
      .set({ role, name: name ?? null })
      .where(eq(profiles.userId, userId))
      .returning({ id: profiles.id });

    profileId = updated[0]?.id ?? null;
    if (!updated.length) {
      const [createdProfile] = await db
        .insert(profiles)
        .values({ userId, role, name: name ?? null, tenantId: crypto.randomUUID() })
        .returning({ id: profiles.id });
      profileId = createdProfile?.id ?? null;
    }
    if (!profileId) {
      throw new Error("No se pudo crear el perfil del usuario");
    }

    await logAdminAction({
      userId: context.userId,
      tenantId: null,
      action: "user.created",
      resourceType: "profile",
      resourceId: profileId,
      resourceName: name ?? email,
      description: `Super Admin creó el usuario ${email}`,
      meta: { email, role },
    });

    return apiCreated({ userId, email, role });
  } catch (error) {
    if (profileId) {
      try {
        await db.delete(profiles).where(eq(profiles.id, profileId));
      } catch (rollbackError) {
        logger.error("No se pudo revertir el perfil del usuario creado por Super Admin", rollbackError, {
          profileId,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
    try {
      await deleteAuthUser(userId);
    } catch (rollbackError) {
      logger.error("No se pudo revertir el usuario creado por Super Admin", rollbackError, {
        userId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
    return apiError("USER_CREATE_FAILED", error instanceof Error ? error.message : "No se pudo crear el usuario", 500);
  }
});

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

function parsePageParam(value: string | null, fallback: number, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? Math.min(parsed, max) : fallback;
}

// Aplicar rate limiting: 50 requests por minuto para Super Admin
const handler = withSuperAdmin(async (request) => {
  const url = new URL(request.url);
  const roleFilter = url.searchParams.get("role") ?? undefined;
  const searchQuery = url.searchParams.get("q")?.toLowerCase() ?? undefined;
  const statusFilter = url.searchParams.get("status") as "active" | "suspended" | undefined;

  // Paginación
  const page = parsePageParam(url.searchParams.get("page"), 1);
  const pageSize = parsePageParam(url.searchParams.get("limit"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

  const items = await getAllUsers();

  const filtered = items.filter((user) => {
    if (roleFilter && user.role !== roleFilter) return false;
    if (statusFilter) {
      const isSuspended = statusFilter === "suspended";
      if (user.isSuspended !== isSuspended) return false;
    }
    if (searchQuery) {
      const haystack = `${user.fullName ?? ""} ${user.email ?? ""}`.toLowerCase();
      if (!haystack.includes(searchQuery)) return false;
    }
    return true;
  });

  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const offset = (page - 1) * pageSize;
  const paginatedItems = filtered.slice(offset, offset + pageSize);

  return apiSuccess({
    total,
    page,
    pageSize,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
    items: paginatedItems,
  });
});

export const GET = withRateLimit(
  async (request) => {
    return (await handler(request, {} as never)) as NextResponse;
  },
  { identifier: getUserIdentifier }
);
