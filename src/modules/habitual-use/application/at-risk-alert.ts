import { sql } from "drizzle-orm";

import { db } from "@/db";
import { sendEmailWithLogging } from "@/lib/email/email-service";
import { getAppUrl } from "@/lib/env";
import { logger } from "@/lib/logger";

import { getAtRiskAlertRecipient, isAtRiskAlertsEnabled } from "../domain/flags";
import {
  atRiskAlertDedupeKey,
  buildAtRiskAlertMessage,
  newlyAtRisk,
  type AtRiskAcademy,
} from "../domain/usage";
import { isUsageStorageAvailable } from "./storage";
import { loadAtRiskAcademies } from "./usage-metrics";

export const AT_RISK_ALERT_TEMPLATE = "usage-at-risk-alert";
export const AT_RISK_SUPER_ADMIN_PATH = "/super-admin/uso";
/** Los episodios ya avisados se recuerdan este tiempo. */
const ALERT_MEMORY_DAYS = 120;

/** Claves de episodios ya avisados, leídas de los correos enviados. */
async function loadAlertedKeys(): Promise<Set<string>> {
  const result = await db.execute(sql`
    select distinct jsonb_array_elements_text(metadata -> 'alertedKeys') as alert_key
    from public.email_logs
    where template = ${AT_RISK_ALERT_TEMPLATE}
      and status = 'sent'
      and created_at > now() - make_interval(days => ${ALERT_MEMORY_DAYS})
      and jsonb_typeof(metadata -> 'alertedKeys') = 'array'
    limit 5000
  `);
  return new Set((result.rows as unknown as Array<{ alert_key: string }>).map((row) => row.alert_key));
}

export interface AtRiskAlertSummary {
  enabled: boolean;
  /** Sin destinatario configurado no se envía nada. */
  recipientConfigured: boolean;
  atRisk: number;
  newlyAtRisk: number;
  sent: boolean;
}

/**
 * Un disparo del cron (diario): avisa a Elvis solo de las academias que acaban de
 * entrar en riesgo, una vez por episodio de inactividad. Sin novedades, no hay
 * correo. Con la bandera apagada o sin destinatario no toca la base de datos.
 */
export async function runAtRiskAlert(
  options: {
    now?: Date;
    appUrl?: string;
    loadAtRisk?: (now: Date) => Promise<{ atRisk: AtRiskAcademy[] }>;
    loadAlertedKeys?: () => Promise<Set<string>>;
  } = {}
): Promise<AtRiskAlertSummary> {
  const summary: AtRiskAlertSummary = {
    enabled: false,
    recipientConfigured: false,
    atRisk: 0,
    newlyAtRisk: 0,
    sent: false,
  };
  if (!isAtRiskAlertsEnabled()) return summary;
  summary.enabled = true;
  const recipient = getAtRiskAlertRecipient();
  if (!recipient) return summary;
  summary.recipientConfigured = true;

  if (!options.loadAtRisk && !(await isUsageStorageAvailable(db))) {
    logger.warn("habitual_use.at_risk_storage_missing");
    return summary;
  }
  const now = options.now ?? new Date();
  const { atRisk } = await (options.loadAtRisk ?? ((at) => loadAtRiskAcademies(db, at)))(now);
  summary.atRisk = atRisk.length;
  const fresh = newlyAtRisk(atRisk, await (options.loadAlertedKeys ?? loadAlertedKeys)());
  summary.newlyAtRisk = fresh.length;

  const appUrl = options.appUrl ?? getAppUrl();
  const message = buildAtRiskAlertMessage({
    newlyAtRisk: fresh,
    stillAtRiskCount: atRisk.length,
    viewUrl: `${appUrl.replace(/\/+$/, "")}${AT_RISK_SUPER_ADMIN_PATH}`,
  });
  // Sin novedades no se escribe a nadie.
  if (!message) return summary;

  const alertKeys = fresh.map((academy) => academy.alertKey);
  summary.sent = await sendEmailWithLogging({
    purpose: "transactional",
    to: recipient,
    subject: message.subject,
    html: message.html,
    text: message.text,
    template: AT_RISK_ALERT_TEMPLATE,
    // Los avisos de este tipo son para quien administra Zaltyko, no para la academia.
    metadata: { kind: "usage_at_risk", alertedKeys: alertKeys, count: alertKeys.length },
    dedupeKey: atRiskAlertDedupeKey(alertKeys),
  });
  return summary;
}
