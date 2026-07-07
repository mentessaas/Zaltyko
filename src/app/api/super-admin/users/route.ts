import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { apiSuccess, apiCreated, apiError } from "@/lib/api-response";

import { db } from "@/db";
import { profiles } from "@/db/schema";
import { withSuperAdmin } from "@/lib/authz";
import { withRateLimit, getUserIdentifier } from "@/lib/rate-limit";
import { getAllUsers } from "@/lib/superAdminService";
import { createAuthUser } from "@/lib/supabase/admin-operations";
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
  const updated = await db
    .update(profiles)
    .set({ role, name: name ?? null })
    .where(eq(profiles.userId, userId))
    .returning({ id: profiles.id });

  if (!updated.length) {
    await db.insert(profiles).values({ userId, role, name: name ?? null, tenantId: crypto.randomUUID() });
  }

  await logAdminAction({ userId: context.userId, tenantId: null, action: "user.created", meta: { email, role } });

  return apiCreated({ userId, email, role });
});

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

// Aplicar rate limiting: 50 requests por minuto para Super Admin
const handler = withSuperAdmin(async (request) => {
  const url = new URL(request.url);
  const roleFilter = url.searchParams.get("role") ?? undefined;
  const searchQuery = url.searchParams.get("q")?.toLowerCase() ?? undefined;
  const statusFilter = url.searchParams.get("status") as "active" | "suspended" | undefined;

  // Paginación
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? String(DEFAULT_PAGE_SIZE), 10))
  );

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
    return (await handler(request, {} as any)) as NextResponse;
  },
  { identifier: getUserIdentifier }
);

