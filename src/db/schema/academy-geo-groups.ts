import { index, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { academies } from "./academies";

/**
 * Tabla para grupos geográficos de academias
 * Permite agrupar academias por ciudad/región/país para funcionalidades futuras
 */
export const academyGeoGroups = pgTable(
  "academy_geo_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    country: text("country"),
    region: text("region"),
    city: text("city"),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
  },
  (table) => ({
    academyIdx: index("academy_geo_groups_academy_id_idx").on(table.academyId),
    locationIdx: index("academy_geo_groups_location_idx").on(table.country, table.region, table.city),
  })
);

