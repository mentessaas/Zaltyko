/**
 * GET /api/dashboard/[academyId]/attention?view=owner|coach&date=YYYY-MM-DD
 *
 * Devuelve el bundle de atención del académico bajo el contrato ZAL-619 §3.2
 * y §6.2 (`dashboard.get`). Sirve al dashboard operativo del dueño
 * (`/app/[academyId]/dashboard/at-a-glance`) y al modo simple del coach
 * (`/app/[academyId]/coach/today-simple`). El mismo endpoint es consumido
 * por Mobile para no duplicar la forma del payload.
 *
 * Auth: `withTenant` resuelve `tenantId`/`academyId`/`profile`. Adicional:
 *   - view=owner requiere owner o admin (membership o academies.ownerId).
 *   - view=coach requiere owner, admin o coach.
 *   - super_admin puede ver ambos (debug, soporte).
 *
 * Errores tipificados por el contrato ZAL-619 §6.3:
 *   401 UNAUTHENTICATED, 403 FORBIDDEN_ROLE, 404 ACADEMY_NOT_FOUND,
 *   400 VALIDATION_ERROR, 500 INTERNAL_ERROR, 429 RATE_LIMITED.
 */

import { z } from "zod";

import { apiError, apiSuccess, type ResponseMeta } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { verifyAcademyAccessForProfile } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import {
  getCoachAttentionBundle,
  getOwnerAttentionBundle,
} from "@/lib/dashboard/attention-bundle";

export const dynamic = "force-dynamic";

const AttentionQuerySchema = z.object({
  view: z.enum(["owner", "coach"]).default("owner"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date debe ser YYYY-MM-DD")
    .optional(),
});

function metaWith(academyId: string, requestId: string): ResponseMeta & {
  requestId: string;
  academyId: string;
} {
  return { requestId, academyId };
}

function generateRequestId(): string {
  // Identificador corto, sin info sensible. Suficiente para correlación con
  // el logger; el APM real lo inyecta `withTenant` en próximas iteraciones.
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const GET = withTenant(async (request, context) => {
  const requestId = generateRequestId();
  const params = context.params as { academyId?: string };
  const academyId = params?.academyId;

  if (!academyId) {
    return apiError("ACADEMY_ID_REQUIRED", "Falta academyId en la ruta", 400, undefined, {
      headers: { "x-request-id": requestId },
    });
  }

  const url = new URL(request.url);
  const rawQuery = {
    view: url.searchParams.get("view") ?? undefined,
    date: url.searchParams.get("date") ?? undefined,
  };
  const parsed = AttentionQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    return apiError(
      "VALIDATION_ERROR",
      "Parámetros de consulta inválidos",
      400,
      parsed.error.flatten(),
      { headers: { "x-request-id": requestId } }
    );
  }
  const { view, date } = parsed.data;

  // Verificar acceso a la academia con el `tenantId` resuelto por withTenant.
  // (No confiamos en el `academyId` aportado por el cliente; el wrapper ya
  // lo confronta contra el membership/ownership del profile.)
  const access = await verifyAcademyAccessForProfile({
    academyId,
    tenantId: context.tenantId,
    profile: context.profile,
  });
  if (!access.allowed) {
    logger.warn("attention:academy_access_denied", {
      requestId,
      academyId,
      reason: access.reason,
    });
    return apiError(
      access.reason ?? "FORBIDDEN",
      "No tienes acceso a esta academia",
      access.reason === "ACADEMY_NOT_FOUND_OR_ACCESS_DENIED" ? 404 : 403,
      undefined,
      { headers: { "x-request-id": requestId } }
    );
  }

  // Verificación de rol adicional para `view`.
  // super_admin bypass para diagnóstico; owner/admin tienen bundle completo;
  // coach tiene subset read-only.
  const role = context.profile.role;
  const isSuperAdmin = role === "super_admin";
  if (view === "owner" && !isSuperAdmin) {
    // El bundle de owner expone cobros e import — solo owner/admin lo ven.
    if (role !== "owner" && role !== "admin") {
      return apiError(
        "FORBIDDEN_ROLE",
        "Esta vista requiere rol owner o admin",
        403,
        undefined,
        { headers: { "x-request-id": requestId } }
      );
    }
  }
  if (view === "coach" && !isSuperAdmin) {
    if (role !== "owner" && role !== "admin" && role !== "coach") {
      return apiError(
        "FORBIDDEN_ROLE",
        "Esta vista requiere rol coach, owner o admin",
        403,
        undefined,
        { headers: { "x-request-id": requestId } }
      );
    }
  }

  try {
    if (view === "coach") {
      const data = await getCoachAttentionBundle({
        academyId,
        tenantId: context.tenantId,
        date,
      });
      return apiSuccess(data, metaWith(academyId, requestId));
    }
    const data = await getOwnerAttentionBundle({
      academyId,
      tenantId: context.tenantId,
      date,
    });
    return apiSuccess(data, metaWith(academyId, requestId));
  } catch (error) {
    logger.error("attention:handler_unexpected", { requestId, academyId, error });
    return apiError(
      "INTERNAL_ERROR",
      "No pudimos cargar el panel. Inténtalo de nuevo.",
      500,
      undefined,
      { headers: { "x-request-id": requestId } }
    );
  }
});
