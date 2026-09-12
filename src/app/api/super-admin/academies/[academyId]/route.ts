import { apiSuccess, apiError } from "@/lib/api-response";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academies, subscriptions, plans, profiles } from "@/db/schema";
import { withSuperAdmin } from "@/lib/authz";
import { logAdminAction } from "@/lib/admin-logs";
import { getSuperAdminAcademyDetail } from "@/lib/super-admin";
import { revalidatePublicAcademySeo } from "@/lib/seo/revalidate-academy";

export const dynamic = "force-dynamic";

const reasonSchema = z.string().trim().min(5).max(500);
const academyTypeSchema = z.enum(["artistica", "ritmica", "trampolin", "general", "parkour", "danza"]);
const managedAcademyStatusSchema = z.enum(["active", "trial", "suspended"]);
const updateAcademySchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    isSuspended: z.boolean().optional(),
    status: managedAcademyStatusSchema.optional(),
    reason: reasonSchema.optional(),
    planId: z.string().uuid().nullable().optional(),
    academyType: academyTypeSchema.optional(),
    country: z.string().trim().max(120).nullable().optional(),
    region: z.string().trim().max(120).nullable().optional(),
    city: z.string().trim().max(120).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.status === "suspended" && value.isSuspended === false) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["isSuspended"],
        message: "Una academia suspendida debe mantener el acceso bloqueado",
      });
    }
    if (value.status && value.status !== "suspended" && value.isSuspended === true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["isSuspended"],
        message: "Una academia operativa no puede mantener el acceso bloqueado",
      });
    }
  });

export const GET = withSuperAdmin(async (_request, context) => {
  const params = context.params as { academyId?: string };
  const academyId = params?.academyId;
  if (!academyId) {
    return apiError("ACADEMY_ID_REQUIRED", "Academy ID is required", 400);
  }

  const academy = await getSuperAdminAcademyDetail(academyId);

  if (!academy) {
    return apiError("ACADEMY_NOT_FOUND", "Academy not found", 404);
  }

  return apiSuccess(academy);
});

