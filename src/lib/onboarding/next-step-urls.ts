/**
 * Allowlist de URLs para CTAs en la secuencia de onboarding (d0/d2/d7).
 *
 * Cada `next_step_key` resuelto en el email debe mapear a una URL dentro de
 * este set. Si la clave no aparece aqui, el caller DEBE lanzar (no caer a
 * una URL por defecto que pueda abrir un XSS/SSRF o romper el contrato §7
 * del attachment ZAL-139 v0.2).
 *
 * Las claves se derivan de `CHECKLIST_KEYS` y `WIZARD_STEP_KEYS` mas dos
 * aliases de comunicacion que el attachment referencia explicitamente:
 *   - "billing_setup"        -> siguiente paso cuando el dueo habilita cobros
 *   - "first_communication"  -> siguiente paso cuando envia su primer mensaje
 *
 * Owner: Web Developer (ZAL-324 Gap 2).
 * Reviewer: Platform & Security (compliance, allowlist).
 */

import {
  CHECKLIST_KEYS,
  WIZARD_STEP_KEYS,
  type ChecklistKey,
  type WizardStepKey,
} from "../onboarding-utils";

export type NextStepKey =
  | ChecklistKey
  | WizardStepKey
  | "billing_setup"
  | "first_communication"
  | "academy_overview"
  | "support"
  | "unsubscribe"
  | "preferences";

/**
 * Mapa inmutable `next_step_key -> path relativo`. Las plantillas deben
 * prefijar con `NEXT_PUBLIC_APP_URL` en tiempo de render. Mantener SOLO
 * paths internos (mismo origen que Zaltyko); URLs externas requieren
 * revision explicita de P&S y no entran aqui en v0.2.
 */
export const NEXT_STEP_URLS: Readonly<Record<NextStepKey, string>> = Object.freeze({
  // Wizard steps (post-signup flow)
  academy: "/onboarding/academy",
  athletes: "/onboarding/athletes",
  "payments-team": "/onboarding/payments-team",
  brand: "/onboarding/brand",
  activation: "/onboarding/activation",

  // Checklist items (next incomplete item)
  add_5_athletes: "/app/athletes/new",
  create_first_group: "/app/groups/new",
  setup_weekly_schedule: "/app/classes/new",
  invite_first_coach: "/app/coaches/invite",
  enable_payments: "/app/settings/billing",
  send_first_communication: "/app/communications/new",
  login_again: "/auth/sign-in",

  // Communication aliases referenced by the attachment
  billing_setup: "/app/settings/billing",
  first_communication: "/app/communications/new",

  // Generic destinations
  academy_overview: "/app",
  support: "/contact",

  // Compliance footer (RGPD, ver ZAL-313)
  unsubscribe: "/unsubscribe",
  preferences: "/preferences",
});

export function isNextStepKey(value: string): value is NextStepKey {
  return Object.prototype.hasOwnProperty.call(NEXT_STEP_URLS, value);
}

/**
 * Resuelve una `next_step_key` a una URL absoluta lista para el email.
 * Lanza si la clave no esta en el allowlist; el caller debe tratar eso como
 * bug de integracion, no caer a una URL por defecto.
 *
 * @param key         clave declarada en la plantilla (ej. "enable_payments")
 * @param appUrl      origen (normalmente `process.env.NEXT_PUBLIC_APP_URL`)
 * @param queryParams parametros opcionales que se agregan a la URL
 */
export function resolveNextStepUrl(
  key: string,
  appUrl: string,
  queryParams?: Record<string, string>
): string {
  if (!isNextStepKey(key)) {
    throw new Error(
      `next_step_key no esta en el allowlist: ${JSON.stringify(key)}. ` +
        `Claves validas: ${Object.keys(NEXT_STEP_URLS).join(", ")}`
    );
  }
  const path = NEXT_STEP_URLS[key];
  const base = appUrl.replace(/\/$/, "");
  const url = `${base}${path}`;
  if (!queryParams || Object.keys(queryParams).length === 0) {
    return url;
  }
  const search = new URLSearchParams(queryParams);
  return `${url}?${search.toString()}`;
}

/**
 * Lista las claves validas; util para validacion Zod y para que el attachment
 * ZAL-139 pueda cross-checkear que su `next_step_key` declarado esta dentro
 * del contrato.
 */
export function listValidNextStepKeys(): NextStepKey[] {
  return Object.keys(NEXT_STEP_URLS) as NextStepKey[];
}

/**
 * Cobertura: union declarada en el attachment vs union implementada. Si
 * cambia alguno de los dos lados, esta funcion permite detectar drift en
 * el PR review.
 */
export const NEXT_STEP_COVERAGE = Object.freeze({
  checklistKeys: CHECKLIST_KEYS,
  wizardStepKeys: WIZARD_STEP_KEYS,
} as const);
