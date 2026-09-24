import { z } from "zod";

/**
 * Fechas de reporte en formato ISO civil (YYYY-MM-DD). El preprocess acepta
 * null/"" porque los query params opcionales de Next llegan así cuando el
 * filtro no se ha seleccionado todavía.
 */
export const reportDateSchema = z.preprocess(
  (value) => (value === null || value === "" ? undefined : value),
  z.string().date().optional(),
);

/** Impide reportes silenciosamente vacíos por un periodo invertido. */
export function validateReportPeriod(
  value: { startDate?: string; endDate?: string },
  ctx: z.RefinementCtx,
) {
  if (value.startDate && value.endDate && value.endDate < value.startDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endDate"],
      message: "La fecha final debe ser igual o posterior a la fecha inicial.",
    });
  }
}