export const PATCH = withSuperAdmin(async (request, context) => {
  const params = context.params as { academyId?: string };
  const academyId = params?.academyId;
  if (!academyId) {
    return apiError("ACADEMY_ID_REQUIRED", "Academy ID is required", 400);
  }

  const parsedBody = updateAcademySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsedBody.success) {
    return apiError(
      "VALIDATION_ERROR",
      parsedBody.error.issues[0]?.message ?? "Datos inválidos",
      400
    );
  }
  const body = parsedBody.data;
  const updates: Record<string, unknown> = {};
  let planUpdate: { planId: string | null } | null = null;

  if (body.name !== undefined) {
    updates.name = body.name;
  }

  if (typeof body.isSuspended === "boolean") {
    updates.isSuspended = body.isSuspended;
    updates.suspendedAt = body.isSuspended ? new Date() : null;
  }

  if (body.status !== undefined) {
    updates.status = body.status;
    updates.statusUpdatedAt = new Date();
    if (body.isSuspended === undefined) {
      updates.isSuspended = body.status === "suspended";
      updates.suspendedAt = body.status === "suspended" ? new Date() : null;
    }
  }

  if (body.planId !== undefined) {
    if (body.planId === null) {
      planUpdate = { planId: null };
    } else if (typeof body.planId === "string" && body.planId.trim().length > 0) {
      const [plan] = await db.select({ id: plans.id }).from(plans).where(eq(plans.id, body.planId)).limit(1);
      if (!plan) {
        return apiError("PLAN_NOT_FOUND", "El plan seleccionado no existe", 404);
      }
      planUpdate = { planId: plan.id };
    }
  }

  // Edición completa: tipo, país, región y ciudad.
  if (body.academyType !== undefined) {
    updates.academyType = body.academyType;
  }
  if (body.country !== undefined) {
    updates.country = body.country;
  }
  if (body.region !== undefined) {
    updates.region = body.region;
  }
  if (body.city !== undefined) {
    updates.city = body.city;
  }

  if (Object.keys(updates).length === 0 && !planUpdate) {
    return apiError("NO_CHANGES", "No changes provided", 400);
  }

  let updated;
  try {
    updated = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          id: academies.id,
          name: academies.name,
          status: academies.status,
          isSuspended: academies.isSuspended,
          ownerId: academies.ownerId,
        })
        .from(academies)
        .where(eq(academies.id, academyId))
        .limit(1);

      if (!current) return null;

      const statusChanged = body.status !== undefined && body.status !== current.status;
      const suspensionChanged =
        typeof body.isSuspended === "boolean" && body.isSuspended !== current.isSuspended;

      if ((statusChanged || suspensionChanged) && !body.reason) {
        throw new Error("REASON_REQUIRED");
      }

      if (
        (body.status !== undefined || body.isSuspended !== undefined) &&
        (current.status === "fraud_hold" || current.status === "churned")
      ) {
        throw new Error("ACADEMY_STATUS_LOCKED");
      }

      const [academy] = await tx
        .update(academies)
        .set(updates)
        .where(eq(academies.id, academyId))
        .returning({
          id: academies.id,
          name: academies.name,
          isSuspended: academies.isSuspended,
          ownerId: academies.ownerId,
        });

      if (!academy) return null;

      if (planUpdate) {
        if (!academy.ownerId) {
          if (planUpdate.planId !== null) throw new Error("ACADEMY_HAS_NO_OWNER");
        } else {
          const [owner] = await tx
            .select({ userId: profiles.userId })
            .from(profiles)
            .where(eq(profiles.id, academy.ownerId))
            .limit(1);

          if (!owner) throw new Error("OWNER_NOT_FOUND");

          const [existingSubscription] = await tx
            .select({ id: subscriptions.id })
            .from(subscriptions)
            .where(eq(subscriptions.userId, owner.userId))
            .limit(1);

          if (existingSubscription) {
            await tx
              .update(subscriptions)
              .set({
                planId: planUpdate.planId,
                status: planUpdate.planId ? "active" : "canceled",
              })
              .where(eq(subscriptions.id, existingSubscription.id));
          } else if (planUpdate.planId) {
            await tx.insert(subscriptions).values({
              userId: owner.userId,
              planId: planUpdate.planId,
              status: "active",
            });
          }
        }
      }

      return academy;
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "ACADEMY_UPDATE_FAILED";
    if (code === "REASON_REQUIRED") {
      return apiError(code, "Indica el motivo del cambio de acceso", 400);
    }
    if (code === "ACADEMY_HAS_NO_OWNER") {
      return apiError(code, "Academy has no owner", 400);
    }
    if (code === "OWNER_NOT_FOUND") {
      return apiError(code, "Owner not found", 404);
    }
    if (code === "ACADEMY_STATUS_LOCKED") {
      return apiError(code, "Las academias dadas de baja o en revisión de fraude requieren un flujo de seguridad específico", 409);
    }
    return apiError("ACADEMY_UPDATE_FAILED", "No se pudo actualizar la academia", 500);
  }

  if (!updated) {
    return apiError("ACADEMY_NOT_FOUND", "Academy not found", 404);
  }

  revalidatePublicAcademySeo(academyId);

  await logAdminAction({
    userId: context.userId,
    tenantId: null,
    action: body.status === "suspended" || body.isSuspended ? "academy.suspended" : "academy.updated",
    resourceType: "academy",
    resourceId: academyId,
    resourceName: updated.name,
    description: body.status === "suspended" || body.isSuspended
      ? `Super Admin suspendió la academia ${updated.name ?? academyId}`
      : `Super Admin actualizó la academia ${updated.name ?? academyId}`,
    meta: {
      academyId,
      updates: { ...updates, ...(planUpdate ? { planId: planUpdate.planId } : {}) },
      reason: body.reason ?? null,
    },
  });

  return apiSuccess(updated);
});

export const DELETE = withSuperAdmin(async (request, context) => {
  const params = context.params as { academyId?: string };
  const academyId = params?.academyId;
  if (!academyId) {
    return apiError("ACADEMY_ID_REQUIRED", "Academy ID is required", 400);
  }

  const body = await request.json().catch(() => ({}));
  const reason = reasonSchema.safeParse(body?.reason);
  if (!reason.success) {
    return apiError("REASON_REQUIRED", "Indica el motivo de la eliminación", 400);
  }

  const removed = await db.transaction(async (tx) => {
    const [deletedAcademy] = await tx
      .delete(academies)
      .where(eq(academies.id, academyId))
      .returning({ id: academies.id, name: academies.name });

    if (!deletedAcademy) return null;

    // activeAcademyId no es una FK: limpiarlo evita sesiones apuntando a una academia borrada.
    await tx
      .update(profiles)
      .set({ activeAcademyId: null })
      .where(eq(profiles.activeAcademyId, academyId));

    return deletedAcademy;
  });

  if (!removed) {
    return apiError("ACADEMY_NOT_FOUND", "Academy not found", 404);
  }

  revalidatePublicAcademySeo(academyId);

  await logAdminAction({
    userId: context.userId,
    tenantId: null,
    action: "academy.deleted",
    resourceType: "academy",
    resourceId: academyId,
    resourceName: removed.name,
    description: `Super Admin eliminó la academia ${removed.name ?? academyId}; la cuenta del dueño se conserva`,
    meta: { academyId, ownerAccountRetained: true, reason: reason.data },
  });

  return apiSuccess({ ok: true });
});
