import { z } from "zod";

import { logAdminAction } from "@/lib/admin-logs";
import { apiError, apiSuccess } from "@/lib/api-response";
import { withSuperAdmin } from "@/lib/authz";
import { updateContentNotice } from "@/modules/element-library/application/notices";
import { contentNoticeUpdateSchema } from "@/modules/element-library/domain/content-notices";

import { crossOrigin, failure, noStore, readJson } from "../../element-library/http";

export const dynamic = "force-dynamic";

const noticeIdSchema = z.guid().transform((value) => value.toLowerCase());

/**
 * Cambia el estado de un aviso, su respuesta o los dos; `closed` lo cierra
 * (`closed_at`) y desde ahí cuentan los dos años de conservación del
 * remitente. Constancia en `public.audit_logs` (`tenantId` nulo: el aviso no
 * es de ninguna academia), sin nombre, correo ni texto de la respuesta.
 */
export const PATCH = withSuperAdmin(async (request, context) => {
  const blocked = crossOrigin(request);
  if (blocked) return blocked;
  const noticeId = noticeIdSchema.safeParse((context.params as { noticeId?: unknown } | undefined)?.noticeId);
  if (!noticeId.success) return noStore(apiError("NOT_FOUND", "No encontramos ese aviso.", 404));
  const parsed = contentNoticeUpdateSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return noStore(
      apiError("VALIDATION_ERROR", "Revisa el estado o la respuesta (hasta 2000 caracteres).", 400, {
        fields: [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? "")))],
      })
    );
  }
  try {
    const notice = await updateContentNotice(noticeId.data, parsed.data);
    await logAdminAction({
      userId: context.userId,
      tenantId: null,
      action: "element_library.content_notice_updated",
      module: "element_library",
      resourceType: "content_notice",
      resourceId: notice.id,
      description: `Super Admin actualizó el aviso de contenido ${notice.id}`,
      meta: {
        status: notice.status,
        responseChanged: parsed.data.response !== undefined,
        closedAt: notice.closedAt,
      },
    });
    return noStore(apiSuccess(notice));
  } catch (error) {
    return failure(error, "No se pudo guardar el aviso. Inténtalo de nuevo.");
  }
});
