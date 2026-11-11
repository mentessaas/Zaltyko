/**
 * Shared request handling of the athlete import routes: session, same origin,
 * upload limits, the multipart form and the Owner scope. The upload is read
 * into memory only; it is never written to disk or to storage.
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
const MAX_REQUEST_BYTES = ATHLETE_IMPORT_MAX_BYTES + 64 * 1024;

export function noStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

export type ImportRequest = {
  userId: string;
  organizationId: string;
  memberId: string;
  fileBytes: Uint8Array;
  mapping: AthleteImportMapping | null;
  previewToken: string | null;
};

type Parsed = { ok: true; value: ImportRequest } | { ok: false; response: NextResponse };

function invalid(detail: string, type = "invalid-athlete-import-request", status = 400): Parsed {
  return { ok: false, response: noStore(problemResponse({ status, title: "Importación no válida", detail, type })) };
}

/**
 * Authenticates, checks origin and size, reads the form and resolves the
 * Owner scope (owner, admin or manager; coaches are refused). The service
 * repeats the role and site checks inside its transaction.
 */
export async function readImportRequest(request: Request): Promise<Parsed> {
  const user = await getCurrentUser(request);
  if (!user) {
    return {
      ok: false,
      response: noStore(
        problemResponse({
          status: 401,
          title: "Autenticación requerida",
          detail: "Inicia sesión para importar gimnastas.",
          type: "authentication-required",
        })
      ),
    };
  }
  if (!hasSameOrigin(request)) {
    return invalid("La solicitud debe proceder de la misma web.", "invalid-origin", 403);
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return invalid("El fichero supera los 2 MB. Divídelo en varios ficheros.", "athlete-import-too-large", 413);
  }

  const form = await request.formData().catch(() => null);
  if (!form) return invalid("Envía el fichero en un formulario.");
  const file = form.get("file");
  const organizationId = z.guid().safeParse(form.get("organizationId"));
  if (!(file instanceof File) || !organizationId.success) {
    return invalid("Elige un fichero CSV o Excel (.xlsx) y la academia.");
  }
  if (file.size > ATHLETE_IMPORT_MAX_BYTES) {
    return invalid("El fichero supera los 2 MB. Divídelo en varios ficheros.", "athlete-import-too-large", 413);
  }

  let mapping: AthleteImportMapping | null = null;
  const rawMapping = form.get("mapping");
  if (typeof rawMapping === "string" && rawMapping) {
    let decoded: unknown;
    try {
      decoded = JSON.parse(rawMapping);
    } catch {
      return invalid("El mapeo de columnas no es válido.");
    }
    const parsed = athleteImportMappingSchema.safeParse(decoded);
    if (!parsed.success) return invalid("El mapeo de columnas no es válido.");
    mapping = parsed.data;
  }
  const rawToken = form.get("previewToken");
  const previewToken = typeof rawToken === "string" && /^[a-f0-9]{64}$/u.test(rawToken) ? rawToken : null;

  try {
    const scope = await resolveOwnerScope({ userId: user.id, organizationId: organizationId.data.toLowerCase() });
    const limit = await rateLimit({
      identifier: getVerifiedTenantRateLimitIdentifier(request, scope.organization.id),
      ...getLimitForRoute(new URL(request.url).pathname),
    });
    if (!limit.success) return { ok: false, response: noStore(rateLimitExceededResponse(limit)) };
    return {
      ok: true,
      value: {
        userId: user.id,
        organizationId: scope.organization.id,
        memberId: scope.member.id,
        fileBytes: new Uint8Array(await file.arrayBuffer()),
        mapping,
        previewToken,
      },
    };
  } catch (error) {
    if (error instanceof OperationalError) return { ok: false, response: noStore(operationalProblem(error)) };
    throw error;
  }
}
