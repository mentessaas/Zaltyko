import { date, index, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const personTypeEnum = pgEnum("person_type", ["athlete", "coach", "judge"]);
export const licenseStatusEnum = pgEnum("license_status", ["active", "expired", "suspended", "pending"]);

export const federativeLicenses = pgTable(
  "federative_licenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    personId: uuid("person_id").notNull(),
    personType: text("person_type").notNull(),
    licenseNumber: text("license_number").notNull(),
    licenseType: text("license_type").notNull(),
    federation: text("federation").notNull(),
    country: text("country").notNull().default("ES"),
    validFrom: date("valid_from").notNull(),
    validUntil: date("valid_until").notNull(),
    medicalCertificateExpiry: date("medical_certificate_expiry"),
    status: text("status").notNull().default("active"),
    annualFeeCents: integer("annual_fee_cents"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("federative_licenses_tenant_idx").on(table.tenantId),
    personIdx: index("federative_licenses_person_idx").on(table.personId),
    statusIdx: index("federative_licenses_status_idx").on(table.status),
    validUntilIdx: index("federative_licenses_valid_until_idx").on(table.validUntil),
    licenseNumberIdx: index("federative_licenses_license_number_idx").on(table.licenseNumber),
  })
);

export type FederativeLicense = typeof federativeLicenses.$inferSelect;
export type NewFederativeLicense = typeof federativeLicenses.$inferInsert;
