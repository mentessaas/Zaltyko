import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { subMonths } from "date-fns";

import { db } from "@/db";
import {
  commercialInterviews,
  emailLogs,
  growthEvents,
  leadInteractions,
  leadTrialOutcomes,
  leadTrials,
  leads,
} from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireCronAuth } from "@/lib/cron-auth";
import { logger } from "@/lib/logger";

const RETENTION_MONTHS = 12;
const BATCH_LIMIT = 250;
const CONTACT_EVENT_NAMES = [
  "contact_started",
  "contact_submit_attempted",
  "contact_submit_failed",
  "contact_submitted",
] as const;

export async function GET(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  const cutoff = subMonths(new Date(), RETENTION_MONTHS);

  try {
    const result = await db.transaction(async (tx) => {
      await tx
        .delete(emailLogs)
        .where(
          and(
            eq(emailLogs.template, "public-contact-lead"),
            sql`${emailLogs.createdAt} < ${cutoff}`
          )
        );

      const expiredLeads = await tx
        .select({ id: leads.id })
        .from(leads)
        .where(
          and(
            isNull(leads.tenantId),
            isNull(leads.academyId),
            sql`${leads.createdAt} < ${cutoff}`,
            sql`not exists (
              select 1 from public.lead_interactions li
              where li.lead_id = ${leads.id} and li.created_at >= ${cutoff}
            )`,
            sql`not exists (
              select 1 from public.lead_trials lt
              where lt.lead_id = ${leads.id} and lt.updated_at >= ${cutoff}
            )`,
            sql`not exists (
              select 1 from public.academy_trials at
              where at.lead_id = ${leads.id} and at.updated_at >= ${cutoff}
            )`,
            sql`not exists (
              select 1 from public.commercial_interviews ci
              where ci.lead_id = ${leads.id} and ci.updated_at >= ${cutoff}
            )`
          )
        )
        .orderBy(asc(leads.createdAt))
        .limit(BATCH_LIMIT);

      if (expiredLeads.length === 0) {
        return { deletedLeads: 0, anonymizedInterviews: 0 };
      }

      const leadIds = expiredLeads.map((lead) => lead.id);
      const interactions = await tx
        .select({ visitorId: leadInteractions.visitorId })
        .from(leadInteractions)
        .where(inArray(leadInteractions.leadId, leadIds));
      const prospectTrials = await tx
        .select({ id: leadTrials.id })
        .from(leadTrials)
        .where(inArray(leadTrials.leadId, leadIds));
      const visitorIds = [
        ...new Set(
          interactions.flatMap((interaction) =>
            interaction.visitorId ? [interaction.visitorId] : []
          )
        ),
      ];

      const anonymized = await tx
        .update(commercialInterviews)
        .set({
          leadId: null,
          academyFingerprint: sql`'anonymous-' || gen_random_uuid()::text`,
          academyName: "Academia anonimizada",
          contactName: null,
          contactEmail: null,
          countryCode: null,
          city: null,
          modality: null,
          currentTools: null,
          biggestPain: null,
          mostValuableFeature: null,
          primaryObjection: null,
          freePlanExpectation: null,
          upgradeTrigger: null,
          notes: null,
          updatedAt: new Date(),
        })
        .where(inArray(commercialInterviews.leadId, leadIds))
        .returning({ id: commercialInterviews.id });

      const prospectTrialIds = prospectTrials.map((trial) => trial.id);
      if (prospectTrialIds.length > 0) {
        await tx
          .update(leadTrialOutcomes)
          .set({ notes: null, metadata: null })
          .where(inArray(leadTrialOutcomes.leadTrialId, prospectTrialIds));
      }

      if (visitorIds.length > 0) {
        await tx
          .delete(growthEvents)
          .where(
            and(
              inArray(growthEvents.visitorId, visitorIds),
              inArray(growthEvents.eventName, [...CONTACT_EVENT_NAMES])
            )
          );
      }

      await tx.delete(leads).where(inArray(leads.id, leadIds));

      return {
        deletedLeads: expiredLeads.length,
        anonymizedInterviews: anonymized.length,
      };
    });

    logger.info("Lead retention completed", {
      ...result,
      cutoffAt: cutoff.toISOString(),
    });

    return apiSuccess({
      ...result,
      retentionMonths: RETENTION_MONTHS,
      cutoffAt: cutoff.toISOString(),
      batchLimit: BATCH_LIMIT,
    });
  } catch (error) {
    logger.error("Lead retention cron failed", error);
    return apiError(
      "LEAD_RETENTION_FAILED",
      "No se pudo ejecutar la conservación de leads",
      500
    );
  }
}
