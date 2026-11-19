import { z } from "zod";

import { logAdminAction } from "@/lib/admin-logs";
import { apiError, apiSuccess } from "@/lib/api-response";
import { withSuperAdmin } from "@/lib/authz";
import { withdrawCatalogElement } from "@/modules/element-library/application/withdrawals";
import { elementWithdrawalSchema } from "@/modules/element-library/domain/content-notices";

import { crossOrigin, failure, noStore, readJson } from "../../../http";

export const dynamic = "force-dynamic";

const elementIdSchema = z.guid().transform((value) => value.toLowerCase());

/**
 * «Retirar» un elemento del catálogo (ADR-0029 §8.3): motivo (10–500) y, si lo
 * hay, el aviso que lo motiva. El elemento deja de verse al momento y ninguna
 * semilla lo deshace; los niveles y guiones de las academias que lo enlazan
 * conservan sus filas.
 *
 * La constancia va a `public.audit_logs` con `logAdminAction` y `tenantId`
 * nulo: `zaltyko.audit_log` exige `organization_id` y esta acción es global,
 * no de una academia.
 */
export const POST = withSuperAdmin(async (request, context) => {
  const blocked = crossOrigin(request);
  if (blocked) return blocked;
  const elementId = elementIdSchema.safeParse((context.params as { elementId?: unknown } | undefined)?.elementId);
  if (!elementId.success) return noStore(apiError("NOT_FOUND", "No encontramos ese elemento.", 404));
  const parsed = elementWithdrawalSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? "")))];
    const message = fields.includes("reason")
      ? "Indica el motivo de la retirada (entre 10 y 500 caracteres)."
      : fields.includes("noticeId")
        ? "La referencia del aviso no es válida. Cópiala tal cual de Avisos o déjala vacía."
        : "Revisa los datos de la retirada.";
    return noStore(apiError("VALIDATION_ERROR", message, 400, { fields }));
  }
  try {
    const withdrawn = await withdrawCatalogElement(elementId.data, parsed.data);
    await logAdminAction({
      userId: context.userId,
      tenantId: null,
      action: "element_library.element_withdrawn",
      module: "element_library",
      resourceType: "catalog_element",
      resourceId: withdrawn.id,
      resourceName: withdrawn.name,
      description: `Super Admin retiró el elemento ${withdrawn.elementKey} (${withdrawn.editionCode}) de la biblioteca`,
      meta: {
        elementKey: withdrawn.elementKey,
        editionCode: withdrawn.editionCode,
        reason: parsed.data.reason,
        noticeId: parsed.data.noticeId ?? null,
        withdrawnAt: withdrawn.withdrawnAt,
      },
    });
    return noStore(apiSuccess(withdrawn));
  } catch (error) {
    return failure(error, "No se pudo retirar el elemento. Inténtalo de nuevo.");
  }
});
