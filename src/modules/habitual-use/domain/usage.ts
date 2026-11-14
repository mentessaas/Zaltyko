import { createHash, createHmac } from "node:crypto";

import { escapeHtml } from "@/lib/email/escape-html";

/**
 * Medición del uso (docs/producto/uso-habitual.md).
 *
 * Los eventos son contadores por academia, tipo de evento, rol y día. NO llevan
 * identificador de persona, de gimnasta ni de menor. La única excepción es la
 * referencia de familia del portal: un seudónimo HMAC con secreto propio que rota
 * cada semana, para contar familias distintas sin poder seguirlas de una semana a
 * otra (es un seudónimo, no un dato anónimo).
 */

export const USAGE_EVENT_NAMES = ["staff_visit", "family_portal_view"] as const;
export type UsageEventName = (typeof USAGE_EVENT_NAMES)[number];

export const USAGE_ACTOR_ROLES = ["owner", "manager", "admin", "coach", "family"] as const;
export type UsageActorRole = (typeof USAGE_ACTOR_ROLES)[number];

export function isUsageEventName(value: unknown): value is UsageEventName {
  return typeof value === "string" && (USAGE_EVENT_NAMES as readonly string[]).includes(value);
}

export function isUsageActorRole(value: unknown): value is UsageActorRole {
  return typeof value === "string" && (USAGE_ACTOR_ROLES as readonly string[]).includes(value);
}

/** Una academia sin actividad de su equipo durante este tiempo está en riesgo. */
export const AT_RISK_INACTIVE_DAYS = 7;
/** Una academia recién creada no se marca en riesgo antes de este tiempo. */
export const AT_RISK_MIN_AGE_DAYS = 7;

/** Secreto propio del seudónimo de familias. No se reutiliza el de los enlaces de baja. */
export const USAGE_PSEUDONYM_SECRET_VARIABLE = "ZALTYKO_USAGE_PSEUDONYM_SECRET";

/**
 * Seudónimo de una familia para una semana concreta: 16 hex de un HMAC-SHA256 con
 * un secreto propio sobre «cuenta|semana». Es un SEUDÓNIMO, no un dato anónimo:
 * quien tenga el secreto puede recalcularlo para una cuenta conocida. Sirve para
 * contar cuentas distintas en una semana; sin el secreto no se puede reconocer a
 * nadie, y al rotar cada semana no se puede seguir a una familia de una a otra.
 * Sin secreto no se registra nada (devuelve null).
 */
export function familyWeekPseudonym(input: {
  userId: string;
  weekKey: string;
  secret: string | null | undefined;
}): string | null {
  const secret = input.secret?.trim();
  if (!secret || secret.length < 16) return null;
  return createHmac("sha256", secret).update(`${input.userId}|${input.weekKey}`).digest("hex").slice(0, 16);
}

export interface AcademyActivitySnapshot {
  organizationId: string;
  name: string;
  status: "trial" | "active" | "suspended" | "closed";
  countryCode: string;
  createdAt: Date;
  /** Última actividad del equipo (lista pasada o visita), o null si nunca la hubo. */
  lastActivityAt: Date | null;
}

export interface AtRiskAcademy extends AcademyActivitySnapshot {
  /** Días sin actividad; `null` si nunca la hubo. */
  inactiveDays: number | null;
  /** Clave estable de este episodio de inactividad (no cambia mientras siga igual). */
  alertKey: string;
}

const DAY = 86_400_000;

