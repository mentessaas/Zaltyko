export const dynamic = "force-dynamic";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { charges } from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";
import { handleApiError } from "@/lib/api-error-handler";
import { z } from "zod";

/**
 * GET /api/charges/[chargeId]/status
 * @resource-scope academy — the charge id is always constrained by the
 * authenticated tenant before its status is returned.
 *
 * Devuelve el estado actual del cargo en DB. Pensado para que el dashboard del
 * owner haga polling tras un reto 3DS y espere a que el webhook
 * `payment_intent.succeeded` reconcilie la fila (`status = paid`) antes de
 * refrescar la lista — sin esto, el UI gana la carrera al webhook y muestra
 * "Cobro autenticado" sobre un cargo todavía en "Pago fallido".
 *
 * Solo expone `id` y `status` (sin totales ni datos sensibles).
 */
export const GET = withTenant(async (request, context) => {
  try {
    const url = new URL(request.url);
    const chargeId = url.pathname.match(/^\/api\/charges\/([^/]+)\/status/)?.[1];
    if (!chargeId) {
      return apiError("CHARGE_ID_REQUIRED", "Charge ID is required", 400);
    }
    if (!z.string().uuid().safeParse(chargeId).success) {
      return apiError("INVALID_CHARGE_ID", "Charge ID is invalid", 400);
    }
    if (!context.tenantId) {
      return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
    }

    const [row] = await db
      .select({ id: charges.id, status: charges.status, tenantId: charges.tenantId, academyId: charges.academyId })
      .from(charges)
      .where(and(eq(charges.id, chargeId), eq(charges.tenantId, context.tenantId)))
      .limit(1);

    if (!row) {
      return apiError("CHARGE_NOT_FOUND", "Cargo no encontrado", 404);
    }

    const scope = await authorizeAcademyCapability({
      context,
      resourceTenantId: row.tenantId,
      academyId: row.academyId,
      permission: "billing:read",
    });
    if (!scope.allowed) {
      return apiError("CHARGE_NOT_FOUND", "Cargo no encontrado", 404);
    }
    return apiSuccess({ id: row.id, status: row.status });
  } catch (error) {
    return handleApiError(error, {
      endpoint: "/api/charges/[chargeId]/status",
      method: "GET",
    });
  }
});
