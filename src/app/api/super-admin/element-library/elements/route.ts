import { apiSuccess } from "@/lib/api-response";
import { withSuperAdmin } from "@/lib/authz";
import {
  decodeElementCursor,
  listCatalogElementsForReview,
} from "@/modules/element-library/application/withdrawals";
import { elementReviewListQuerySchema } from "@/modules/element-library/domain/content-notices";

import { failure, invalidQuery, noStore, strictQuery } from "../http";

export const dynamic = "force-dynamic";

const QUERY_KEYS = ["state", "edition", "limit", "cursor"] as const;

/**
 * Elementos del catálogo por estado (borrador, revisado, retirado) para la
 * página de revisión del superadministrador (ADR-0029 §1.6). Solo lectura.
 */
export const GET = withSuperAdmin(async (request) => {
  const raw = strictQuery(request, QUERY_KEYS);
  const parsed = raw ? elementReviewListQuerySchema.safeParse(raw) : null;
  if (!parsed?.success) return invalidQuery();
  const cursor = parsed.data.cursor ? decodeElementCursor(parsed.data.cursor) : null;
  if (parsed.data.cursor && !cursor) return invalidQuery();
  try {
    const page = await listCatalogElementsForReview({
      state: parsed.data.state,
      edition: parsed.data.edition,
      limit: parsed.data.limit,
      cursor,
    });
    return noStore(apiSuccess(page));
  } catch (error) {
    return failure(error, "No se pudieron cargar los elementos. Inténtalo de nuevo.");
  }
});
