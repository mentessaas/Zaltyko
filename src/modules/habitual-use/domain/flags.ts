/**
 * Banderas del uso habitual (docs/producto/uso-habitual.md).
 *
 * Todas están APAGADAS por defecto y solo valen con el texto exacto «true».
 * `ZALTYKO_HABITUAL_USE_ENABLED` es el interruptor general: con él apagado no
 * se envía ningún aviso, no se registra ningún evento de uso y la vista de
 * super-admin responde «no disponible», sea cual sea el resto. Cada función
 * tiene además su propia bandera, para poder encenderlas una a una en staging.
 */
type Env = Readonly<Record<string, string | undefined>>;

export const HABITUAL_USE_FLAGS = {
  master: "ZALTYKO_HABITUAL_USE_ENABLED",
  coachReminders: "ZALTYKO_COACH_REMINDERS_ENABLED",
  ownerWeeklyDigest: "ZALTYKO_OWNER_WEEKLY_DIGEST_ENABLED",
  usageMetrics: "ZALTYKO_USAGE_METRICS_ENABLED",
  atRiskAlerts: "ZALTYKO_AT_RISK_ALERTS_ENABLED",
} as const;

/** Destinatario del aviso de academias en riesgo. Nunca se escribe en el repositorio. */
export const AT_RISK_ALERT_RECIPIENT_VARIABLE = "ZALTYKO_AT_RISK_ALERT_EMAIL";

function on(env: Env, name: string): boolean {
  return env[name] === "true";
}

export function isHabitualUseEnabled(env: Env = process.env): boolean {
  return on(env, HABITUAL_USE_FLAGS.master);
}

export function isCoachRemindersEnabled(env: Env = process.env): boolean {
  return isHabitualUseEnabled(env) && on(env, HABITUAL_USE_FLAGS.coachReminders);
}

export function isOwnerWeeklyDigestEnabled(env: Env = process.env): boolean {
  return isHabitualUseEnabled(env) && on(env, HABITUAL_USE_FLAGS.ownerWeeklyDigest);
}

/** Registro de eventos de uso y vista de super-admin. */
export function isUsageMetricsEnabled(env: Env = process.env): boolean {
  return isHabitualUseEnabled(env) && on(env, HABITUAL_USE_FLAGS.usageMetrics);
}

/** El aviso a Elvis necesita la medición encendida y un destinatario configurado. */
export function isAtRiskAlertsEnabled(env: Env = process.env): boolean {
  return isUsageMetricsEnabled(env) && on(env, HABITUAL_USE_FLAGS.atRiskAlerts);
}

export function getAtRiskAlertRecipient(env: Env = process.env): string | null {
  const value = env[AT_RISK_ALERT_RECIPIENT_VARIABLE]?.trim().toLowerCase();
  if (!value || value.length > 254) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
}
