import { sql } from "drizzle-orm";

import { db } from "@/db";
import { buildEmailLinkToken } from "@/lib/onboarding/email-link-token";
import { logger } from "@/lib/logger";

/**
 * Preferencias de los avisos de uso habitual: una por tipo de aviso y dirección
 * de correo, activada por defecto. Se desactivan con un clic desde el enlace
 * firmado de cada correo; no hace falta iniciar sesión. Se guardan igual que la
 * baja y las preferencias ya existentes (`email_logs`), sin tabla nueva: el último
 * registro de la dirección y el tipo manda.
 */
export const HABITUAL_USE_PREFERENCE_KINDS = ["coach_session_reminders", "owner_weekly_digest"] as const;
export type HabitualUsePreferenceKind = (typeof HABITUAL_USE_PREFERENCE_KINDS)[number];

export const HABITUAL_USE_PREFERENCE_TEMPLATE = "habitual_use_preference";
export const HABITUAL_USE_PREFERENCES_PATH = "/api/habitual-use/preferences";

export const HABITUAL_USE_PREFERENCE_LABELS: Record<HabitualUsePreferenceKind, string> = {
  coach_session_reminders: "los avisos de tus clases (antes de empezar y cuando falta la lista)",
  owner_weekly_digest: "el resumen semanal de tu academia",
};

export function isHabitualUsePreferenceKind(value: unknown): value is HabitualUsePreferenceKind {
  return typeof value === "string" && (HABITUAL_USE_PREFERENCE_KINDS as readonly string[]).includes(value);
}

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

/** `true` si la persona no ha desactivado este tipo de aviso. */
export async function isHabitualUseEnabledFor(
  email: string,
  kind: HabitualUsePreferenceKind
): Promise<boolean> {
  const result = await db.execute(sql`
    select metadata ->> 'enabled' as enabled
    from public.email_logs
    where lower(to_email) = ${normalize(email)}
      and template = ${HABITUAL_USE_PREFERENCE_TEMPLATE}
      and metadata ->> 'kind' = ${kind}
    order by created_at desc
    limit 1
  `);
  const row = result.rows[0] as { enabled?: string | null } | undefined;
  return row?.enabled !== "false";
}

export async function setHabitualUsePreference(
  email: string,
  kind: HabitualUsePreferenceKind,
  enabled: boolean
): Promise<void> {
  // SQL directo: el código canónico no importa el esquema legacy. Es la misma
  // forma de fila que escribe /api/preferences (template + status «sent»).
  const metadata = JSON.stringify({ kind, enabled, updatedAt: new Date().toISOString() });
  await db.execute(sql`
    insert into public.email_logs (to_email, subject, template, status, sent_at, metadata)
    values (
      ${normalize(email)}, 'Preferencia de avisos actualizada', ${HABITUAL_USE_PREFERENCE_TEMPLATE},
      'sent', now(), ${metadata}::jsonb
    )
  `);
}

/**
 * Enlace firmado para gestionar un tipo de aviso desde el correo. Devuelve `null`
 * si no se puede firmar (falta el secreto): quien envía no manda el aviso sin él.
 */
export function buildHabitualUsePreferencesUrl(
  appUrl: string,
  email: string,
  kind: HabitualUsePreferenceKind
): string | null {
  try {
    const { token } = buildEmailLinkToken({ email: normalize(email), purpose: "preferences" });
    const params = new URLSearchParams({ kind, token });
    return `${appUrl.replace(/\/+$/, "")}${HABITUAL_USE_PREFERENCES_PATH}?${params.toString()}`;
  } catch (error) {
    logger.error("habitual_use.preferences_link_failed", error);
    return null;
  }
}
