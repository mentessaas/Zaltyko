import { createHash } from "node:crypto";

import type { CommercialInterviewInput } from "@/lib/growth/contracts";

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function createAcademyFingerprint(input: Pick<CommercialInterviewInput, "academyName" | "countryCode" | "city">) {
  const canonical = [input.academyName, input.countryCode, input.city].map(normalize).join("|");
  return createHash("sha256").update(canonical).digest("hex");
}

export function toCommercialInterviewValues(input: CommercialInterviewInput) {
  return {
    leadId: input.leadId ?? null,
    academyFingerprint: createAcademyFingerprint(input),
    academyName: input.academyName,
    contactName: input.contactName ?? null,
    contactEmail: input.contactEmail?.toLowerCase() ?? null,
    countryCode: input.countryCode ?? null,
    city: input.city ?? null,
    modality: input.modality ?? null,
    athleteCount: input.athleteCount ?? null,
    coachCount: input.coachCount ?? null,
    locationCount: input.locationCount,
    currentTools: input.currentTools ?? null,
    biggestPain: input.biggestPain ?? null,
    mostValuableFeature: input.mostValuableFeature ?? null,
    primaryObjection: input.primaryObjection ?? null,
    easyPriceEurCents:
      input.easyPriceEur === null || input.easyPriceEur === undefined
        ? null
        : Math.round(input.easyPriceEur * 100),
    limitPriceEurCents:
      input.limitPriceEur === null || input.limitPriceEur === undefined
        ? null
        : Math.round(input.limitPriceEur * 100),
    preferredPricingModel: input.preferredPricingModel ?? null,
    freePlanExpectation: input.freePlanExpectation ?? null,
    upgradeTrigger: input.upgradeTrigger ?? null,
    betaInterest: input.betaInterest,
    willingnessToPay: input.willingnessToPay,
    status: input.status,
    scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
    completedAt: input.completedAt ? new Date(input.completedAt) : null,
    consentAt: input.consentAt ? new Date(input.consentAt) : null,
    consentTextVersion: input.consentTextVersion ?? null,
    demoStartedAt: input.demoStartedAt ? new Date(input.demoStartedAt) : null,
    demoEndedAt: input.demoEndedAt ? new Date(input.demoEndedAt) : null,
    attendeesCount: input.attendeesCount ?? null,
    notes: input.notes ?? null,
  };
}

/**
 * Denominadores reconstruibles con SQL puro sobre `commercial_interviews`
 * (ZAL-583, cierra el hueco de ZAL-579/ZAL-580). Funcion pura: no toca DB,
 * red ni reloj; las pruebas de reconciliacion la consumen directamente.
 *
 * Equivalencia SQL exacta:
 *   consented  = COUNT(*) FILTER (WHERE consent_at IS NOT NULL
 *                                   AND consent_text_version IS NOT NULL)
 *   demosHeld  = COUNT(*) FILTER (WHERE status = 'completed'
 *                                   AND demo_ended_at IS NOT NULL
 *                                   AND attendees_count >= 1)
 */
export type CommercialInterviewDenominators = {
  consented: number;
  demosHeld: number;
};

export function reconcileCommercialInterviewDenominators<
  T extends {
    status: string;
    consentAt: Date | string | null;
    consentTextVersion: string | null;
    demoEndedAt: Date | string | null;
    attendeesCount: number | null;
  },
>(rows: ReadonlyArray<T>): CommercialInterviewDenominators {
  let consented = 0;
  let demosHeld = 0;

  for (const row of rows) {
    if (
      row.consentAt !== null &&
      row.consentAt !== undefined &&
      row.consentTextVersion !== null &&
      row.consentTextVersion !== undefined
    ) {
      consented += 1;
    }

    if (
      row.status === "completed" &&
      row.demoEndedAt !== null &&
      row.demoEndedAt !== undefined &&
      row.attendeesCount !== null &&
      row.attendeesCount !== undefined &&
      row.attendeesCount >= 1
    ) {
      demosHeld += 1;
    }
  }

  return { consented, demosHeld };
}
