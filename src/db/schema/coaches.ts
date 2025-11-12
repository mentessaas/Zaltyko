import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { academies } from "./academies";

export const coaches = pgTable(
  "coaches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    bio: text("bio"),
    photoUrl: text("photo_url"),
    isPublic: boolean("is_public").notNull().default(false),
    specialties: text("specialties").array(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantAcademyIdx: index("coaches_tenant_academy_idx").on(table.tenantId, table.academyId),
    publicIdx: index("coaches_public_idx").on(table.isPublic),
  })
);

