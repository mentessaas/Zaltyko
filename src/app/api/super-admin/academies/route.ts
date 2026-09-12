import { z } from "zod";
import { eq } from "drizzle-orm";
import { apiSuccess, apiCreated, apiError } from "@/lib/api-response";

import { db } from "@/db";
import { profiles } from "@/db/schema";
import { withSuperAdmin } from "@/lib/authz";
import { getAcademiesPage } from "@/lib/superAdminService";
import { createAcademy } from "@/app/api/academies/academies.lib";
import { createAuthUser, deleteAuthUser } from "@/lib/supabase/admin-operations";
import { logAdminAction } from "@/lib/admin-logs";

export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

const CreateAcademySchema = z.object({
  academyName: z.string().min(3, "El nombre debe tener al menos 3 caracteres"),
  academyType: z.string().optional(),
  country: z.string().optional(),
  countryCode: z.string().optional(),
  region: z.string().optional(),
  city: z.string().optional(),
  disciplineVariant: z.string().optional(),
  ownerEmail: z.string().email(),
  ownerPassword: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  ownerName: z.string().trim().optional(),
});

// POST /api/super-admin/academies — crea una academia junto a su cuenta de dueño.
export const POST = withSuperAdmin(async (request, context) => {
  const json = await request.json().catch(() => null);
  const parsed = CreateAcademySchema.safeParse(json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Datos inválidos", 400);
  }
  const d = parsed.data;

  // 1) Crear la cuenta Auth del dueño (el trigger crea su perfil como owner).
  let ownerUserId: string;
  try {
    ({ userId: ownerUserId } = await createAuthUser({ email: d.ownerEmail, password: d.ownerPassword }));
  } catch (e) {
    return apiError("OWNER_CREATE_FAILED", e instanceof Error ? e.message : "No se pudo crear el dueño", 400);
  }

  const cleanupOwner = async () => {
    try {
      await db.delete(profiles).where(eq(profiles.userId, ownerUserId));
    } catch {
      // Best effort: Auth deletion below still prevents a usable orphan account.
    }
    try {
      await deleteAuthUser(ownerUserId);
    } catch {
      // Keep the original creation error; cleanup can be retried from audit logs.
    }
  };

  // 2) Asegurar el perfil owner con su nombre.
  let owner;
  try {
    [owner] = await db
      .update(profiles)
      .set({ role: "owner", name: d.ownerName ?? null })
      .where(eq(profiles.userId, ownerUserId))
      .returning({ id: profiles.id, userId: profiles.userId, role: profiles.role, tenantId: profiles.tenantId });

    if (!owner) {
      [owner] = await db
        .insert(profiles)
        .values({ userId: ownerUserId, role: "owner", name: d.ownerName ?? null, tenantId: crypto.randomUUID() })
        .returning({ id: profiles.id, userId: profiles.userId, role: profiles.role, tenantId: profiles.tenantId });
    }

    if (!owner) throw new Error("No se pudo crear el perfil del dueño");
  } catch (error) {
    await cleanupOwner();
    return apiError("OWNER_PROFILE_CREATE_FAILED", error instanceof Error ? error.message : "No se pudo crear el perfil", 500);
  }

  // 3) Crear la academia para ese dueño (createAcademy asigna tenant y membership).
  let result;
  try {
    result = await createAcademy(
      {
        name: d.academyName,
        academyType: d.academyType as never,
        country: d.country,
        countryCode: d.countryCode,
        region: d.region,
        city: d.city,
        disciplineVariant: d.disciplineVariant as never,
        ownerProfileId: owner.id,
      },
      { profile: { id: owner.id, userId: owner.userId, role: owner.role, tenantId: owner.tenantId } }
    );
  } catch (error) {
    await cleanupOwner();
    return apiError("ACADEMY_CREATE_FAILED", error instanceof Error ? error.message : "No se pudo crear la academia", 500);
  }

  if ("error" in result) {
    await cleanupOwner();
    return result.error ?? apiError("ACADEMY_CREATE_FAILED", "No se pudo crear la academia", 500);
  }

  await logAdminAction({
    userId: context.userId,
    tenantId: null,
    action: "academy.created",
    resourceType: "academy",
    resourceId: result.id,
    resourceName: d.academyName,
    description: `Super Admin creó la academia ${d.academyName}`,
    meta: { academyId: result.id, ownerEmail: d.ownerEmail, ownerProfileId: owner.id },
  });

  return apiCreated({ academyId: result.id, tenantId: result.tenantId });
});

export const GET = withSuperAdmin(async (request) => {
  const url = new URL(request.url);
  const planFilter = url.searchParams.get("plan") ?? undefined;
  const typeFilter = url.searchParams.get("type") ?? undefined;
  const countryFilter = url.searchParams.get("country") ?? undefined;
  const statusFilter = url.searchParams.get("status") as "active" | "suspended" | undefined;
  
  // Paginación
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? String(DEFAULT_PAGE_SIZE), 10))
  );

  const result = await getAcademiesPage({
    page,
    pageSize,
    plan: planFilter,
    type: typeFilter,
    country: countryFilter,
    status: statusFilter,
  });
  const totalPages = Math.ceil(result.total / pageSize);

  return apiSuccess({
    total: result.total,
    page,
    pageSize,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
    items: result.items,
  });
});
