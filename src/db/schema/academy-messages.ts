import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { academies } from "./academies";

/**
 * Tabla para mensajes entre academias
 * Preparada para funcionalidad futura de comunicación entre academias
 */
export const academyMessages = pgTable(
  "academy_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    senderAcademyId: uuid("sender_academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    receiverAcademyId: uuid("receiver_academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (table) => ({
    senderIdx: index("academy_messages_sender_idx").on(table.senderAcademyId),
    receiverIdx: index("academy_messages_receiver_idx").on(table.receiverAcademyId),
    createdAtIdx: index("academy_messages_created_at_idx").on(table.createdAt),
  })
);

