import { z } from "zod";

import {
  CALENDAR_MAX_RANGE_DAYS,
  calendarRangeDays,
  isIsoDate,
} from "@/modules/scheduling/domain/calendar";

/**
 * Consulta del calendario: el rango es obligatorio, acotado y con fechas
 * reales. `organizationId` identifica la academia; la autorización la decide
 * `resolveOwnerScope` antes de leer nada. Sin claves desconocidas.
 */
export const ownerCalendarQuerySchema = z
  .object({
    organizationId: z.guid(),
    locationId: z.guid().optional(),
    groupId: z.guid().optional(),
    from: z.string().refine(isIsoDate, "Fecha de inicio inválida"),
    to: z.string().refine(isIsoDate, "Fecha de fin inválida"),
  })
  .strict()
  .superRefine((query, context) => {
    if (!isIsoDate(query.from) || !isIsoDate(query.to)) return;
    if (query.to < query.from) {
      context.addIssue({
        code: "custom",
        path: ["to"],
        message: "El fin no puede ser anterior al inicio.",
      });
    } else if (calendarRangeDays({ from: query.from, to: query.to }) > CALENDAR_MAX_RANGE_DAYS) {
      context.addIssue({
        code: "custom",
        path: ["to"],
        message: `El rango no puede superar ${CALENDAR_MAX_RANGE_DAYS} días.`,
      });
    }
  });

export type OwnerCalendarQuery = z.infer<typeof ownerCalendarQuerySchema>;
