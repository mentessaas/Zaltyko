import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { profiles } from "./profiles";
import { academyTypeEnum } from "./enums";

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
    specializationStatus: text("specialization_status")
      .notNull()
      .default("legacy"),
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
    isSuspended: boolean("is_suspended").notNull().default(false),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    trialStartsAt: timestamp("trial_starts_at", { withTimezone: true }),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    isTrialActive: boolean("is_trial_active").notNull().default(false),
    paymentsConfiguredAt: timestamp("payments_configured_at", {
      withTimezone: true,
    }),
    // Settings extendidos
    timezone: text("timezone"),
    brandingColors: text("branding_colors"), // JSON con colores y fuentes
    scheduleConfig: text("schedule_config"), // JSON con horarios
    stripePublicKey: text("stripe_public_key"),
    stripeSecretKey: text("stripe_secret_key"),
    stripeWebhookSecret: text("stripe_webhook_secret"),
    taxId: text("tax_id"),
    invoicePrefix: text("invoice_prefix").default("INV"),
    // ZAL-157 [GTM-DEP.1] — atribución first-touch de UTMs en signup.
    // Taxonomía reconciliada §4 (RESEARCH/DATA_GOVERNANCE_TAXONOMY_GTM.md):
    // google_ads, meta_ads, tiktok_ads, instagram, tiktok, facebook,
    // linkedin, whatsapp, resend_email, google_organic, google (alias).
    // Vacío/null = tráfico direct sin UTM.
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    utmTerm: text("utm_term"),
    utmContent: text("utm_content"),
    utmCapturedAt: timestamp("utm_captured_at", { withTimezone: true }),
    utmLandingPath: text("utm_landing_path"),
    // ZAL-159 [GTM-DEP.3] — canal de atribución first-touch del registro.
    // Persistido por el trigger BEFORE INSERT/UPDATE OF utm_source,utm_medium
    // definido en `drizzle/0008_academies_canal_registro.sql`. La API TS
    // también lo calcula vía `derivar_canal()` para devolver el valor en la
    // respuesta sin un roundtrip extra. Regla: paid > social > email >
    // organic > direct. UTM ausente o inválido queda en `direct`.
    canalRegistro: text("canal_registro"),
  },
  (table) => ({
    tenantIdx: index("academies_tenant_id_idx").on(table.tenantId),
    publicIdx: index("academies_is_public_idx").on(table.isPublic),
    locationIdx: index("academies_location_idx").on(
      table.country,
      table.region,
      table.city
    ),
    typeIdx: index("academies_type_idx").on(table.academyType),
    countryCodeIdx: index("academies_country_code_idx").on(table.countryCode),
    disciplineVariantIdx: index("academies_discipline_variant_idx").on(
      table.disciplineVariant
    ),
    contactEmailIdx: index("academies_contact_email_idx").on(
      table.contactEmail
    ),
    contactPhoneIdx: index("academies_contact_phone_idx").on(
      table.contactPhone
    ),
    utmSourceIdx: index("academies_utm_source_idx").on(table.utmSource),
    utmMediumIdx: index("academies_utm_medium_idx").on(table.utmMedium),
  })
);
