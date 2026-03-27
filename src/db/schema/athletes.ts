import { date, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { groups } from "./groups";
import { profiles } from "./profiles";
import { templates } from "./templates/templates";

export const athletes = pgTable(
  "athletes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => profiles.userId, { onDelete: "set null" }),
    name: text("name").notNull(),
    dob: date("dob"),
    level: text("level"),
    status: text("status").notNull().default("active"),
    /**
     * @deprecated Usar groupAthletes en lugar de este campo para la pertenencia a grupos
     */
    groupId: uuid("group_id").references(() => groups.id, { onDelete: "set null" }),
    // Template de la academia (para categorías, niveles, aparatos)
    templateId: uuid("template_id").references(() => templates.id, { onDelete: "set null" }),
    // Categoría de edad calculada automáticamente de DOB + template
    ageCategory: text("age_category"),
    // Nivel competitivo (ej: "Pre-iniciación", "Iniciación", "Alevín", "Infantil", etc.)
    competitiveLevel: text("competitive_level"),
    // Aparato principal para conjuntos/individual
    primaryApparatus: text("primary_apparatus"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    tenantAcademyIdx: index("athletes_tenant_academy_idx").on(table.tenantId, table.academyId),
    userIdIdx: index("athletes_user_id_idx").on(table.userId),
    deletedAtIdx: index("athletes_deleted_at_idx").on(table.deletedAt),
    statusIdx: index("athletes_status_idx").on(table.status),
    // Índice compuesto para queries comunes de académicos con filtro de status
    academyStatusIdx: index("athletes_academy_status_idx").on(table.academyId, table.status),
  })
);

