import { z } from "zod";
import { eq } from "drizzle-orm";
import { apiSuccess, apiCreated, apiError } from "@/lib/api-response";

import { db } from "@/db";
import { profiles } from "@/db/schema";
import { academyStatusValues, type AcademyStatus } from "@/db/schema/academies";
import { withSuperAdmin } from "@/lib/authz";
import { getAcademiesPage } from "@/lib/superAdminService";
import { createAcademy } from "@/app/api/academies/academies.lib";
import { createAuthUser, deleteAuthUser } from "@/lib/supabase/admin-operations";
import { logAdminAction } from "@/lib/admin-logs";

export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
const ACADEMY_TYPES = ["artistica", "ritmica", "trampolin", "general", "parkour", "danza"] as const;
const AcademyTypeSchema = z.enum(ACADEMY_TYPES);

const CreateAcademySchema = z.object({
  academyName: z.string().min(3, "El nombre debe tener al menos 3 caracteres"),
  academyType: AcademyTypeSchema.optional(),
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
        academyType: d.academyType,
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
  const typeParam = url.searchParams.get("type");
  const typeFilter = ACADEMY_TYPES.includes(typeParam as (typeof ACADEMY_TYPES)[number]) ? typeParam ?? undefined : undefined;
  const countryFilter = url.searchParams.get("country") ?? undefined;
  const statusParam = url.searchParams.get("status");
  const statusFilter = academyStatusValues.includes(statusParam as AcademyStatus)
    ? (statusParam as AcademyStatus)
    : undefined;

  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE)
  );

  const result = await getAcademiesPage({
    page,
    pageSize,
    plan: planFilter,
    type: typeFilter,
    country: countryFilter,
    status: statusFilter,
  });
  const totalPages = Math.max(1, Math.ceil(result.total / pageSize));
  const effectivePage = result.page;

  return apiSuccess({
    total: result.total,
    page: effectivePage,
    pageSize,
    totalPages,
    hasNextPage: effectivePage < totalPages,
    hasPreviousPage: effectivePage > 1,
    items: result.items,
  });
});