/** Academias activas o en prueba, con edad suficiente y sin actividad reciente. */
export function selectAtRiskAcademies(
  academies: readonly AcademyActivitySnapshot[],
  now: Date
): AtRiskAcademy[] {
  const result: AtRiskAcademy[] = [];
  for (const academy of academies) {
    if (academy.status !== "active" && academy.status !== "trial") continue;
    if (now.getTime() - academy.createdAt.getTime() < AT_RISK_MIN_AGE_DAYS * DAY) continue;
    const last = academy.lastActivityAt;
    const inactiveDays = last ? Math.floor((now.getTime() - last.getTime()) / DAY) : null;
    if (last && inactiveDays !== null && inactiveDays < AT_RISK_INACTIVE_DAYS) continue;
    result.push({
      ...academy,
      inactiveDays,
      alertKey: `${academy.organizationId}:${last ? last.toISOString().slice(0, 10) : "never"}`,
    });
  }
  // Primero las que nunca arrancaron, luego las más tiempo paradas.
  return result.sort((left, right) => {
    const l = left.inactiveDays ?? Number.MAX_SAFE_INTEGER;
    const r = right.inactiveDays ?? Number.MAX_SAFE_INTEGER;
    return r - l || left.name.localeCompare(right.name, "es");
  });
}

/** Solo las academias cuyo episodio de inactividad aún no se avisó. */
export function newlyAtRisk(
  atRisk: readonly AtRiskAcademy[],
  alreadyAlertedKeys: ReadonlySet<string>
): AtRiskAcademy[] {
  return atRisk.filter((academy) => !alreadyAlertedKeys.has(academy.alertKey));
}

export function atRiskAlertDedupeKey(alertKeys: readonly string[]): string {
  const digest = createHash("sha256").update([...alertKeys].sort().join("|")).digest("hex");
  return `usage-at-risk:${digest.slice(0, 24)}`;
}

export interface AtRiskAlertMessage {
  subject: string;
  text: string;
  html: string;
}

const dateLabel = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeZone: "Europe/Madrid" });

function describeInactivity(academy: AtRiskAcademy): string {
  if (!academy.lastActivityAt) return "sin actividad registrada (ni lista pasada ni visitas del equipo)";
  return `${academy.inactiveDays} días sin actividad (última: ${dateLabel.format(academy.lastActivityAt)})`;
}

/** Aviso a Elvis: solo las academias nuevas en riesgo, con enlace a la vista. */
export function buildAtRiskAlertMessage(input: {
  newlyAtRisk: readonly AtRiskAcademy[];
  stillAtRiskCount: number;
  viewUrl: string;
}): AtRiskAlertMessage | null {
  if (input.newlyAtRisk.length === 0) return null;
  const count = input.newlyAtRisk.length;
  const subject = `${count === 1 ? "1 academia en riesgo" : `${count} academias en riesgo`}: sin actividad en ${AT_RISK_INACTIVE_DAYS} días`;
  const lines = input.newlyAtRisk.map(
    (academy) => `• ${academy.name} (${academy.countryCode}, ${academy.status === "trial" ? "en prueba" : "activa"}): ${describeInactivity(academy)}`
  );
  const others =
    input.stillAtRiskCount > count
      ? `\n\nOtras ${input.stillAtRiskCount - count} siguen en riesgo desde avisos anteriores.`
      : "";
  const text = `Estas academias llevan ${AT_RISK_INACTIVE_DAYS} días o más sin actividad del equipo:\n\n${lines.join("\n")}${others}\n\nVer el detalle: ${input.viewUrl}`;
  const htmlItems = input.newlyAtRisk
    .map(
      (academy) =>
        `<li style="margin:0 0 8px;"><strong>${escapeHtml(academy.name)}</strong> (${escapeHtml(academy.countryCode)}, ${academy.status === "trial" ? "en prueba" : "activa"}): ${escapeHtml(describeInactivity(academy))}</li>`
    )
    .join("");
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1c2430;">
<p style="margin:0 0 12px;font-size:16px;">Estas academias llevan ${AT_RISK_INACTIVE_DAYS} días o más sin actividad del equipo:</p>
<ul style="margin:0 0 16px;padding-left:20px;font-size:14px;line-height:1.5;">${htmlItems}</ul>
${others ? `<p style="margin:0 0 16px;font-size:14px;color:#4a5260;">${escapeHtml(others.trim())}</p>` : ""}
<p style="margin:0;"><a href="${escapeHtml(input.viewUrl)}" style="display:inline-block;background:#1f3a5f;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;">Ver uso por academia</a></p>
</div>`;
  return { subject, text, html };
}
