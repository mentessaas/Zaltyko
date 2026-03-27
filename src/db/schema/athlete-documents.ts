import { boolean, date, index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { athletes } from "./athletes";

export const documentTypeEnum = pgEnum("document_type", [
  "identity_document",
  "medical_certificate",
  "consent_form",
  "birth_certificate",
  "federative_license",
  "insurance",
  "photo",
  "other"
]);

export const athleteDocuments = pgTable(
  "athlete_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    documentType: text("document_type").notNull(),
    fileName: text("file_name").notNull(),
    fileUrl: text("file_url").notNull(),
    fileSize: text("file_size"),
    mimeType: text("mime_type"),
    issuedDate: date("issued_date"),
    expiryDate: date("expiry_date"),
    isVerified: boolean("is_verified").notNull().default(false),
    verifiedBy: uuid("verified_by"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    alertSent: boolean("alert_sent").notNull().default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("athlete_documents_tenant_idx").on(table.tenantId),
    athleteIdx: index("athlete_documents_athlete_idx").on(table.athleteId),
    typeIdx: index("athlete_documents_type_idx").on(table.documentType),
    expiryIdx: index("athlete_documents_expiry_idx").on(table.expiryDate),
  })
);

export type AthleteDocument = typeof athleteDocuments.$inferSelect;
export type NewAthleteDocument = typeof athleteDocuments.$inferInsert;
