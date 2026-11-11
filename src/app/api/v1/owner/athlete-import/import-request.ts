/**
 * Shared request handling of the athlete import routes. In this order, and
 * before a single byte of the body is read:
 *
 * 1. session and same origin;
 * 2. the academy from the query string (`?organizationId=`) and the Owner
 *    scope: an active owner or admin with every site, as the manual intake;
 * 3. the rate limit;
 * 4. the Idempotency-Key, when the route needs one;
 * 5. the declared size.
 *
 * Then the body is read as a stream and cut at the limit, whatever the
 * Content-Length says, and only then parsed as a form. The upload stays in
 * memory; it is never written to disk or to storage.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { operationalProblem, problemResponse } from "@/app/api/v1/problem";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getLimitForRoute,
  getVerifiedTenantRateLimitIdentifier,
  rateLimit,
  rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { ATHLETE_IMPORT_MAX_BYTES } from "@/modules/athlete-import/application/athlete-import-file";
import { athleteImportMappingSchema } from "@/modules/athlete-import/application/athlete-import-service";
import type { AthleteImportMapping } from "@/modules/athlete-import/domain/athlete-import-rows";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { hasSameOrigin } from "@/modules/saas-billing/application/owner-access";
import { OperationalError } from "@/modules/shared/domain/operational-error";

/** Room for the multipart envelope and the small text fields. */
export const ATHLETE_IMPORT_MAX_REQUEST_BYTES = ATHLETE_IMPORT_MAX_BYTES + 64 * 1024;

export function noStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

export type ImportRequest = {
  userId: string;
  organizationId: string;
  memberId: string;
  /** Backed by a plain ArrayBuffer, as the import service and Response expect. */
  fileBytes: Uint8Array<ArrayBuffer>;
  mapping: AthleteImportMapping | null;
  previewToken: string | null;
  legalBasisConfirmed: boolean;
  idempotencyKey: string | null;
};

type Parsed = { ok: true; value: ImportRequest } | { ok: false; response: NextResponse };

function refuse(status: number, detail: string, type: string, title = "Importación no válida"): Parsed {
  return { ok: false, response: noStore(problemResponse({ status, title, detail, type })) };
}

const tooLarge = () =>
  refuse(413, "El fichero supera los 2 MB. Divídelo en varios ficheros.", "athlete-import-too-large");

/** Reads at most `limit` bytes of the body; null when it is longer. */
async function readBodyWithin(request: Request, limit: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!request.body) return new Uint8Array(new ArrayBuffer(0));
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

const idempotencyKeySchema = z.string().trim().min(8).max(150);

export async function readImportRequest(
  request: Request,
  options: { requireIdempotencyKey?: boolean } = {}
): Promise<Parsed> {
  const user = await getCurrentUser(request);
  if (!user) {
    return refuse(401, "Inicia sesión para importar gimnastas.", "authentication-required", "Autenticación requerida");
  }
  if (!hasSameOrigin(request)) {
    return refuse(403, "La solicitud debe proceder de la misma web.", "invalid-origin", "Origen no válido");
  }
  const organizationId = z.guid().safeParse(new URL(request.url).searchParams.get("organizationId"));
  if (!organizationId.success) {
    return refuse(400, "Indica la academia en la dirección de la petición.", "invalid-athlete-import-request");
  }

  let scope: Awaited<ReturnType<typeof resolveOwnerScope>>;
  try {
    scope = await resolveOwnerScope({ userId: user.id, organizationId: organizationId.data.toLowerCase() });
    if (!(["owner", "admin"] as string[]).includes(scope.member.role)) {
      throw new OperationalError(
        "FORBIDDEN",
        "Solo la propiedad o la administración de la academia pueden importar gimnastas.",
        403
      );
    }
    if (scope.member.locationScopeMode !== "all") {
      throw new OperationalError(
        "LOCATION_SCOPE_DENIED",
        "Importar gimnastas requiere acceso a todas las sedes de la academia.",
        403
      );
    }
  } catch (error) {
    if (error instanceof OperationalError) return { ok: false, response: noStore(operationalProblem(error)) };
    throw error;
  }

  // Counted per route (preview and confirmation apart), academy and client
  // address, before the body is read.
  const limit = await rateLimit({
    identifier: getVerifiedTenantRateLimitIdentifier(request, scope.organization.id),
    ...getLimitForRoute(new URL(request.url).pathname),
  });
  if (!limit.success) return { ok: false, response: noStore(rateLimitExceededResponse(limit)) };

  let idempotencyKey: string | null = null;
  if (options.requireIdempotencyKey) {
    const key = idempotencyKeySchema.safeParse(request.headers.get("idempotency-key") ?? "");
    if (!key.success) {
      return refuse(
        400,
        "Falta la clave de la operación (Idempotency-Key, de 8 a 150 caracteres).",
        "invalid-athlete-import-request"
      );
    }
    idempotencyKey = key.data;
  }

  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > ATHLETE_IMPORT_MAX_REQUEST_BYTES)) {
    return tooLarge();
  }
  const body = await readBodyWithin(request, ATHLETE_IMPORT_MAX_REQUEST_BYTES);
  if (!body) return tooLarge();
  const form = await new Response(body, {
    headers: { "content-type": request.headers.get("content-type") ?? "" },
  })
    .formData()
    .catch(() => null);
  if (!form) return refuse(400, "Envía el fichero en un formulario.", "invalid-athlete-import-request");
  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return refuse(400, "Elige un fichero CSV o Excel (.xlsx).", "invalid-athlete-import-request");
  }
  if (file.size > ATHLETE_IMPORT_MAX_BYTES) return tooLarge();

  let mapping: AthleteImportMapping | null = null;
  const rawMapping = form.get("mapping");
  if (typeof rawMapping === "string" && rawMapping) {
    let decoded: unknown;
    try {
      decoded = JSON.parse(rawMapping);
    } catch {
      return refuse(400, "El mapeo de columnas no es válido.", "invalid-athlete-import-request");
    }
    const parsed = athleteImportMappingSchema.safeParse(decoded);
    if (!parsed.success) return refuse(400, "El mapeo de columnas no es válido.", "invalid-athlete-import-request");
    mapping = parsed.data;
  }
  const rawToken = form.get("previewToken");
  return {
    ok: true,
    value: {
      userId: user.id,
      organizationId: scope.organization.id,
      memberId: scope.member.id,
      fileBytes: new Uint8Array(await file.arrayBuffer()),
      mapping,
      previewToken: typeof rawToken === "string" && /^[a-f0-9]{64}$/u.test(rawToken) ? rawToken : null,
      legalBasisConfirmed: form.get("legalBasisConfirmed") === "true",
      idempotencyKey,
    },
  };
}
