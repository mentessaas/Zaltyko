import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { profiles } from "./profiles";
import { academyTypeEnum } from "./enums";

export const academyStatusValues = [
  "active",
  "trial",
  "suspended",
  "churned",
  "fraud_hold",
] as const;

export type AcademyStatus = (typeof academyStatusValues)[number];

export const academyFraudHoldReasonValues = [
  "payment_fraud_signal",
  "owner_identity_failure",
  "chargeback_threshold",
  "manual_review",
  "other",
] as const;

export type AcademyFraudHoldReason = (typeof academyFraudHoldReasonValues)[number];

export const academyChurnedReasonValues = [
  "trial_expired_no_payment",
  "owner_cancellation",
  "manual_closure",
  "other",
] as const;

export type AcademyChurnedReason = (typeof academyChurnedReasonValues)[number];

export const academies = pgTable(
  "academies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    name: text("name").notNull(),
    country: text("country"),
    countryCode: text("country_code"),
    region: text("region"),
    city: text("city"),
    academyType: academyTypeEnum("academy_type").notNull().default("artistica"),
    discipline: text("discipline"),
    disciplineVariant: text("discipline_variant"),
    federationConfigVersion: text("federation_config_version"),
    specializationStatus: text("specialization_status").notNull().default("legacy"),
    publicDescription: text("public_description"),
    isPublic: boolean("is_public").notNull().default(true),
    logoUrl: text("logo_url"),
    website: text("website"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    address: text("address"),
    socialInstagram: text("social_instagram"),
    socialFacebook: text("social_facebook"),
    socialTwitter: text("social_twitter"),
    socialYoutube: text("social_youtube"),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    /**
     * Status semántica de la academia. Modela el ciclo de vida más allá del
     * flag binario `is_suspended`. Valores:
     * - active:        pago al día, operativa.
     * - trial:         trial activo, aún no configuró pagos.
     * - suspended:     bloqueada temporalmente (típicamente por Soporte/Seguridad).
     * - churned:       estado terminal, no se enviá emails transaccionales soft.
     * - fraud_hold:    decisión de seguridad, congelada por sospecha de fraude.
     *                  Decisión humana, NUNCA auto-clear (criterio B3 §3.3 v0.2).
     *
     * Backfill: `20260805120000_academies_status_semantics.sql` rellena las filas
     * existentes desde `is_suspended` + `is_trial_active` durante la transición.
     * La transición mantiene `is_suspended` como flag por compatibilidad de UI
     * (super-admin toggle), pero el gate de envío (§6 spec v0.2) usa `status`.
     */
    status: text("status").notNull().default("active"),
    statusUpdatedAt: timestamp("status_updated_at", { withTimezone: true }),
    churnedAt: timestamp("churned_at", { withTimezone: true }),
    churnedReason: text("churned_reason"),
    churnedReasonNotes: text("churned_reason_notes"),
    fraudHoldAt: timestamp("fraud_hold_at", { withTimezone: true }),
    fraudHoldReason: text("fraud_hold_reason"),
    fraudHoldReasonNotes: text("fraud_hold_reason_notes"),
    fraudHoldActorId: uuid("fraud_hold_actor_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    fraudHoldClearedAt: timestamp("fraud_hold_cleared_at", { withTimezone: true }),
    fraudHoldClearedActorId: uuid("fraud_hold_cleared_actor_id").references(
      () => profiles.id,
      { onDelete: "set null" }
    ),
    isSuspended: boolean("is_suspended").notNull().default(false),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    trialStartsAt: timestamp("trial_starts_at", { withTimezone: true }),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    isTrialActive: boolean("is_trial_active").notNull().default(false),
    paymentsConfiguredAt: timestamp("payments_configured_at", { withTimezone: true }),
    // Settings extendidos
    timezone: text("timezone"),
    brandingColors: text("branding_colors"), // JSON con colores y fuentes
    scheduleConfig: text("schedule_config"), // JSON con horarios
    stripePublicKey: text("stripe_public_key"),
    stripeSecretKey: text("stripe_secret_key"),
    stripeWebhookSecret: text("stripe_webhook_secret"),
    taxId: text("tax_id"),
    invoicePrefix: text("invoice_prefix").default("INV"),
    /**
     * Atribución de registro del owner (ZAL-157 [GTM-DEP.1]). Captura
     * first-touch en sesión: el primer set de UTMs del visitante queda
     * persistido aquí al crear la academia. Si no hay UTMs al signup se
     * registra `direct/none/none/none/none` para mantener trazabilidad.
     * Validación: snake_case, lowercase, sin espacios (ver
     * `src/lib/growth/utm.ts#normalizeUtmValue`).
     */
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    utmTerm: text("utm_term"),
    utmContent: text("utm_content"),
    utmCapturedAt: timestamp("utm_captured_at", { withTimezone: true }),
  },
  (table) => ({
    tenantIdx: index("academies_tenant_id_idx").on(table.tenantId),
    publicIdx: index("academies_is_public_idx").on(table.isPublic),
    locationIdx: index("academies_location_idx").on(table.country, table.region, table.city),
    typeIdx: index("academies_type_idx").on(table.academyType),
    countryCodeIdx: index("academies_country_code_idx").on(table.countryCode),
    disciplineVariantIdx: index("academies_discipline_variant_idx").on(table.disciplineVariant),
    contactEmailIdx: index("academies_contact_email_idx").on(table.contactEmail),
    contactPhoneIdx: index("academies_contact_phone_idx").on(table.contactPhone),
    statusIdx: index("academies_status_idx").on(table.status),
    statusPublicIdx: index("academies_status_public_idx").on(
      table.status,
      table.isPublic
    ),
    utmSourceIdx: index("academies_utm_source_idx").on(table.utmSource),
    utmCapturedAtIdx: index("academies_utm_captured_at_idx").on(table.utmCapturedAt),
  })
);
