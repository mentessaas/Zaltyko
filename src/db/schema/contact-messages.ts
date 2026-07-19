import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { academies } from "./academies";

export const contactMessages = pgTable(
  "contact_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    // Datos del contacto externo
    contactName: text("contact_name").notNull(),
    contactEmail: text("contact_email").notNull(),
    contactPhone: text("contact_phone"),
    message: text("message").notNull(),
    // Estado del mensaje
    read: boolean("read").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    responded: boolean("responded").notNull().default(false),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    academyIdx: index("contact_messages_academy_idx").on(table.academyId),
    readIdx: index("contact_messages_read_idx").on(table.read),
    createdAtIdx: index("contact_messages_created_at_idx").on(table.createdAt),
  })
);

