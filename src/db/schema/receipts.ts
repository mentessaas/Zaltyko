import { index, jsonb, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { date } from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { athletes } from "./athletes";
import { charges } from "./charges";
import { profiles } from "./profiles";

export const receipts = pgTable(
  "receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    chargeId: uuid("charge_id").references(() => charges.id, { onDelete: "set null" }),
    athleteId: uuid("athlete_id").references(() => athletes.id, { onDelete: "set null" }),
    receiptNumber: text("receipt_number").notNull(),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("EUR"),
    paymentMethod: text("payment_method"),
    paymentDate: date("payment_date"),
    pdfUrl: text("pdf_url"),
    templateId: text("template_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantAcademyIdx: index("receipts_tenant_academy_idx").on(table.tenantId, table.academyId),
    chargeIdx: index("receipts_charge_idx").on(table.chargeId),
    athleteIdx: index("receipts_athlete_idx").on(table.athleteId),
    receiptNumberIdx: index("receipts_receipt_number_idx").on(table.receiptNumber),
    receiptNumberUnique: index("receipts_number_unique").on(table.academyId, table.receiptNumber),
  })
);

