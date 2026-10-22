import { z } from "zod";
import { eq } from "drizzle-orm";
import { apiSuccess, apiCreated, apiError } from "@/lib/api-response";

import { db } from "@/db";
import { profiles } from "@/db/schema";
import { withSuperAdmin } from "@/lib/authz";
import { getAllAcademies } from "@/lib/superAdminService";
import { createAcademy } from "@/app/api/academies/academies.lib";
import { createAuthUser, deleteAuthUser } from "@/lib/supabase/admin-operations";
import { logAdminAction } from "@/lib/admin-logs";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

function parsePageParam(value: string | null, fallback: number, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? Math.min(parsed, max) : fallback;
}

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

  // Auth y base de datos no comparten una transacción. Si falla el perfil o la
  // academia, retirar la cuenta recién creada evita dejar usuarios huérfanos.
  let ownerProfileId: string | null = null;
  const rollbackOwner = async (reason: unknown) => {
    if (ownerProfileId) {
      try {
        // profiles.user_id no tiene una FK garantizada a auth.users en todas
        // las instalaciones; borrar explícitamente también limpia academias
        // por CASCADE si createAcademy alcanzó a insertarla.
        await db.delete(profiles).where(eq(profiles.id, ownerProfileId));
      } catch (rollbackError) {
        logger.error("No se pudo revertir el perfil owner", rollbackError, {
          ownerProfileId,
          reason: reason instanceof Error ? reason.message : String(reason),
        });
      }
    }
    try {
      await deleteAuthUser(ownerUserId);
    } catch (rollbackError) {
      logger.error("No se pudo revertir el owner creado por Super Admin", rollbackError, {
        ownerUserId,
        reason: reason instanceof Error ? reason.message : String(reason),
      });
    }
  };

  let owner: { id: string; userId: string; role: "owner" | "admin"; tenantId: string };
  try {
    // 2) Asegurar el perfil owner con su nombre.
    let [ownerRow] = await db
      .update(profiles)
      .set({ role: "owner", name: d.ownerName ?? null })
      .where(eq(profiles.userId, ownerUserId))
      .returning({ id: profiles.id, userId: profiles.userId, role: profiles.role, tenantId: profiles.tenantId });

    if (!ownerRow) {
      [ownerRow] = await db
        .insert(profiles)
        .values({ userId: ownerUserId, role: "owner", name: d.ownerName ?? null, tenantId: crypto.randomUUID() })
        .returning({ id: profiles.id, userId: profiles.userId, role: profiles.role, tenantId: profiles.tenantId });
    }
    if (!ownerRow || (ownerRow.role !== "owner" && ownerRow.role !== "admin") || !ownerRow.tenantId) {
      throw new Error("No se pudo asegurar el perfil del propietario");
    }
    ownerProfileId = ownerRow.id;
    owner = ownerRow as typeof owner;

    // 3) Crear la academia para ese dueño (createAcademy asigna tenant y membership).
    const result = await createAcademy(
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

    if ("error" in result) {
      await rollbackOwner(result.error);
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
  } catch (error) {
    await rollbackOwner(error);
    return apiError("ACADEMY_CREATE_FAILED", error instanceof Error ? error.message : "No se pudo crear la academia", 500);
  }
});

export const GET = withSuperAdmin(async (request) => {
  const url = new URL(request.url);
  const planFilter = url.searchParams.get("plan") ?? undefined;
  const typeFilter = url.searchParams.get("type") ?? undefined;
  const countryFilter = url.searchParams.get("country") ?? undefined;
  const statusFilter = url.searchParams.get("status") as "active" | "suspended" | undefined;
  
  // Paginación
  const page = parsePageParam(url.searchParams.get("page"), 1);
  const pageSize = parsePageParam(url.searchParams.get("limit"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

  const items = await getAllAcademies();

  const filtered = items.filter((academy) => {
    if (planFilter && academy.planCode !== planFilter) return false;
    if (typeFilter && academy.academyType !== typeFilter) return false;
    if (countryFilter && academy.country !== countryFilter) return false;
    if (statusFilter) {
      const isSuspended = statusFilter === "suspended";
      if (academy.isSuspended !== isSuspended) return false;
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
