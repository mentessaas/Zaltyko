import { integer, pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { coaches } from "./coaches";
import { athletes } from "./athletes";
import { billingItems } from "./billing-items";

export const groups = pgTable(
  "groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    discipline: text("discipline").notNull(),
    level: text("level"),
    coachId: uuid("coach_id").references(() => coaches.id, { onDelete: "set null" }),
    assistantIds: uuid("assistant_ids").array(),
    color: text("color"),
    monthlyFeeCents: integer("monthly_fee_cents"), // Cuota mensual por defecto del grupo (en céntimos)
    billingItemId: uuid("billing_item_id").references(() => billingItems.id, { onDelete: "set null" }), // Concepto de cobro asociado (opcional)
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("groups_tenant_idx").on(table.tenantId),
    academyIdx: index("groups_academy_idx").on(table.academyId),
    coachIdx: index("groups_coach_idx").on(table.coachId),
  })
);

export const groupAthletes = pgTable(
  "group_athletes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    customFeeCents: integer("custom_fee_cents"), // Cuota personalizada para este atleta en este grupo (becas/descuentos, en céntimos)
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("group_athletes_tenant_idx").on(table.tenantId),
    groupIdx: index("group_athletes_group_idx").on(table.groupId),
    athleteIdx: index("group_athletes_athlete_idx").on(table.athleteId),
  })
);
