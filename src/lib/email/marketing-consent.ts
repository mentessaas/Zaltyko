import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { emailLogs } from "@/db/schema";

/**
 * Verifica si un email ha optado por no recibir marketing.
 * Consulta el último registro de preferencias o baja.
 * RGPD Art. 6(1)(a): sin consentimiento, no se envían comerciales.
 */
export async function hasMarketingOptOut(email: string): Promise<boolean> {
  const normalizedEmail = email.toLowerCase().trim();
  const [row] = await db
    .select({ id: emailLogs.id, template: emailLogs.template, metadata: emailLogs.metadata })
    .from(emailLogs)
    .where(eq(emailLogs.toEmail, normalizedEmail))
    .orderBy(desc(emailLogs.createdAt))
    .limit(10);

  if (!row) return false;

  // Revisar los últimos 10 registros para encontrar el estado más reciente
  const recentLogs = await db
    .select({ template: emailLogs.template, metadata: emailLogs.metadata, status: emailLogs.status })
    .from(emailLogs)
    .where(eq(emailLogs.toEmail, normalizedEmail))
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
