/**
 * Allowlist de URLs para el integrador d0/d2/d7 owner (ZAL-314 B5).
 *
 * Reglas (de §7 de la spec ZAL-139-onboarding-owner-v0.2):
 * - Solo URLs HTTPS absolutas.
 * - Solo hosts en la allowlist de dominios Zaltyko (configurable por env).
 * - Solo `next_step_key` validos de §3 (los 7 de CHECKLIST_KEYS + sentinel `done`).
 * - `done` → return null (no hay CTA siguiente paso).
 *
 * El helper `buildNextStepUrl` es la unica via para construir URLs hacia
 * Zaltyko desde el integrador d0/d2/d7; cualquier ruta construida fuera de
 * aqui no debe usarse en emails transaccionales de onboarding.
 */

import { config } from "@/config";
import type { ChecklistKey } from "@/lib/onboarding-utils";

export const ONBOARDING_OWNER_STEP_KEYS: readonly ChecklistKey[] = [
  "add_5_athletes",
  "create_first_group",
  "setup_weekly_schedule",
  "invite_first_coach",
  "enable_payments",
  "send_first_communication",
  "login_again",
] as const;

export const ONBOARDING_OWNER_DONE_KEY = "done" as const;

export type OnboardingOwnerStepKey = ChecklistKey | typeof ONBOARDING_OWNER_DONE_KEY;

/**
 * Mapea un `next_step_key` de onboarding-owner a su path interno Zaltyko.
 * Solo se permiten los 7 de CHECKLIST_KEYS + sentinel `done`.
 * Cualquier valor fuera de la allowlist devuelve null y el integrador
 * aborta el envio (§6 gate).
 */
export function getOnboardingOwnerStepPath(stepKey: string): string | null {
  if (stepKey === ONBOARDING_OWNER_DONE_KEY) {
    return null;
  }
  if ((ONBOARDING_OWNER_STEP_KEYS as readonly string[]).includes(stepKey)) {
    return `/app/onboarding/${stepKey}`;
  }
  return null;
}

/**
 * Hosts permitidos para URLs en emails de onboarding-owner.
 *
 * Diseno:
 * - Base inmutable: `config.domainName` (zaltyko.com). Siempre permitido.
 * - `NEXT_PUBLIC_APP_URL`: SI es HTTPS y su host NO esta ya en el set base,
 *   se annade al allowlist (ej. `app.zaltyko.com`, `staging.zaltyko.com`).
 *   Hosts maliciosos (ej. `evil.example.com`) NO se annaden aunque esten
 *   en env: defense-in-depth.
 * - `ZALTYKO_EMAIL_DOMAIN`: idem, solo se annade si su host termina en
 *   `zaltyko.com`.
 *
 * Lee `process.env` dinamicamente para que tests y runtime cambien el valor
 * sin re-cargar el modulo.
 */
function isZaltykoHost(host: string): boolean {
  return host === "zaltyko.com" || host.endsWith(".zaltyko.com");
}

function getAllowlistedHosts(): string[] {
  const hosts = new Set<string>();

  // Dominio Zaltyko canonico (produccion) — siempre permitido.
  hosts.add("zaltyko.com");

  // domainName de config (fallback Zaltyko).
  try {
    const parsed = new URL(config.domainName);
    hosts.add(parsed.host);
  } catch {
    // ignore
  }

  // App URL configurable (canonical). Solo si el host es Zaltyko.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? config.appUrl;
  if (appUrl) {
    try {
      const parsed = new URL(appUrl);
      if (isZaltykoHost(parsed.host)) {
        hosts.add(parsed.host);
      }
    } catch {
      // ignore: appUrl no es una URL valida
    }
  }

  // Email domain Zaltyko. Solo si es Zaltyko.
  const emailDomain = process.env.ZALTYKO_EMAIL_DOMAIN;
  if (emailDomain && isZaltykoHost(emailDomain)) {
    hosts.add(emailDomain);
  }

  return Array.from(hosts);
}

function isHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function getBaseUrl(): string {
  // En emails transaccionales siempre HTTPS. Solo aceptamos appUrl si su
  // host es Zaltyko (defense-in-depth). Si no, caemos al domainName de
  // config (zaltyko.com).
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? config.appUrl;
  if (appUrl && isHttpsUrl(appUrl)) {
    try {
      const parsed = new URL(appUrl);
      if (isZaltykoHost(parsed.host)) {
        return appUrl.replace(/\/$/, "");
      }
    } catch {
      // ignore
    }
  }
  return config.domainName.replace(/\/$/, "");
}

export interface BuildNextStepUrlInput {
  stepKey: string;
  academyId: string;
}

export interface BuildNextStepUrlResult {
  ok: boolean;
  url: string | null;
  reason?: "INVALID_STEP_KEY" | "INVALID_ACADEMY_ID" | "HTTPS_REQUIRED" | "HOST_NOT_ALLOWED";
}

/**
 * Construye una URL HTTPS absoluta para un `next_step_key` del onboarding-owner.
 * Devuelve `{ ok: false, reason }` ante cualquier input invalido. Solo retorna
 * URL cuando el `stepKey` esta en la allowlist y el host calculado esta
 * en la allowlist de dominios Zaltyko.
 *
 * Sentinel `done` → `{ ok: true, url: null }` (no hay CTA siguiente paso).
 */
export function buildNextStepUrl({
  stepKey,
  academyId,
}: BuildNextStepUrlInput): BuildNextStepUrlResult {
  if (typeof academyId !== "string" || !academyId.trim()) {
    return { ok: false, url: null, reason: "INVALID_ACADEMY_ID" };
  }

  const path = getOnboardingOwnerStepPath(stepKey);
  if (path === null && stepKey !== ONBOARDING_OWNER_DONE_KEY) {
    return { ok: false, url: null, reason: "INVALID_STEP_KEY" };
  }

  if (stepKey === ONBOARDING_OWNER_DONE_KEY) {
    return { ok: true, url: null };
  }

  const baseUrl = getBaseUrl();
  if (!isHttpsUrl(baseUrl)) {
    return { ok: false, url: null, reason: "HTTPS_REQUIRED" };
  }

  const candidate = `${baseUrl}${path}?academy=${encodeURIComponent(academyId)}`;
  if (!isHttpsUrl(candidate)) {
    return { ok: false, url: null, reason: "HTTPS_REQUIRED" };
  }

  let host: string;
  try {
    host = new URL(candidate).host;
  } catch {
    return { ok: false, url: null, reason: "HTTPS_REQUIRED" };
  }

  const allowlisted = getAllowlistedHosts();
  if (!allowlisted.includes(host)) {
    return { ok: false, url: null, reason: "HOST_NOT_ALLOWED" };
  }

  return { ok: true, url: candidate };
}

/**
 * Helper de validacion para URLs de Unsubscribe / Preferences (d7, §5 de la spec).
 * Acepta solo URLs HTTPS absolutas en hosts allowlisted.
 */
export function buildHttpsUrlInAllowlist(path: string): string | null {
  if (typeof path !== "string" || !path.trim()) return null;

  const baseUrl = getBaseUrl();
  if (!isHttpsUrl(baseUrl)) return null;

  const safePath = path.startsWith("/") ? path : `/${path}`;
  const candidate = `${baseUrl}${safePath}`;
  if (!isHttpsUrl(candidate)) return null;

  let host: string;
  try {
    host = new URL(candidate).host;
  } catch {
    return null;
  }

  if (!getAllowlistedHosts().includes(host)) return null;
  return candidate;
}
