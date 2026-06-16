import { boolean, index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { templates } from "./templates";

export const templateLicenseConfig = pgTable(
  "template_license_config",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" })
      .unique(),
    requiredForCompetition: boolean("required_for_competition").notNull().default(true),
    requiredForTraining: boolean("required_for_training").notNull().default(false),
    renewalMonths: integer("renewal_months").notNull().default(12),
    // Required documents
    documentsRequired: jsonb("documents_required").default([]), // JSON array of document types
    // Fees
    annualFeeCents: integer("annual_fee_cents"), // Optional fee
    medicalCertificateRequired: boolean("medical_certificate_required").notNull().default(true),
    medicalCertificateValidityMonths: integer("medical_certificate_validity_months").notNull().default(12),
  },
  (table) => ({
    templateIdx: index("template_license_config_template_idx").on(table.templateId),
  })
);

export type TemplateLicenseConfig = typeof templateLicenseConfig.$inferSelect;
export type NewTemplateLicenseConfig = typeof templateLicenseConfig.$inferInsert;
