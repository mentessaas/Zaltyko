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

const p0Candidate = (input: {
  entityType: string;
  entityId?: string;
  title: string;
  detail: string;
  evidence: Record<string, unknown>;
  ctaKey: string;
  ctaPayload: Record<string, unknown>;
  assumptions?: string[];
  impactScore: number;
  urgencyScore: number;
  confidenceScore: number;
  actionabilityScore: number;
}): InsightCandidate => ({
  ...input,
  assumptions: input.assumptions ?? [],
});

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
  fillRateAtLeast?: number;
  eligibleWaitlistAtLeast?: number;
}): InsightCandidate | null {
  const fillRateAtLeast = input.fillRateAtLeast ?? 0.9;
  const eligibleWaitlistAtLeast = input.eligibleWaitlistAtLeast ?? 3;
  if (input.fillRate < fillRateAtLeast || input.eligibleWaitlist < eligibleWaitlistAtLeast) return null;

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
      threshold: { fillRateAtLeast, eligibleWaitlistAtLeast },
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
    urgencyScore: bounded(60 + Math.max(0, input.fillRate - fillRateAtLeast) * 200),
    confidenceScore: bounded(40 + input.observedSessions * 10),
    actionabilityScore: 90,
    estimatedValueMinMinor,
    estimatedValueMaxMinor,
    estimateCurrency: hasEstimate ? input.currency : undefined,
  };
}

export function evaluateUnderutilizedClass(input: {
  classTemplateId: string;
  fillRate: number;
  observedSessions: number;
  minimumFillRate?: number;
  minimumSessions?: number;
}): InsightCandidate | null {
  const threshold = input.minimumFillRate ?? 0.5;
  const minimumSessions = input.minimumSessions ?? 4;
  if (input.fillRate >= threshold || input.observedSessions < minimumSessions) {
    return null;
  }
  return p0Candidate({
    entityType: "class_template",
    entityId: input.classTemplateId,
    title: "Clase con plazas sin ocupar",
    detail: `La ocupación media es ${(input.fillRate * 100).toFixed(0)}% en ${input.observedSessions} sesiones observadas.`,
    evidence: {
      fillRate: input.fillRate,
      observedSessions: input.observedSessions,
      threshold: { fillRateBelow: threshold, minimumSessions },
    },
    ctaKey: "review_schedule",
    ctaPayload: { classTemplateId: input.classTemplateId },
    impactScore: bounded(45 + (threshold - input.fillRate) * 60),
    urgencyScore: 35,
    confidenceScore: bounded(55 + input.observedSessions * 8),
    actionabilityScore: 75,
  });
}

export function evaluateOverdueCollections(input: {
  locationId?: string;
  overdueBalanceMinor: number;
  currency: string;
  oldestAgeDays: number;
  affectedFamilyCount: number;
  minimumAgeDays?: number;
  minimumBalanceMinor?: number;
}): InsightCandidate | null {
  const minimumAgeDays = input.minimumAgeDays ?? 3;
  const minimumBalanceMinor = input.minimumBalanceMinor ?? 0;
  if (
    input.overdueBalanceMinor <= minimumBalanceMinor ||
    input.oldestAgeDays < minimumAgeDays ||
    !/^[A-Z]{3}$/.test(input.currency)
  ) {
    return null;
  }
  return p0Candidate({
    entityType: input.locationId
      ? `location_financial_${input.currency.toLowerCase()}`
      : `organization_financial_${input.currency.toLowerCase()}`,
    entityId: input.locationId,
    title: "Hay cobros pendientes de revisar",
    detail: `${input.affectedFamilyCount} familias tienen saldo vencido desde hace ${input.oldestAgeDays} días o más.`,
    evidence: {
      overdueBalanceMinor: input.overdueBalanceMinor,
      currency: input.currency,
      oldestAgeDays: input.oldestAgeDays,
      affectedFamilyCount: input.affectedFamilyCount,
      threshold: { outstandingAboveMinor: minimumBalanceMinor, minimumAgeDays },
    },
    ctaKey: "send_reminders",
    ctaPayload: { locationId: input.locationId ?? null },
    impactScore: bounded(50 + Math.log10(input.overdueBalanceMinor + 1) * 8),
    urgencyScore: bounded(35 + input.oldestAgeDays * 2),
    confidenceScore: 95,
    actionabilityScore: 80,
  });
}

export function evaluateIncompleteAttendance(input: {
  sessionId: string;
  hoursAfterEnd: number;
  incompleteRecordCount: number;
  thresholdHours?: number;
}): InsightCandidate | null {
  const thresholdHours = input.thresholdHours ?? 12;
  if (
    input.hoursAfterEnd <= thresholdHours ||
    input.incompleteRecordCount <= 0
  ) {
    return null;
  }
  return p0Candidate({
    entityType: "session",
    entityId: input.sessionId,
    title: "Falta cerrar la asistencia",
    detail: `La sesión terminó hace ${Math.floor(input.hoursAfterEnd)} horas y quedan ${input.incompleteRecordCount} registros por completar.`,
    evidence: {
      hoursAfterEnd: input.hoursAfterEnd,
      incompleteRecordCount: input.incompleteRecordCount,
      thresholdHours,
    },
    ctaKey: "complete_attendance",
    ctaPayload: { sessionId: input.sessionId },
    impactScore: 35,
    urgencyScore: bounded(45 + input.hoursAfterEnd),
    confidenceScore: 95,
    actionabilityScore: 95,
  });
}

