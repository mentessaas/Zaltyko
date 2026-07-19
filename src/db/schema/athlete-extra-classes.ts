import { index, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { athletes } from "./athletes";
import { classes } from "./classes";

/**
 * athleteExtraClasses - Tabla de clases extra asignadas a atletas
 * 
 * Relaciona atletas con clases extra (clases individuales, is_extra = true).
 * Estas clases no pertenecen a ningún grupo (group_id = null).
 * 
 * IMPORTANTE: Esta tabla es diferente de class_enrollments.
 * - class_enrollments: permite añadir atletas a clases base como "extras"
 * - athlete_extra_classes: relaciona atletas con clases que son específicamente "extra" (is_extra = true)
 */
export const athleteExtraClasses = pgTable(
  "athlete_extra_classes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    // Índice único para evitar duplicados: un atleta solo puede estar una vez en una clase extra
    uniqueEnrollment: uniqueIndex("athlete_extra_classes_unique").on(
      table.tenantId,
      table.athleteId,
      table.classId
    ),
    // Índices para queries comunes
    athleteIdx: index("athlete_extra_classes_athlete_id_idx").on(table.athleteId),
    classIdx: index("athlete_extra_classes_class_id_idx").on(table.classId),
    tenantIdx: index("athlete_extra_classes_tenant_id_idx").on(table.tenantId),
    academyIdx: index("athlete_extra_classes_academy_id_idx").on(table.academyId),
  })
);

