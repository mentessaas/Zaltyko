import { z } from "zod";

const uuidSchema = z.string().uuid();

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

const dateSchema = z
  .string()
  .refine(isCalendarDate, "La fecha debe existir y usar YYYY-MM-DD.");

export const pricePlanClassTemplateCoverageSchema = z
  .object({
    organizationId: uuidSchema,
    locationId: uuidSchema,
    pricePlanId: uuidSchema,
    classTemplateId: uuidSchema,
    startsOn: dateSchema,
    endsOn: dateSchema.nullable(),
  })
  .strict()
  .superRefine((coverage, context) => {
    if (coverage.endsOn && coverage.endsOn < coverage.startsOn) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endsOn"],
        message: "La fecha final no puede ser anterior a la inicial.",
      });
    }
  });

export type PricePlanClassTemplateCoverage = z.infer<
  typeof pricePlanClassTemplateCoverageSchema
>;

export const coveragePeriodSchema = z
  .object({
    startsOn: dateSchema,
    endsOn: dateSchema,
  })
  .strict()
  .refine((period) => period.endsOn >= period.startsOn, {
    path: ["endsOn"],
    message: "El periodo no puede terminar antes de comenzar.",
  });

export function coversPeriod(
  coverage: Pick<PricePlanClassTemplateCoverage, "startsOn" | "endsOn">,
  period: z.infer<typeof coveragePeriodSchema>
): boolean {
  return (
    coverage.startsOn <= period.startsOn &&
    (coverage.endsOn === null || coverage.endsOn >= period.endsOn)
  );
}

export type CoverageOverlap = {
  first: PricePlanClassTemplateCoverage;
  second: PricePlanClassTemplateCoverage;
};

/** Mirrors the database exclusion constraint for early, side-effect-free feedback. */
export function findCoverageOverlaps(
  coverages: PricePlanClassTemplateCoverage[]
): CoverageOverlap[] {
  const overlaps: CoverageOverlap[] = [];
  const sorted = [...coverages].sort(
    (left, right) =>
      left.organizationId.localeCompare(right.organizationId) ||
      left.locationId.localeCompare(right.locationId) ||
      left.pricePlanId.localeCompare(right.pricePlanId) ||
      left.classTemplateId.localeCompare(right.classTemplateId) ||
      left.startsOn.localeCompare(right.startsOn)
  );

  for (let index = 0; index < sorted.length; index += 1) {
    const first = sorted[index];
    for (let nextIndex = index + 1; nextIndex < sorted.length; nextIndex += 1) {
      const second = sorted[nextIndex];
      if (
        first.organizationId !== second.organizationId ||
        first.locationId !== second.locationId ||
        first.pricePlanId !== second.pricePlanId ||
        first.classTemplateId !== second.classTemplateId
      ) {
        break;
      }
      if (first.endsOn === null || first.endsOn >= second.startsOn) {
        overlaps.push({ first, second });
      }
    }
  }
  return overlaps;
}

export const monthlyAthleteCoveredEnrollmentSchema = z
  .object({
    enrollmentId: uuidSchema,
    classTemplateId: uuidSchema,
    className: z.string().trim().min(2).max(120),
    assignmentId: uuidSchema,
  })
  .strict();

/** amountCents is one monthly tariff snapshot; it is not the sum of covered enrollments. */
export const monthlyAthleteTariffLineSchema = z
  .object({
    athleteId: uuidSchema,
    athleteName: z.string().trim().min(1),
    pricePlanId: uuidSchema,
    pricePlanName: z.string().trim().min(1),
    amountCents: z
      .number()
      .int()
      .positive()
      .refine(
        Number.isSafeInteger,
        "El importe excede el rango entero seguro."
      ),
    currency: z.string().regex(/^[A-Z]{3}$/),
    coveredEnrollments: z.array(monthlyAthleteCoveredEnrollmentSchema).min(1),
  })
  .strict()
  .superRefine((line, context) => {
    const fields = ["enrollmentId", "classTemplateId", "assignmentId"] as const;
    for (const field of fields) {
      const values = line.coveredEnrollments.map((entry) => entry[field]);
      if (new Set(values).size !== values.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["coveredEnrollments"],
          message: `La cobertura repite ${field}.`,
        });
      }
    }
  });

export const monthlyAthleteTariffConflictCodeSchema = z.enum([
  "ATHLETE_TARIFF_CONFLICT",
  "TARIFF_COVERAGE_INCOMPLETE",
]);

export const monthlyAthleteTariffConflictSchema = z
  .object({
    athleteId: uuidSchema,
    code: monthlyAthleteTariffConflictCodeSchema,
    enrollmentIds: z.array(uuidSchema).min(1),
  })
  .strict();

export const monthlyAthleteTariffOptionsSchema = z
  .object({
    lines: z.array(monthlyAthleteTariffLineSchema),
    conflicts: z.array(monthlyAthleteTariffConflictSchema),
  })
  .strict()
  .superRefine((options, context) => {
    const athleteIds = options.lines.map((line) => line.athleteId);
    if (new Set(athleteIds).size !== athleteIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lines"],
        message: "La respuesta repite una línea para la misma gimnasta.",
      });
    }
    const conflictedAthletes = new Set(
      options.conflicts.map((conflict) => conflict.athleteId)
    );
    if (options.conflicts.length !== conflictedAthletes.size) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["conflicts"],
        message: "La respuesta repite un conflicto para la misma gimnasta.",
      });
    }
    if (athleteIds.some((athleteId) => conflictedAthletes.has(athleteId))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["conflicts"],
        message:
          "Una gimnasta con conflicto no puede recibir una línea parcial.",
      });
    }
  });

export type MonthlyAthleteCoveredEnrollment = z.infer<
  typeof monthlyAthleteCoveredEnrollmentSchema
>;
export type MonthlyAthleteTariffLine = z.infer<
  typeof monthlyAthleteTariffLineSchema
>;
export type MonthlyAthleteTariffConflict = z.infer<
  typeof monthlyAthleteTariffConflictSchema
>;
export type MonthlyAthleteTariffOptions = z.infer<
  typeof monthlyAthleteTariffOptionsSchema
>;