export function evaluateTrialWithoutFollowup(input: {
  trialId: string;
  hoursSinceCompletion: number;
  thresholdHours?: number;
}): InsightCandidate | null {
  const thresholdHours = input.thresholdHours ?? 24;
  if (input.hoursSinceCompletion <= thresholdHours) return null;
  return p0Candidate({
    entityType: "trial",
    entityId: input.trialId,
    title: "Registrar el seguimiento de la prueba",
    detail: `La prueba terminó hace ${Math.floor(input.hoursSinceCompletion)} horas y todavía no consta seguimiento.`,
    evidence: {
      hoursSinceCompletion: input.hoursSinceCompletion,
      thresholdHours,
    },
    ctaKey: "record_followup",
    ctaPayload: { trialId: input.trialId },
    impactScore: 45,
    urgencyScore: bounded(40 + input.hoursSinceCompletion),
    confidenceScore: 95,
    actionabilityScore: 90,
  });
}

export function evaluateLowTrialConversion(input: {
  locationId?: string;
  completedTrialCount: number;
  convertedTrialCount: number;
  targetConversionRate?: number;
  minimumTrials?: number;
}): InsightCandidate | null {
  const minimumTrials = input.minimumTrials ?? 10;
  if (
    input.completedTrialCount < minimumTrials ||
    input.targetConversionRate === undefined ||
    input.targetConversionRate < 0 ||
    input.targetConversionRate > 1
  ) {
    return null;
  }
  const conversionRate = input.convertedTrialCount / input.completedTrialCount;
  if (conversionRate >= input.targetConversionRate) return null;
  return p0Candidate({
    entityType: input.locationId ? "location" : "organization",
    entityId: input.locationId,
    title: "Revisar la conversión de pruebas",
    detail: `Convirtieron ${(conversionRate * 100).toFixed(0)}% de ${input.completedTrialCount} pruebas; la meta interna es ${(input.targetConversionRate * 100).toFixed(0)}%.`,
    evidence: {
      completedTrialCount: input.completedTrialCount,
      convertedTrialCount: input.convertedTrialCount,
      conversionRate,
      targetConversionRate: input.targetConversionRate,
      minimumTrials,
    },
    assumptions: [
      "La meta es interna y debe configurarla la organización; no existe benchmark español validado.",
    ],
    ctaKey: "review_trial_funnel",
    ctaPayload: { locationId: input.locationId ?? null },
    impactScore: bounded(
      45 + (input.targetConversionRate - conversionRate) * 100
    ),
    urgencyScore: 35,
    confidenceScore: bounded(45 + input.completedTrialCount * 3),
    actionabilityScore: 70,
  });
}

export function evaluateCapacityWithoutPrice(input: {
  classTemplateId: string;
  openCapacity: number;
  hasActivePrice: boolean;
  commerciallyOpen: boolean;
}): InsightCandidate | null {
  if (
    !input.commerciallyOpen ||
    input.openCapacity <= 0 ||
    input.hasActivePrice
  ) {
    return null;
  }
  return p0Candidate({
    entityType: "class_template",
    entityId: input.classTemplateId,
    title: "Configurar precio para las plazas disponibles",
    detail: `Hay ${input.openCapacity} plazas abiertas sin un precio activo asociado.`,
    evidence: {
      openCapacity: input.openCapacity,
      hasActivePrice: input.hasActivePrice,
      commerciallyOpen: input.commerciallyOpen,
    },
    ctaKey: "configure_price",
    ctaPayload: { classTemplateId: input.classTemplateId },
    impactScore: bounded(40 + input.openCapacity * 3),
    urgencyScore: 25,
    confidenceScore: 95,
    actionabilityScore: 90,
  });
}

export function evaluateSessionWithoutCoach(input: {
  sessionId: string;
  hoursUntilStart: number;
  assignedCoachCount: number;
  thresholdHours?: number;
}): InsightCandidate | null {
  const thresholdHours = input.thresholdHours ?? 72;
  if (
    input.hoursUntilStart <= 0 ||
    input.hoursUntilStart >= thresholdHours ||
    input.assignedCoachCount > 0
  ) {
    return null;
  }
  return p0Candidate({
    entityType: "session",
    entityId: input.sessionId,
    title: "Asignar entrenador a una sesión próxima",
    detail: `La sesión empieza dentro de ${Math.ceil(input.hoursUntilStart)} horas y no tiene personal asignado.`,
    evidence: {
      hoursUntilStart: input.hoursUntilStart,
      assignedCoachCount: input.assignedCoachCount,
      thresholdHours,
    },
    ctaKey: "assign_coach",
    ctaPayload: { sessionId: input.sessionId },
    impactScore: 65,
    urgencyScore: bounded(55 + (thresholdHours - input.hoursUntilStart)),
    confidenceScore: 100,
    actionabilityScore: 90,
  });
}

const allowedDataQualityFields = new Set([
  "capacity",
  "price",
  "status",
  "timezone",
  "program",
  "space",
  "attendance",
]);

export function evaluateCriticalDataMissing(input: {
  entityType: "organization" | "location" | "class_template" | "session";
  entityId?: string;
  missingFields: string[];
}): InsightCandidate | null {
  const fields = [...new Set(input.missingFields)].filter((field) =>
    allowedDataQualityFields.has(field)
  );
  if (fields.length === 0) return null;
  const target = input.entityId ? { entityId: input.entityId } : {};
  return p0Candidate({
    entityType: input.entityType,
    ...target,
    title: "Completar datos que afectan a las métricas",
    detail: `Faltan datos de configuración: ${fields.join(", ")}.`,
    evidence: { missingFields: fields, blocksMetric: true },
    ctaKey: "fix_configuration",
    ctaPayload: { entityType: input.entityType, ...target },
    impactScore: bounded(35 + fields.length * 10),
    urgencyScore: 35,
    confidenceScore: 100,
    actionabilityScore: 85,
  });
}
