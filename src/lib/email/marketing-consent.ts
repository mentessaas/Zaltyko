import { desc, sql } from "drizzle-orm";

import { db } from "@/db";
import { emailLogs } from "@/db/schema";

/**
 * Verifica si un email ha optado por no recibir marketing.
 * Consulta el último registro de preferencias o baja.
 * RGPD Art. 6(1)(a): sin consentimiento, no se envían comerciales.
 */
export async function hasMarketingOptOut(email: string): Promise<boolean> {
  const normalizedEmail = email.toLowerCase().trim();
  const recentLogs = await db
    .select({ template: emailLogs.template, metadata: emailLogs.metadata, status: emailLogs.status })
    .from(emailLogs)
    .where(sql`lower(${emailLogs.toEmail}) = ${normalizedEmail}`)
    .orderBy(desc(emailLogs.createdAt))
    .limit(10);

  for (const log of recentLogs) {
    if (log.template === "unsubscribe_confirmation" && log.status === "sent") {
      return true;
    }
    if (log.template === "preferences_update") {
      const prefs = (log.metadata as Record<string, unknown> | null)?.prefs as
        | { marketing?: boolean }
        | undefined;
      if (prefs && prefs.marketing === false) return true;
      if (prefs && prefs.marketing === true) return false;
    }
  }

  return false;
}

export async function getEmailMarketingPreference(email: string): Promise<boolean> {
  const normalizedEmail = email.toLowerCase().trim();
  const recentLogs = await db
    .select({ template: emailLogs.template, metadata: emailLogs.metadata, status: emailLogs.status })
    .from(emailLogs)
    .where(sql`lower(${emailLogs.toEmail}) = ${normalizedEmail}`)
    .orderBy(desc(emailLogs.createdAt))
    .limit(20);
  for (const log of recentLogs) {
    if (log.template === "unsubscribe_confirmation" && log.status === "sent") return false;
    if (log.template === "preferences_update") {
      const marketing = (log.metadata as Record<string, unknown> | null)?.prefs as { marketing?: unknown } | undefined;
      if (typeof marketing?.marketing === "boolean") return marketing.marketing;
    }
  }
  return false;
}
