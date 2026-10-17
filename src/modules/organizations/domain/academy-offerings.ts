import { z } from "zod";

export const gymnasticsDisciplineSchema = z.enum(["artistic", "rhythmic"]);
export type GymnasticsDiscipline = z.infer<typeof gymnasticsDisciplineSchema>;

export const complementaryActivitySchema = z.enum([
  "aerial_silks",
  "aerial_hoop",
  "dance",
  "physical_conditioning",
]);
export type ComplementaryActivity = z.infer<typeof complementaryActivitySchema>;

const optionalActivityNameSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0 ? undefined : value,
  z.string().trim().min(2).max(80).optional()
);

export const academyOfferingFieldsSchema = z.object({
  primaryDiscipline: gymnasticsDisciplineSchema,
  additionalDisciplines: z.array(gymnasticsDisciplineSchema).max(1).default([]),
  complementaryActivities: z
    .array(complementaryActivitySchema)
    .max(4)
    .default([]),
  customActivityName: optionalActivityNameSchema,
});

export const academyOfferingsSchema = academyOfferingFieldsSchema.superRefine(
  (value, context) => {
    if (value.additionalDisciplines.includes(value.primaryDiscipline)) {
      context.addIssue({
        code: "custom",
        path: ["additionalDisciplines"],
        message: "La especialidad principal no puede repetirse como adicional",
      });
    }
    if (
      new Set(value.additionalDisciplines).size !==
      value.additionalDisciplines.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["additionalDisciplines"],
        message: "No repitas una disciplina",
      });
    }
    if (
      new Set(value.complementaryActivities).size !==
      value.complementaryActivities.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["complementaryActivities"],
        message: "No repitas una actividad",
      });
    }
  }
);

export const GYMNASTICS_DISCIPLINE_LABELS: Record<
  GymnasticsDiscipline,
  string
> = {
  artistic: "Gimnasia artística",
  rhythmic: "Gimnasia rítmica",
};

export const COMPLEMENTARY_ACTIVITY_LABELS: Record<
  ComplementaryActivity,
  string
> = {
  aerial_silks: "Telas aéreas",
  aerial_hoop: "Aro aéreo",
  dance: "Baile",
  physical_conditioning: "Preparación física",
};

/**
 * Solo se habilitan países con defaults y perfiles deportivos revisados.
 * Añadir un mercado requiere definir su moneda/zona horaria y sus perfiles,
 * no inferirlos silenciosamente a partir del código de país.
 */
export const LAUNCH_MARKET_DEFAULTS = {
  ES: { currency: "EUR", timezone: "Europe/Madrid" },
} as const;

export function defaultLocationCode(locationName: string): string {
  const slug = locationName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "");

  return slug.length >= 2 ? slug : "sede-principal";
}
