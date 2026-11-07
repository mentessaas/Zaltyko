import { NextResponse } from "next/server";
import { z } from "zod";

import { problemResponse } from "@/app/api/v1/problem";
import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit, rateLimitExceededResponse } from "@/lib/rate-limit";
import {
  CanonicalAcademyExportError,
  exportCanonicalAcademyData,
} from "@/modules/data-rights/application/canonical-academy-return";

const organizationIdSchema = z.guid();
const EXPORT_RATE_LIMIT = { limit: 3, window: 60 * 60 };

function noStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

function hasSafeReadOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).origin !== new URL(request.url).origin) return false;
    } catch {
      return false;
    }
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  return !fetchSite || fetchSite === "same-origin" || fetchSite === "none";
}

function exportProblem(error: CanonicalAcademyExportError): NextResponse {
  return problemResponse({
    status: error.status,
    title:
      error.status === 403
        ? "Acceso denegado"
        : error.status === 404
          ? "Exportación no disponible"
          : error.status === 413
            ? "Paquete demasiado grande"
            : "Exportación temporalmente no disponible",
    detail: error.message,
    type: error.problemType,
  });
}

// @auth-flexible route-guard-reason: this read-only GET requires a verified session, active Owner membership with organization-wide location scope, same-origin browser context when fetch metadata is present, per-user rate limiting, and transaction-scoped revalidation.
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) {
    return noStore(
      problemResponse({
        status: 401,
        title: "Autenticación requerida",
        detail: "Inicia sesión para descargar los datos de la academia.",
        type: "authentication-required",
      })
    );
  }

  if (!hasSafeReadOrigin(request)) {
    return noStore(
      problemResponse({
        status: 403,
        title: "Origen no válido",
        detail: "La descarga debe solicitarse desde el mismo sitio.",
        type: "invalid-origin",
      })
    );
  }

  const url = new URL(request.url);
  const organizationIds = url.searchParams.getAll("organizationId");
  const organizationId =
    organizationIds.length === 1
      ? organizationIdSchema.safeParse(organizationIds[0])
      : { success: false as const };

  if (!organizationId.success) {
    return noStore(
      problemResponse({
        status: 400,
        title: "Parámetro inválido",
        detail: "Indica una academia válida para preparar la descarga.",
        type: "invalid-data-export-query",
      })
    );
  }

  try {
    const limit = await rateLimit({
      identifier: `canonical-data-export:user:${user.id}`,
      ...EXPORT_RATE_LIMIT,
    });
    if (!limit.success) return noStore(rateLimitExceededResponse(limit));

    const exported = await exportCanonicalAcademyData({
      userId: user.id,
      organizationId: organizationId.data,
    });

    return noStore(
      new NextResponse(exported.body, {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-disposition": `attachment; filename="${exported.filename}"`,
          "content-length": String(exported.sizeBytes),
          "x-content-type-options": "nosniff",
          "content-security-policy": "default-src 'none'; sandbox",
          "cross-origin-resource-policy": "same-origin",
        },
      })
    );
  } catch (error) {
    if (error instanceof CanonicalAcademyExportError) {
      return noStore(exportProblem(error));
    }

    return noStore(
      problemResponse({
        status: 503,
        title: "Exportación temporalmente no disponible",
        detail: "No se pudo preparar el paquete completo. Inténtalo más tarde.",
        type: "canonical-export-unavailable",
      })
    );
  }
}
