import { apiSuccess } from "@/lib/api-response";
import { withSuperAdmin } from "@/lib/authz";
import { decodeNoticeCursor, listContentNotices } from "@/modules/element-library/application/notices";
import { contentNoticeListQuerySchema } from "@/modules/element-library/domain/content-notices";

import { failure, invalidQuery, noStore, strictQuery } from "../element-library/http";

export const dynamic = "force-dynamic";

const QUERY_KEYS = ["status", "limit", "cursor"] as const;

/**
 * Registro de avisos sobre contenido (ADR-0029 §8.2), del más reciente al más
 * antiguo. Incluye nombre y correo de quien avisa mientras no se hayan borrado.
 */
export const GET = withSuperAdmin(async (request) => {
  const raw = strictQuery(request, QUERY_KEYS);
  const parsed = raw ? contentNoticeListQuerySchema.safeParse(raw) : null;
  if (!parsed?.success) return invalidQuery();
  const cursor = parsed.data.cursor ? decodeNoticeCursor(parsed.data.cursor) : null;
  if (parsed.data.cursor && !cursor) return invalidQuery();
  try {
    const page = await listContentNotices({ status: parsed.data.status, limit: parsed.data.limit, cursor });
    return noStore(apiSuccess(page));
  } catch (error) {
    // Sin registrar el error: puede llevar datos de quien avisa.
    return failure(error, "No se pudieron cargar los avisos. Inténtalo de nuevo.");
  }
});
