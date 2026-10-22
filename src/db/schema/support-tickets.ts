import { pgEnum, pgTable, uuid, varchar, text, timestamp, boolean, foreignKey, index } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";
import { academies } from "./academies";

// Enums para tickets
export const ticketStatusEnum = pgEnum("ticket_status", [
  "open",
  "in_progress",
  "waiting",
  "resolved",
  "closed",
]);

export const ticketPriorityEnum = pgEnum("ticket_priority", [
  "low",
  "medium",
  "high",
  "urgent",
]);

export const ticketCategoryEnum = pgEnum("ticket_category", [
  "technical",
  "billing",
  "account",
  "feature_request",
  "other",
]);

// Tabla de tickets
export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").notNull(),
    status: ticketStatusEnum("status").default("open").notNull(),
    priority: ticketPriorityEnum("priority").default("medium").notNull(),
    category: ticketCategoryEnum("category").notNull(),

    // Relaciones
    academyId: uuid("academy_id").references(() => academies.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    assignedTo: uuid("assigned_to").references(() => profiles.id, { onDelete: "set null" }),

    // Metadata
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
    closedAt: timestamp("closed_at"),
  },
  (table) => ({
    academyIdIdx: index("tickets_academy_id_idx").on(table.academyId),
    createdByIdx: index("tickets_created_by_idx").on(table.createdBy),
    assignedToIdx: index("tickets_assigned_to_idx").on(table.assignedTo),
    statusIdx: index("tickets_status_idx").on(table.status),
  })
);

// Tabla de respuestas a tickets
export const ticketResponses = pgTable(
  "ticket_responses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ticketId: uuid("ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    message: text("message").notNull(),
    isInternal: boolean("is_internal").default(false),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    ticketIdIdx: index("ticket_responses_ticket_id_idx").on(table.ticketId),
    userIdIdx: index("ticket_responses_user_id_idx").on(table.userId),
  })
);

// Tabla de adjuntos de tickets
export const ticketAttachments = pgTable(
  "ticket_attachments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ticketId: uuid("ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" }),
    responseId: uuid("response_id").references(() => ticketResponses.id, { onDelete: "cascade" }),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    fileUrl: varchar("file_url", { length: 500 }).notNull(),
    fileType: varchar("file_type", { length: 100 }),
    fileSize: varchar("file_size", { length: 20 }),

    uploadedBy: uuid("uploaded_by").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    ticketIdIdx: index("ticket_attachments_ticket_id_idx").on(table.ticketId),
    responseIdIdx: index("ticket_attachments_response_id_idx").on(table.responseId),
  })
);

// Tipos TypeScript
export type Ticket = typeof tickets.$inferSelect;
export type NewTicket = typeof tickets.$inferInsert;
export type TicketResponse = typeof ticketResponses.$inferSelect;
export type NewTicketResponse = typeof ticketResponses.$inferInsert;
export type TicketAttachment = typeof ticketAttachments.$inferSelect;
export type NewTicketAttachment = typeof ticketAttachments.$inferInsert;
