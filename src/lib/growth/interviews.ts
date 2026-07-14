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
    notes: input.notes ?? null,
  };
}
