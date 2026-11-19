import { NextResponse } from "next/server";

import { operationalProblem, problemResponse } from "@/app/api/v1/problem";
import { apiCreated } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import {
  getAddressHashRateLimitIdentifier,
  getClientIdentifier,
  rateLimit,
  rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { submitContentNotice } from "@/modules/element-library/application/notices";
import { publicContentNoticeSchema } from "@/modules/element-library/domain/content-notices";
import { hasSameOrigin } from "@/modules/saas-billing/application/owner-access";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const MAX_BODY_BYTES = 8 * 1024;
/** Por IP: pocos avisos por hora. */
const IP_LIMIT = { limit: 5, window: 60 * 60 };
/** Por dirección (hash, nunca el correo en claro): pocos al día. */
const ADDRESS_LIMIT = { limit: 3, window: 24 * 60 * 60 };

function noStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

/** Misma respuesta para un aviso nuevo, un reenvío idéntico y el campo trampa. */
function received(): NextResponse {
  return noStore(apiCreated({ received: true }));
}

function tooLarge(): NextResponse {
  return noStore(
    problemResponse({
      status: 413,
      title: "Aviso demasiado largo",
      detail: "Acorta el motivo e inténtalo de nuevo.",
      type: "payload-too-large",
    })
  );
}

// @auth-flexible route-guard-reason: public content notice form (EU Digital Services Act, art. 16; ADR-0029 §8). No session or cookie is read; it only accepts same-origin JSON, rejects bodies over 8 KB, checks the honeypot before parsing, rate-limits by IP and by email hash, validates with a strict schema that requires the good-faith declaration, and stores one internal notice row idempotently by submission hash. It never withdraws content, never sends email and returns no data.
export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return noStore(
      problemResponse({
        status: 403,
        title: "Origen no válido",
        detail: "Envía el aviso desde el formulario de Zaltyko.",
        type: "invalid-origin",
      })
    );
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) return tooLarge();
  const raw = await request.text().catch(() => "");
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return tooLarge();
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    body = null;
  }

  // Campo trampa: un bot que rellena el campo oculto recibe la misma respuesta
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
    identifier: `content-notices:${getClientIdentifier(request)}`,
    ...IP_LIMIT,
  });
  if (!ipLimit.success) return noStore(rateLimitExceededResponse(ipLimit));

  const parsed = publicContentNoticeSchema.safeParse(body);
  if (!parsed.success) {
    return noStore(
      problemResponse({
        status: 400,
        title: "Revisa el formulario",
        detail: parsed.error.issues.some((issue) => issue.path[0] === "goodFaith")
          ? "Marca la declaración de buena fe para enviar el aviso."
          : "Faltan datos o alguno no es válido.",
        type: "invalid-content-notice",
        errors: { fields: [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? "")))] },
      })
    );
  }

  const addressLimit = await rateLimit({
    identifier: getAddressHashRateLimitIdentifier(parsed.data.senderEmail, new URL(request.url).pathname),
    ...ADDRESS_LIMIT,
  });
  if (!addressLimit.success) return noStore(rateLimitExceededResponse(addressLimit));

  try {
    // Un reenvío idéntico no crea otra fila y recibe la misma respuesta.
    await submitContentNotice(parsed.data);
    return received();
  } catch (error) {
    if (error instanceof OperationalError) return noStore(operationalProblem(error));
    // Solo el tipo: un error de PostgreSQL puede llevar el nombre o el correo en su detalle.
    logger.error("Error inesperado guardando un aviso de contenido", undefined, {
      name: error instanceof Error ? error.name : "unknown",
    });
    return noStore(
      problemResponse({
        status: 500,
        title: "No se pudo enviar el aviso",
        detail: "Algo ha fallado por nuestra parte. Inténtalo de nuevo en unos minutos.",
        type: "internal-error",
      })
    );
  }
}
