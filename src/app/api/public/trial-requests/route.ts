import { NextResponse } from "next/server";

import { operationalProblem, problemResponse } from "@/app/api/v1/problem";
import { apiCreated, apiSuccess } from "@/lib/api-response";
import {
  getAddressHashRateLimitIdentifier,
  getClientIdentifier,
  rateLimit,
  rateLimitExceededResponse,
} from "@/lib/rate-limit";
import {
  LINK_NOT_RECEIVING_MESSAGE,
  resolveAdmissionLink,
  submitPublicTrialRequest,
} from "@/modules/admissions/application/admission-requests";
import { publicTrialRequestSchema } from "@/modules/admissions/domain/trial-request";
import { hasSameOrigin } from "@/modules/saas-billing/application/owner-access";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const MAX_BODY_BYTES = 8 * 1024;
/** Por IP: pocas solicitudes por hora, aunque cambie la academia o el email. */
const IP_LIMIT = { limit: 10, window: 60 * 60 };
/** Por dirección (hash, nunca el email en claro). */
const ADDRESS_LIMIT = { limit: 5, window: 60 * 60 };
/**
 * Por enlace, resuelto en el servidor. Contar por enlace y no por academia
 * permite a la academia recuperar el cupo regenerando el enlace si alguien lo
 * agota.
 */
const LINK_LIMIT = { limit: 30, window: 60 * 60 };

function noStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

function received(): NextResponse {
  return noStore(apiCreated({ received: true }));
}

// @auth-flexible route-guard-reason: public trial-request form for families. No session or cookie is read; it only accepts same-origin JSON, rejects bodies over 8 KB, validates with a strict schema, requires privacy consent, rate-limits by IP, by email hash and by the enabled link resolved from its token, and writes one row scoped to that academy and site. It never creates athletes, families or contacts and never sends email.
export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return noStore(
      problemResponse({
        status: 403,
        title: "Origen no válido",
        detail: "Envía la solicitud desde el formulario de la academia.",
        type: "invalid-origin",
      })
    );
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return noStore(
      problemResponse({
        status: 413,
        title: "Solicitud demasiado grande",
        detail: "Reduce el comentario e inténtalo de nuevo.",
        type: "payload-too-large",
      })
    );
  }
  const raw = await request.text().catch(() => "");
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return noStore(
      problemResponse({
        status: 413,
        title: "Solicitud demasiado grande",
        detail: "Reduce el comentario e inténtalo de nuevo.",
        type: "payload-too-large",
      })
    );
  }
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    body = null;
  }

  // Honeypot: un bot que rellena el campo oculto recibe la misma respuesta
  // que una persona, pero no se guarda nada.
  if (
    body &&
    typeof body === "object" &&
    typeof (body as { website?: unknown }).website === "string" &&
    (body as { website: string }).website.trim() !== ""
  ) {
    return received();
  }

  const ipLimit = await rateLimit({
    identifier: `trial-requests:${getClientIdentifier(request)}`,
    ...IP_LIMIT,
  });
  if (!ipLimit.success) return noStore(rateLimitExceededResponse(ipLimit));

  const parsed = publicTrialRequestSchema.safeParse(body);
  if (!parsed.success) {
    return noStore(
      problemResponse({
        status: 400,
        title: "Revisa el formulario",
        detail: parsed.error.issues.some((issue) => issue.path[0] === "privacyConsent")
          ? "Necesitamos tu consentimiento para enviar la solicitud a la academia."
          : "Faltan datos o alguno no es válido.",
        type: "invalid-trial-request",
        errors: { fields: [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? "")))] },
      })
    );
  }

  const addressLimit = await rateLimit({
    identifier: getAddressHashRateLimitIdentifier(
      parsed.data.contactEmail,
      new URL(request.url).pathname
    ),
    ...ADDRESS_LIMIT,
  });
  if (!addressLimit.success) return noStore(rateLimitExceededResponse(addressLimit));

  try {
    // Desconocido, desactivado, revocado o academia que no recibe: la misma
    // respuesta, para no confirmar qué enlaces existen.
    const link = await resolveAdmissionLink(parsed.data.linkToken);
    if (!link) {
      return noStore(operationalProblem(new OperationalError("NOT_FOUND", LINK_NOT_RECEIVING_MESSAGE, 404)));
    }
    const linkLimit = await rateLimit({
      identifier: `trial-requests:link:${link.linkId}`,
      ...LINK_LIMIT,
    });
    if (!linkLimit.success) return noStore(rateLimitExceededResponse(linkLimit));

    const result = await submitPublicTrialRequest(parsed.data);
    return result.replayed
      ? noStore(apiSuccess({ received: true }))
      : received();
  } catch (error) {
    if (error instanceof OperationalError) {
      return noStore(operationalProblem(error));
    }
    throw error;
  }
}
