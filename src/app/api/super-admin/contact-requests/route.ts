import { and, desc, eq, lt, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { leadInteractions } from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { withSuperAdmin } from "@/lib/authz";
import { CONTACT_REQUEST_REASONS } from "@/lib/super-admin/contact-request-types";
import {
  CONTACT_REQUEST_MAX_PAGE_SIZE,
  CONTACT_REQUEST_PAGE_SIZE,
  decodeContactRequestCursor,
  encodeContactRequestCursor,
} from "@/lib/super-admin/contact-request-cursor";

export const dynamic = "force-dynamic";

const ALLOWED_QUERY_KEYS = new Set(["limit", "cursor", "reason"]);
const querySchema = z
  .object({
    limit: z
      .string()
      .regex(/^\d{1,3}$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(CONTACT_REQUEST_MAX_PAGE_SIZE))
      .optional(),
    cursor: z.string().max(256).optional(),
    reason: z.enum(CONTACT_REQUEST_REASONS).optional(),
  })
  .strict();

function noStore<T extends Response>(response: T): T {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

const protectedGet = withSuperAdmin(async (request: Request) => {
  const url = new URL(request.url);
  const params = url.searchParams;
  const keys = [...params.keys()];
  if (
    keys.some((key) => !ALLOWED_QUERY_KEYS.has(key)) ||
    keys.some((key) => params.getAll(key).length !== 1)
  ) {
    return apiError("VALIDATION_ERROR", "Parámetros de consulta inválidos", 400);
  }

  const parsedQuery = querySchema.safeParse(Object.fromEntries(params.entries()));
  if (!parsedQuery.success) {
    return apiError("VALIDATION_ERROR", "Parámetros de consulta inválidos", 400);
  }

  const { limit = CONTACT_REQUEST_PAGE_SIZE, reason } = parsedQuery.data;
  const encodedCursor = parsedQuery.data.cursor;
  const cursor = encodedCursor
    ? decodeContactRequestCursor(encodedCursor)
    : null;
  if (encodedCursor && !cursor) {
    return apiError("VALIDATION_ERROR", "El cursor no es válido", 400);
  }

  try {
    const conditions: SQL[] = [];
    if (reason) conditions.push(eq(leadInteractions.reason, reason));

    if (cursor) {
      // Keep the database's microsecond precision in the cursor. JavaScript Date
      // would truncate PostgreSQL timestamps to milliseconds and could skip rows.
      const cursorTimestamp = sql`${cursor.createdAt}::timestamptz`;
      conditions.push(
        or(
          lt(leadInteractions.createdAt, cursorTimestamp),
          and(
            eq(leadInteractions.createdAt, cursorTimestamp),
            lt(leadInteractions.id, cursor.id)
          )
        )!
      );
    }

    const rows = await db
      .select({
        id: leadInteractions.id,
        name: leadInteractions.name,
        email: leadInteractions.email,
        academy: leadInteractions.academy,
        reason: leadInteractions.reason,
        message: leadInteractions.message,
        createdAt: leadInteractions.createdAt,
        cursorCreatedAt: sql<string>`to_char(${leadInteractions.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as(
          "cursor_created_at"
        ),
      })
      .from(leadInteractions)
      .where(and(...conditions))
      .orderBy(desc(leadInteractions.createdAt), desc(leadInteractions.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const lastRow = pageRows[pageRows.length - 1];
    const nextCursor = hasMore && lastRow
      ? encodeContactRequestCursor({
          createdAt: lastRow.cursorCreatedAt,
          id: lastRow.id,
        })
      : null;

    return apiSuccess({
      items: pageRows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        academy: row.academy,
        reason: row.reason,
        message: row.message,
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor,
    });
  } catch {
    // Do not log submitted PII or query/cursor values.
    return apiError(
      "CONTACT_REQUESTS_UNAVAILABLE",
      "No se pudieron cargar las solicitudes. Inténtalo de nuevo.",
      500
    );
  }
});

export async function GET(request: Request) {
  // withSuperAdmin runs before query validation and before lead_interactions is read.
  return noStore(await protectedGet(request, {}));
}
