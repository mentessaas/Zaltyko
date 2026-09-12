import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { apiSuccess, apiCreated, apiError } from "@/lib/api-response";

import { db } from "@/db";
import { profiles } from "@/db/schema";
import { withSuperAdmin } from "@/lib/authz";
import { withRateLimit, getUserIdentifier } from "@/lib/rate-limit";
import { getUsersPage } from "@/lib/superAdminService";
import { createAuthUser, deleteAuthUser } from "@/lib/supabase/admin-operations";
import { logAdminAction } from "@/lib/admin-logs";

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
  try {
    ({ userId } = await createAuthUser({ email, password }));
  } catch (e) {
    return apiError("AUTH_CREATE_FAILED", e instanceof Error ? e.message : "No se pudo crear la cuenta", 400);
  }

  // El trigger handle_new_user crea el perfil (rol owner). Lo ajustamos al rol/nombre pedido.
  let profileId: string | null = null;
  try {
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

    if (!profileId) throw new Error("No se pudo crear el perfil");
  } catch (error) {
    try {
      await deleteAuthUser(userId);
    } catch {
      // Preserve the original failure; cleanup can be retried from audit logs.
    }
    return apiError("PROFILE_CREATE_FAILED", error instanceof Error ? error.message : "No se pudo crear el perfil", 500);
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
});

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

// Aplicar rate limiting: 50 requests por minuto para Super Admin
const handler = withSuperAdmin(async (request) => {
  const url = new URL(request.url);
  const roleFilter = url.searchParams.get("role") || undefined;
  const searchQuery = url.searchParams.get("q") || undefined;
  const statusParam = url.searchParams.get("status");
  const statusFilter =
    statusParam === "active" || statusParam === "suspended" ? statusParam : undefined;

  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE)
  );
  const result = await getUsersPage({
    page,
    pageSize,
    role: roleFilter,
    status: statusFilter,
    search: searchQuery,
  });
  const totalPages = Math.max(1, Math.ceil(result.total / pageSize));

  return apiSuccess({
    total: result.total,
    page: result.page,
    pageSize,
    totalPages,
    hasNextPage: result.page < totalPages,
    hasPreviousPage: result.page > 1,
    items: result.items,
  });
});

export const GET = withRateLimit(
  async (request) => {
    return (await handler(request, {} as any)) as NextResponse;
  },
  { identifier: getUserIdentifier }
);
