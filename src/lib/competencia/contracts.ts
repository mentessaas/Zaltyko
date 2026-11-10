import { z } from "zod";

import {
  BILLING_PERIODS,
  CLIENT_SIZES,
  COMPETITOR_TYPES,
  CONFIDENCE_LEVELS,
  DATA_STATUSES,
  DISCIPLINES,
  EFFORT_SIZES,
  EVIDENCE_LEVELS,
  FLOW_COVERAGES,
  LIFECYCLE_STATUSES,
  OPPORTUNITY_CLASSES,
  OPPORTUNITY_STATUSES,
  RESEARCH_STATUSES,
  SECTION_KEYS,
  SOURCE_TYPES,
  VAT_MODES,
  ZALTYKO_FLOW_STATUSES,
} from "./domain";

/**
 * Contratos de entrada del panel de competencia. Los formularios envían `null`
 * para campos vacíos, así que todos los opcionales aceptan `null` explícito.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null));

const httpUrl = z
  .string()
  .trim()
  .max(2000, "URL demasiado larga")
  .regex(/^https?:\/\/\S+$/i, "La URL debe empezar por http:// o https://");

const isoDate = z.iso.date({ message: "Fecha inválida (AAAA-MM-DD)" });
const countryCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, "Usa códigos de país de dos letras (ES, MX, US…)");

const uniqueList = <T extends z.ZodTypeAny>(item: T, max: number) =>
  z
    .array(item)
    .max(max)
    .transform((values) => Array.from(new Set(values)) as z.infer<T>[]);

export const CompetitorCreateSchema = z.object({
  name: z.string().trim().min(2, "El nombre es obligatorio").max(120),
  website: httpUrl
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  competitorType: z.enum(COMPETITOR_TYPES, {
    message: "Tipo de competidor inválido",
  }),
  countries: uniqueList(countryCode, 30).optional().default([]),
  disciplines: uniqueList(z.enum(DISCIPLINES), DISCIPLINES.length)
    .optional()
    .default([]),
  clientSizes: uniqueList(z.enum(CLIENT_SIZES), CLIENT_SIZES.length)
    .optional()
    .default([]),
  researchStatus: z.enum(RESEARCH_STATUSES).optional().default("pendiente"),
  summary: optionalText(2000),
});
export type CompetitorCreateInput = z.infer<typeof CompetitorCreateSchema>;

export const CompetitorUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    website: httpUrl.nullable().optional(),
    competitorType: z.enum(COMPETITOR_TYPES).optional(),
    countries: uniqueList(countryCode, 30).optional(),
    disciplines: uniqueList(z.enum(DISCIPLINES), DISCIPLINES.length).optional(),
    clientSizes: uniqueList(
      z.enum(CLIENT_SIZES),
      CLIENT_SIZES.length
    ).optional(),
    researchStatus: z.enum(RESEARCH_STATUSES).optional(),
    lifecycleStatus: z.enum(LIFECYCLE_STATUSES).optional(),
    summary: z.string().trim().max(2000).nullable().optional(),
  })
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    {
      message: "No hay cambios que guardar",
    }
  );
export type CompetitorUpdateInput = z.infer<typeof CompetitorUpdateSchema>;

export const SectionUpdateSchema = z.object({
  content: z.string().trim().max(8000, "Máximo 8.000 caracteres"),
  dataStatus: z.enum(DATA_STATUSES),
  evidenceLevel: z.enum(EVIDENCE_LEVELS),
  lastVerifiedOn: isoDate
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  reviewAfterDays: z.coerce.number().int().min(1).max(730),
  sourceIds: uniqueList(z.guid(), 50).optional().default([]),
});
export type SectionUpdateInput = z.infer<typeof SectionUpdateSchema>;
export const SectionKeySchema = z.enum(SECTION_KEYS);

export const SourceCreateSchema = z.object({
  competitorId: z
    .guid()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  url: httpUrl,
  title: optionalText(200),
  accessedOn: isoDate,
  sourceType: z.enum(SOURCE_TYPES),
  claim: z.string().trim().min(3, "Indica qué afirmación respalda").max(1000),
  evidenceLevel: z.enum(EVIDENCE_LEVELS),
  notes: optionalText(2000),
  accessible: z.boolean().optional().default(true),
});
export type SourceCreateInput = z.infer<typeof SourceCreateSchema>;
export const SourceUpdateSchema = SourceCreateSchema.omit({
  competitorId: true,
});
export type SourceUpdateInput = z.infer<typeof SourceUpdateSchema>;

export const FlowInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  valuedBy: optionalText(300),
  zaltykoStatus: z.enum(ZALTYKO_FLOW_STATUSES),
  zaltykoCodeRefs: optionalText(2000),
  demandEvidence: optionalText(1000),
  opportunity: optionalText(1000),
  decision: z
    .enum(OPPORTUNITY_CLASSES)
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  sortOrder: z.coerce.number().int().min(0).max(10000).optional().default(100),
});
export type FlowInput = z.infer<typeof FlowInputSchema>;

export const FlowCoverageSchema = z.object({
  flowId: z.guid(),
  coverage: z.enum(FLOW_COVERAGES),
  evidenceLevel: z.enum(EVIDENCE_LEVELS),
  sourceId: z
    .guid()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  notes: optionalText(1000),
});
export type FlowCoverageInput = z.infer<typeof FlowCoverageSchema>;

export const PricingPlanSchema = z.object({
  planName: z.string().trim().min(1).max(120),
  priceAmount: z.coerce
    .number()
    .min(0)
    .max(1_000_000)
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Moneda ISO de tres letras")
    .default("EUR"),
  billingPeriod: z.enum(BILLING_PERIODS),
  vatMode: z.enum(VAT_MODES),
  limitsText: optionalText(1000),
  feesText: optionalText(1000),
  extrasText: optionalText(1000),
  trialText: optionalText(500),
  commitmentText: optionalText(500),
  estimateSmall: optionalText(300),
  estimateMedium: optionalText(300),
  estimateLarge: optionalText(300),
  sourceId: z
    .guid()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  dataStatus: z.enum(DATA_STATUSES),
  lastVerifiedOn: isoDate
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  reviewAfterDays: z.coerce
    .number()
    .int()
    .min(1)
    .max(730)
    .optional()
    .default(60),
});
export type PricingPlanInput = z.infer<typeof PricingPlanSchema>;
export const PricingPlanCreateSchema = PricingPlanSchema.extend({
  competitorId: z.guid(),
});

export const OpportunityInputSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: optionalText(4000),
  classification: z.enum(OPPORTUNITY_CLASSES),
  priority: z.coerce
    .number()
    .int()
    .min(1)
    .max(99)
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  whoPays: optionalText(300),
  frequency: optionalText(300),
  currentCost: optionalText(500),
  minimumSolution: optionalText(1000),
  codeDependencies: optionalText(1000),
  confidence: z.enum(CONFIDENCE_LEVELS),
  effort: z
    .enum(EFFORT_SIZES)
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  successMetric: optionalText(500),
  validationPlan: optionalText(1000),
  status: z.enum(OPPORTUNITY_STATUSES),
  competitorIds: uniqueList(z.guid(), 50).optional().default([]),
});
export type OpportunityInput = z.infer<typeof OpportunityInputSchema>;

/** Filtros del listado. `URLSearchParams.get()` devuelve null: aceptarlo explícitamente. */
export const CompetitorFiltersSchema = z.object({
  q: z.string().trim().max(120).nullable().optional(),
  type: z.enum(COMPETITOR_TYPES).nullable().optional().catch(null),
  country: countryCode.nullable().optional().catch(null),
  discipline: z.enum(DISCIPLINES).nullable().optional().catch(null),
  size: z.enum(CLIENT_SIZES).nullable().optional().catch(null),
  research: z.enum(RESEARCH_STATUSES).nullable().optional().catch(null),
  lifecycle: z
    .enum([...LIFECYCLE_STATUSES, "todos"] as const)
    .nullable()
    .optional()
    .catch(null),
});
export type CompetitorFilters = z.infer<typeof CompetitorFiltersSchema>;

