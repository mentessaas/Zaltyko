import { z } from "zod";

export const PUBLIC_GROWTH_EVENT_NAMES = [
  "pricing_viewed",
  "pricing_plan_selected",
  "contact_started",
] as const;

export const COMMERCIAL_PLAN_SLUGS = ["free", "starter", "growth", "network"] as const;
export type CommercialPlanSlug = (typeof COMMERCIAL_PLAN_SLUGS)[number];

export function toCommercialPlanSlug(planCode: string | null | undefined): CommercialPlanSlug | null {
  if (planCode === "pro" || planCode === "starter") return "starter";
  if (planCode === "premium" || planCode === "growth") return "growth";
  if (planCode === "free" || planCode === "network") return planCode;
  return null;
}

const safePropertyValue = z.union([
  z.string().max(180),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const safeProperties = z
  .record(safePropertyValue)
  .default({})
  .superRefine((properties, context) => {
    const entries = Object.entries(properties);
    if (entries.length > 12) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Demasiadas propiedades" });
    }

    const forbiddenKey = /email|name|phone|message|password|token|secret/i;
    for (const [key] of entries) {
      if (forbiddenKey.test(key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `La propiedad ${key} no está permitida`,
        });
      }
    }
  });

export const PublicGrowthEventSchema = z
  .object({
    eventId: z.string().uuid(),
    eventName: z.enum(PUBLIC_GROWTH_EVENT_NAMES),
    visitorId: z.string().uuid(),
    planCode: z.enum(COMMERCIAL_PLAN_SLUGS).nullable().optional(),
    source: z.string().trim().min(1).max(64).regex(/^[a-z0-9_-]+$/i),
    properties: safeProperties,
  })
  .strict();

export const LeadCaptureSchema = z
  .object({
    email: z.string().trim().email().max(254),
    name: z.string().trim().min(2).max(100).nullable().optional(),
    source: z.string().trim().min(1).max(64).regex(/^[a-z0-9_-]+$/i).default("landing_page"),
    plan: z.enum(COMMERCIAL_PLAN_SLUGS).nullable().optional(),
    eventId: z.string().uuid().nullable().optional(),
    visitorId: z.string().uuid().nullable().optional(),
  })
  .strict();

export const ContactRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().email().max(254),
    academy: z.string().trim().max(140).nullable().optional(),
    reason: z
      .enum(["demo", "network", "sales", "support", "billing", "partnership", "other"])
      .default("demo"),
    plan: z.enum(COMMERCIAL_PLAN_SLUGS).nullable().optional(),
    visitorId: z.string().uuid().nullable().optional(),
    source: z.string().trim().min(1).max(64).regex(/^[a-z0-9_-]+$/i).default("contact_form"),
    message: z.string().trim().min(10).max(2_000),
    honeypot: z.string().max(100).nullable().optional(),
    submissionId: z.string().uuid(),
  })
  .strict();

const nullableShortText = z.string().trim().max(180).nullable().optional();
const nullableLongText = z.string().trim().max(2_000).nullable().optional();

export const CommercialInterviewInputSchema = z
  .object({
    leadId: z.string().uuid().nullable().optional(),
    academyName: z.string().trim().min(2).max(140),
    contactName: nullableShortText,
    contactEmail: z.string().trim().email().max(254).nullable().optional(),
    countryCode: z.string().trim().length(2).toUpperCase().nullable().optional(),
    city: nullableShortText,
    modality: z.enum(["artistica", "ritmica", "mixta", "otra"]).nullable().optional(),
    athleteCount: z.number().int().min(0).max(100_000).nullable().optional(),
    coachCount: z.number().int().min(0).max(10_000).nullable().optional(),
    locationCount: z.number().int().min(1).max(1_000).default(1),
    currentTools: nullableLongText,
    biggestPain: nullableLongText,
    mostValuableFeature: nullableLongText,
    primaryObjection: nullableLongText,
    easyPriceEur: z.number().min(0).max(9_999).nullable().optional(),
    limitPriceEur: z.number().min(0).max(9_999).nullable().optional(),
    preferredPricingModel: nullableShortText,
    freePlanExpectation: nullableLongText,
    upgradeTrigger: nullableLongText,
    betaInterest: z.enum(["unknown", "yes", "no", "maybe"]).default("unknown"),
    willingnessToPay: z.enum(["unknown", "yes", "no", "maybe"]).default("unknown"),
    status: z.enum(["scheduled", "completed", "no_show", "cancelled"]).default("scheduled"),
    scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
    completedAt: z.string().datetime({ offset: true }).nullable().optional(),
    notes: nullableLongText,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.easyPriceEur !== null &&
      value.easyPriceEur !== undefined &&
      value.limitPriceEur !== null &&
      value.limitPriceEur !== undefined &&
      value.limitPriceEur < value.easyPriceEur
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["limitPriceEur"],
        message: "El precio límite no puede ser menor que el precio fácil",
      });
    }

    if (value.status !== "completed") return;

    const required: Array<[keyof typeof value, unknown]> = [
      ["athleteCount", value.athleteCount],
      ["currentTools", value.currentTools],
      ["biggestPain", value.biggestPain],
      ["primaryObjection", value.primaryObjection],
      ["easyPriceEur", value.easyPriceEur],
      ["limitPriceEur", value.limitPriceEur],
      ["completedAt", value.completedAt],
    ];

    for (const [field, fieldValue] of required) {
      if (fieldValue === null || fieldValue === undefined || fieldValue === "") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: "Campo obligatorio para una entrevista completada",
        });
      }
    }
  });

export type CommercialInterviewInput = z.infer<typeof CommercialInterviewInputSchema>;
