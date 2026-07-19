import { index, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { classes } from "./classes";
import { athletes } from "./athletes";
import { academies } from "./academies";

/**
 * classEnrollments - Tabla de inscripciones extra de atletas a clases
 * 
 * Permite que un atleta pueda estar en clases adicionales sin cambiar su grupo principal.
 * Los atletas del grupo base ya pertenecen a sus clases vía classGroups, pero esta tabla
 * permite añadir atletas de otros grupos como "extras" a clases específicas.
 * 
 * IMPORTANTE: Esta tabla NO afecta la facturación, que sigue basada en el grupo principal.
 */
export const classEnrollments = pgTable(
  "class_enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    // Índice único para evitar duplicados: un atleta solo puede estar una vez en una clase
    uniqueEnrollment: uniqueIndex("class_enrollments_unique").on(
      table.tenantId,
      table.classId,
      table.athleteId
    ),
    // Índices para queries comunes
    classIdx: index("class_enrollments_class_idx").on(table.classId),
    athleteIdx: index("class_enrollments_athlete_idx").on(table.athleteId),
    tenantIdx: index("class_enrollments_tenant_idx").on(table.tenantId),
    academyIdx: index("class_enrollments_academy_idx").on(table.academyId),
  })
);