export function parseCompetitorFilters(
  params: Record<string, string | string[] | undefined> | URLSearchParams
) {
  const read = (key: string) => {
    if (params instanceof URLSearchParams) return params.get(key);
    const value = params[key];
    return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
  };
  const raw = Object.fromEntries(
    ["q", "type", "country", "discipline", "size", "research", "lifecycle"].map(
      (key) => {
        const value = read(key);
        return [key, value === "" ? null : value];
      }
    )
  );
  const parsed = CompetitorFiltersSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

/* ---------- Semilla versionada ---------- */

const SeedSectionSchema = z.object({
  content: z.string().max(8000),
  dataStatus: z.enum(DATA_STATUSES),
  evidenceLevel: z.enum(EVIDENCE_LEVELS),
  lastVerifiedOn: isoDate.nullable(),
  sourceRefs: z.array(z.string()).default([]),
});

const SeedSourceSchema = z.object({
  ref: z.string().min(1),
  url: httpUrl,
  title: z.string().nullable().default(null),
  accessedOn: isoDate,
  sourceType: z.enum(SOURCE_TYPES),
  claim: z.string().min(3),
  evidenceLevel: z.enum(EVIDENCE_LEVELS),
  notes: z.string().nullable().default(null),
  accessible: z.boolean().default(true),
});

const SeedPricingSchema = PricingPlanSchema.omit({ sourceId: true }).extend({
  sourceRef: z.string().nullable().default(null),
});

const SeedCompetitorSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  name: z.string().min(2),
  website: httpUrl.nullable(),
  competitorType: z.enum(COMPETITOR_TYPES),
  countries: z.array(countryCode),
  disciplines: z.array(z.enum(DISCIPLINES)),
  clientSizes: z.array(z.enum(CLIENT_SIZES)),
  researchStatus: z.enum(RESEARCH_STATUSES),
  summary: z.string().nullable(),
  sources: z.array(SeedSourceSchema).default([]),
  sections: z
    .partialRecord(z.enum(SECTION_KEYS), SeedSectionSchema)
    .default({}),
  pricing: z.array(SeedPricingSchema).default([]),
  flows: z
    .array(
      z.object({
        flow: z.string(),
        coverage: z.enum(FLOW_COVERAGES),
        evidenceLevel: z.enum(EVIDENCE_LEVELS),
        sourceRef: z.string().nullable().default(null),
        notes: z.string().nullable().default(null),
      })
    )
    .default([]),
});

export const CompetitiveSeedSchema = z.object({
  version: z.string().min(1),
  generatedOn: isoDate,
  flows: z.array(
    z.object({
      key: z.string().regex(/^[a-z0-9_]+$/),
      name: z.string(),
      valuedBy: z.string().nullable(),
      zaltykoStatus: z.enum(ZALTYKO_FLOW_STATUSES),
      zaltykoCodeRefs: z.string().nullable(),
      demandEvidence: z.string().nullable(),
      opportunity: z.string().nullable(),
      decision: z.enum(OPPORTUNITY_CLASSES).nullable(),
      sortOrder: z.number().int(),
    })
  ),
  competitors: z.array(SeedCompetitorSchema),
  opportunities: z.array(
    OpportunityInputSchema.omit({ competitorIds: true }).extend({
      competitorSlugs: z.array(z.string()).default([]),
    })
  ),
});
export type CompetitiveSeed = z.infer<typeof CompetitiveSeedSchema>;
