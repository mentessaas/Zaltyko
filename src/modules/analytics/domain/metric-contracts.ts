import { z } from "zod";

export const metricCodeSchema = z.enum([
  "active_athletes_count",
  "class_fill_rate",
  "cohort_retention_rate",
  "churn_rate",
  "recognized_revenue_minor",
  "collection_rate",
  "waitlist_opportunity_count",
]);

export const metricQualityStatusSchema = z.enum([
  "complete",
  "partial",
  "insufficient",
  "stale",
  "invalid",
]);

export const metricDefinitionSchema = z.object({
  code: metricCodeSchema,
  version: z.number().int().positive(),
  unit: z.enum(["count", "ratio", "currency_minor"]),
  aggregation: z.enum(["sum", "weighted_ratio", "cohort_ratio"]),
  direction: z.enum([
    "higher_better",
    "lower_better",
    "target_range",
    "neutral",
  ]),
});

export const metricResultSchema = z
  .object({
    organizationId: z.string().uuid(),
    locationId: z.string().uuid().nullable(),
    metricCode: metricCodeSchema,
    definitionVersion: z.number().int().positive(),
    periodStart: z.string().date(),
    periodEnd: z.string().date(),
    value: z.number().finite().nullable(),
    numerator: z.number().finite().nullable(),
    denominator: z.number().finite().nullable(),
    coverage: z.number().min(0).max(1),
    qualityStatus: metricQualityStatusSchema,
    dimensions: z.record(z.string(), z.string()),
    calculatedAt: z.string().datetime({ offset: true }),
    sourceWatermark: z.string().datetime({ offset: true }),
  })
  .superRefine((result, context) => {
    if (result.periodEnd < result.periodStart) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["periodEnd"],
        message: "periodEnd no puede ser anterior a periodStart",
      });
    }

    if (
      (result.qualityStatus === "insufficient" ||
        result.qualityStatus === "invalid") &&
      result.value !== null
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "Una métrica insuficiente o inválida no publica un valor",
      });
    }

    if (result.qualityStatus === "complete" && result.value === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "Una métrica completa debe publicar un valor",
      });
    }
  });

export type MetricCode = z.infer<typeof metricCodeSchema>;
export type MetricDefinition = z.infer<typeof metricDefinitionSchema>;
export type MetricResult = z.infer<typeof metricResultSchema>;
