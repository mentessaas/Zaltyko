import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const templates = pgTable(
  "templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    country: text("country").notNull(), // e.g., "España", "France"
    countryCode: text("country_code").notNull(), // e.g., "ES", "FR"
    discipline: text("discipline").notNull(), // e.g., "rhythmic", "artistic_female", "artistic_male"
    name: text("name").notNull(), // e.g., "España - Gimnasia Rítmica"
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    countryIdx: index("templates_country_idx").on(table.country),
    disciplineIdx: index("templates_discipline_idx").on(table.discipline),
    activeIdx: index("templates_active_idx").on(table.isActive),
  })
);

export type Template = typeof templates.$inferSelect;
export type NewTemplate = typeof templates.$inferInsert;
