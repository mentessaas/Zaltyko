import { NextRequest } from "next/server";

import { escapeHtml } from "@/lib/email/escape-html";
import { logger } from "@/lib/logger";
import { verifyEmailLinkToken } from "@/lib/onboarding/email-link-token";
import { RATE_LIMITS, withRateLimit } from "@/lib/rate-limit";
import {
  HABITUAL_USE_PREFERENCE_LABELS,
  HABITUAL_USE_PREFERENCES_PATH,
  isHabitualUseEnabledFor,
  isHabitualUsePreferenceKind,
  setHabitualUsePreference,
  type HabitualUsePreferenceKind,
} from "@/modules/habitual-use/application/preferences";

export const dynamic = "force-dynamic";
// @route-auth public (signed HMAC email token is the authorization primitive)

/**
 * Desactivar o reactivar un aviso de uso habitual con un clic desde el correo.
 *
 * - GET  ?kind=…&token=… → página con el estado actual y un botón. NO cambia
 *   nada: los escáneres de enlaces de los correos abren los GET.
 * - POST (formulario) kind, token, enabled → guarda la preferencia.
 *
 * El token firmado (mismo mecanismo que /api/preferences y /api/unsubscribe) es la
 * autorización: identifica la dirección y caduca a los 30 días. Los mensajes de
 * error no distinguen entre firma, formato y caducidad.
 */

const HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
} as const;

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f4f1ea;color:#1c2430;margin:0;padding:24px}
main{max-width:480px;margin:48px auto;background:#fff;border-radius:12px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
h1{font-size:20px;margin:0 0 12px}p{line-height:1.5;margin:0 0 16px}
button{background:#1f3a5f;color:#fff;border:0;border-radius:8px;padding:12px 20px;font-size:16px;font-weight:600;cursor:pointer}</style>
</head><body><main>${body}</main></body></html>`;
  return new Response(html, { status, headers: HEADERS });
}

function invalidLink(): Response {
  return page(
    "Enlace no válido",
    `<h1>Este enlace ya no es válido</h1><p>Ha caducado o no es correcto. Abre el último correo que te enviamos y pulsa de nuevo el enlace.</p>`,
    400
  );
}

function verify(token: string | null | undefined, kind: string | null | undefined) {
  if (!token || token.length > 512 || !isHabitualUsePreferenceKind(kind)) return null;
  try {
    const result = verifyEmailLinkToken(token);
    if (!result.ok || !result.payload || result.payload.purpose !== "preferences") return null;
    return { email: result.payload.email, kind };
  } catch (error) {
    // Sin secreto de firma configurado no hay forma de validar: se trata como inválido.
    logger.error("habitual_use.preference_token_unverifiable", error);
    return null;
  }
}

function form(token: string, kind: HabitualUsePreferenceKind, enabled: boolean): string {
  const label = HABITUAL_USE_PREFERENCE_LABELS[kind];
  const heading = enabled ? "Recibes estos avisos" : "Has desactivado estos avisos";
  const action = enabled ? "Dejar de recibirlos" : "Volver a activarlos";
  return `<h1>${escapeHtml(heading)}</h1>
<p>Controlas ${escapeHtml(label)}.</p>
<form method="post" action="${HABITUAL_USE_PREFERENCES_PATH}">
<input type="hidden" name="token" value="${escapeHtml(token)}">
<input type="hidden" name="kind" value="${escapeHtml(kind)}">
<input type="hidden" name="enabled" value="${enabled ? "false" : "true"}">
<button type="submit">${escapeHtml(action)}</button>
</form>`;
}

export const GET = withRateLimit(
  async (request: NextRequest) => {
    const params = new URL(request.url).searchParams;
    const token = params.get("token");
    const verified = verify(token, params.get("kind"));
    if (!verified || !token) return invalidLink();
    const enabled = await isHabitualUseEnabledFor(verified.email, verified.kind);
    return page("Tus avisos de Zaltyko", form(token, verified.kind, enabled));
  },
  { limit: RATE_LIMITS.STRICT.limit, window: RATE_LIMITS.STRICT.window }
);

// @auth-flexible route-guard-reason: signed preferences token is the authorization primitive
export const POST = withRateLimit(
  async (request: NextRequest) => {
    let data: FormData;
    try {
      data = await request.formData();
    } catch {
      return invalidLink();
    }
    const token = data.get("token");
    const kind = data.get("kind");
    const enabledValue = data.get("enabled");
    const verified = verify(typeof token === "string" ? token : null, typeof kind === "string" ? kind : null);
    if (!verified || typeof token !== "string" || (enabledValue !== "true" && enabledValue !== "false")) {
      return invalidLink();
    }
    const enabled = enabledValue === "true";
    try {
      await setHabitualUsePreference(verified.email, verified.kind, enabled);
    } catch (error) {
      logger.error("habitual_use.preference_save_failed", error);
      return page(
        "No se pudo guardar",
        `<h1>No hemos podido guardar el cambio</h1><p>Inténtalo de nuevo en unos minutos.</p>`,
        500
      );
    }
    return page("Tus avisos de Zaltyko", form(token, verified.kind, enabled));
  },
  { limit: RATE_LIMITS.STRICT.limit, window: RATE_LIMITS.STRICT.window }
);
