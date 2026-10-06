export interface InsightCandidate {
  entityType: string;
  entityId?: string;
  title: string;
  detail: string;
  evidence: Record<string, unknown>;
  assumptions: string[];
  ctaKey: string;
  ctaPayload: Record<string, unknown>;
  impactScore: number;
  urgencyScore: number;
  confidenceScore: number;
  actionabilityScore: number;
  estimatedValueMinMinor?: number;
  estimatedValueMaxMinor?: number;
  estimateCurrency?: string;
}

function bounded(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function calculateInsightPriority(input: {
  impactScore: number;
  urgencyScore: number;
  confidenceScore: number;
  actionabilityScore: number;
}): number {
  return Number(
    (
      bounded(input.impactScore) * 0.4 +
      bounded(input.urgencyScore) * 0.25 +
      bounded(input.confidenceScore) * 0.2 +
      bounded(input.actionabilityScore) * 0.15
    ).toFixed(2)
  );
}

export function evaluateExcessDemand(input: {
  classTemplateId: string;
  fillRate: number;
  eligibleWaitlist: number;
  observedSessions: number;
  monthlyPriceMinor?: number;
  currency?: string;
}): InsightCandidate | null {
  if (input.fillRate < 0.9 || input.eligibleWaitlist < 3) return null;

  const hasEstimate =
    input.monthlyPriceMinor !== undefined &&
    input.monthlyPriceMinor > 0 &&
    Boolean(input.currency);
  const minimumConversion = 0.5;
  const estimatedValueMinMinor = hasEstimate
    ? Math.round(
        input.eligibleWaitlist * input.monthlyPriceMinor! * minimumConversion
      )
    : undefined;
  const estimatedValueMaxMinor = hasEstimate
    ? input.eligibleWaitlist * input.monthlyPriceMinor!
    : undefined;

  return {
    entityType: "class_template",
    entityId: input.classTemplateId,
    title: "Demanda suficiente para simular otro grupo",
    detail: `${input.eligibleWaitlist} personas contactables esperan plaza y la ocupación observada es ${(input.fillRate * 100).toFixed(0)}%.`,
    evidence: {
      fillRate: input.fillRate,
      eligibleWaitlist: input.eligibleWaitlist,
      observedSessions: input.observedSessions,
      threshold: { fillRateAtLeast: 0.9, eligibleWaitlistAtLeast: 3 },
    },
    assumptions: hasEstimate
      ? [
          "Rango calculado con una conversión hipotética del 50% al 100% de la waitlist elegible.",
          "Importe bruto mensual antes de descuentos, impagos, reembolsos, costes e impuestos.",
          "La simulación no garantiza altas ni ingresos.",
        ]
      : [
          "No se estima valor monetario porque falta un precio mensual canónico.",
          "La simulación no garantiza altas ni ingresos.",
        ],
    ctaKey: "simulate_group",
    ctaPayload: { classTemplateId: input.classTemplateId },
    impactScore: bounded(55 + input.eligibleWaitlist * 5),
    urgencyScore: bounded(60 + Math.max(0, input.fillRate - 0.9) * 200),
    confidenceScore: bounded(40 + input.observedSessions * 10),
    actionabilityScore: 90,
    estimatedValueMinMinor,
    estimatedValueMaxMinor,
    estimateCurrency: hasEstimate ? input.currency : undefined,
  };
}
