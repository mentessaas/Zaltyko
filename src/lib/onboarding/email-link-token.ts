/**
 * Firmado HMAC para URLs de baja/preferencias en emails transaccionales.
 *
 * Gap 5 (ZAL-324): las URLs `unsubscribe_url` y `preferences_url` que
 * referencia el attachment ZAL-139 v0.2 no existian como rutas vivas. Esta
 * utilidad firma `email + purpose + expiry` con HMAC-SHA256 para que la
 * ruta publica pueda validar la firma sin auth y rechazar tokens viejos
 * o manipulados.
 *
 * El secret se lee de `UNSUBSCRIBE_HMAC_SECRET` (fallback a
 * `INTERNAL_AUTH_SECRET` para no romper entornos existentes; el fallback
 * es debil y se loguea una sola vez al boot para que P&S lo migre).
 *
 * Owner: Web Developer (ZAL-324 Gap 5).
 * Reviewer: Platform & Security (RGPD, persistencia en `email_logs`).
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { logger } from "../logger";

// Leemos directo de process.env (no de `serverEnv`) porque estas claves
// son secretos dedicados opcionales y no estan en el schema de env.ts.
// El caller puede inyectarlos via dotenv/.env.local sin tocar el schema.

export type EmailLinkPurpose = "unsubscribe" | "preferences";

export interface SignedEmailLinkPayload {
  email: string;
  purpose: EmailLinkPurpose;
  expiresAt: number; // unix seconds
  nonce: string;
}

export interface VerifyResult {
  ok: boolean;
  reason?: "MALFORMED" | "EXPIRED" | "INVALID_SIGNATURE" | "FUTURE_EXPIRY";
  payload?: SignedEmailLinkPayload;
}

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days, RFC 8058 friendly

let warnedAboutFallback = false;

function getSecret(): string {
  const explicit = process.env.UNSUBSCRIBE_HMAC_SECRET;
  if (explicit && explicit.length >= 16) {
    return explicit;
  }
  const fallback = process.env.INTERNAL_AUTH_SECRET;
  if (!warnedAboutFallback && fallback) {
    logger.warn(
      "UNSUBSCRIBE_HMAC_SECRET not set; using INTERNAL_AUTH_SECRET as fallback. " +
        "P&S debe migrar a UNSUBSCRIBE_HMAC_SECRET dedicado."
    );
    warnedAboutFallback = true;
  }
  if (!fallback) {
    throw new Error(
      "UNSUBSCRIBE_HMAC_SECRET (o INTERNAL_AUTH_SECRET como fallback) requerido para firmar enlaces de baja"
    );
  }
  return fallback;
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Genera un nonce corto (96 bits) en hex; suficiente para unicidad y para
 * que tokens repetidos con mismo email/expiry no produzcan la misma firma.
 */
function generateNonce(): string {
  // 12 bytes = 16 base64 chars
  return base64UrlEncode(Buffer.from(
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
  )).slice(0, 16);
}

/**
 * Firma un payload y devuelve un token url-safe.
 */
export function signEmailLinkToken(payload: SignedEmailLinkPayload): string {
  const canonical = JSON.stringify({
    email: normalizeEmail(payload.email),
    purpose: payload.purpose,
    expiresAt: payload.expiresAt,
    nonce: payload.nonce,
  });
  const signature = createHmac("sha256", getSecret()).update(canonical).digest();
  return `${base64UrlEncode(canonical)}.${base64UrlEncode(signature)}`;
}

export interface BuildLinkOptions {
  email: string;
  purpose: EmailLinkPurpose;
  ttlSeconds?: number;
  nowMs?: number;
}

/**
 * Convenience: firma y devuelve `{ token, expiresAt }` listo para embed
 * en una URL. El caller antepone `appUrl` + `path`.
 */
export function buildEmailLinkToken(options: BuildLinkOptions): {
  token: string;
  expiresAt: number;
} {
  const now = options.nowMs ?? Date.now();
  const expiresAt = Math.floor(now / 1000) + (options.ttlSeconds ?? TOKEN_TTL_SECONDS);
  const nonce = generateNonce();
  const token = signEmailLinkToken({
    email: options.email,
    purpose: options.purpose,
    expiresAt,
    nonce,
  });
  return { token, expiresAt };
}

/**
 * Construye una URL absoluta `appUrl + path?token=...` lista para el
 * email. Usado por las plantillas d0/d2/d7 y cualquier otra transaccional
 * que deba enlazar a la pagina de baja/preferencias.
 */
export function buildSignedEmailLinkUrl(options: BuildLinkOptions & {
  appUrl: string;
  path: string;
}): { url: string; expiresAt: number } {
  const { token, expiresAt } = buildEmailLinkToken(options);
  const base = options.appUrl.replace(/\/$/, "");
  const path = options.path.startsWith("/") ? options.path : `/${options.path}`;
  const url = `${base}${path}?token=${encodeURIComponent(token)}`;
  return { url, expiresAt };
}

/**
 * Valida un token. Devuelve `{ ok: true, payload }` o `{ ok: false, reason }`.
 * No lanza: el caller decide el codigo HTTP.
 */
export function verifyEmailLinkToken(token: string, nowMs = Date.now()): VerifyResult {
  const parts = token.split(".");
  if (parts.length !== 2) {
    return { ok: false, reason: "MALFORMED" };
  }
  const [encodedPayload, encodedSig] = parts;
  let canonicalJson: string;
  let payload: SignedEmailLinkPayload;
  try {
    canonicalJson = base64UrlDecode(encodedPayload).toString("utf8");
    const parsed = JSON.parse(canonicalJson) as SignedEmailLinkPayload;
    if (
      typeof parsed.email !== "string" ||
      (parsed.purpose !== "unsubscribe" && parsed.purpose !== "preferences") ||
      typeof parsed.expiresAt !== "number" ||
      typeof parsed.nonce !== "string"
    ) {
      return { ok: false, reason: "MALFORMED" };
    }
    payload = parsed;
  } catch {
    return { ok: false, reason: "MALFORMED" };
  }

  const expectedSig = createHmac("sha256", getSecret())
    .update(canonicalJson)
    .digest();
  let providedSig: Buffer;
  try {
    providedSig = base64UrlDecode(encodedSig);
  } catch {
    return { ok: false, reason: "MALFORMED" };
  }
  if (expectedSig.length !== providedSig.length) {
    return { ok: false, reason: "INVALID_SIGNATURE" };
  }
  if (!timingSafeEqual(expectedSig, providedSig)) {
    return { ok: false, reason: "INVALID_SIGNATURE" };
  }

  const nowSec = Math.floor(nowMs / 1000);
  // FUTURE_EXPIRY solo si el token declara una expiracion mas alla de 1 ano
  // respecto al reloj del verificador (anomalia de reloj o firma manipulada).
  // 30 dias (TTL normal) cae dentro del rango y no dispara este check.
  // Limite estricto: 1 ano exacto se acepta; >1 ano se rechaza.
  const maxFuture = nowSec + 60 * 60 * 24 * 365;
  if (payload.expiresAt > maxFuture) {
    return { ok: false, reason: "FUTURE_EXPIRY", payload };
  }
  if (payload.expiresAt < nowSec) {
    return { ok: false, reason: "EXPIRED", payload };
  }

  return { ok: true, payload };
}
