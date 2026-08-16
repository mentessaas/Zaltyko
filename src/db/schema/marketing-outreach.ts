import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { academies } from "./academies";

/**
 * Outreach comercial manual 1:1 auditado (ZAL-582 / ZAL-580).
 *
 * Cada fila representa un intento de outreach realizado por Marketing o un
 * agente autorizado: el `idempotency_key` (UNIQUE) garantiza que un reintento
 * no duplica el evento. Los denominadores del reporte operativo (attempts,
 * replies, consented, demos_held, first_value, trials_started, paid_conversions)
 * se reconcilian contra esta tabla o contra `commercial_interviews` /
 * `growth_events` ya existentes; por diseño NO almacena PII de cliente.
 *
 * Las CHECKs duplican las del SQL (DDL 1:1 con
 * supabase/migrations/20260811120000_marketing_outreach.sql). RLS es
 * defense-in-depth: la app conecta con BYPASSRLS; el gate real es la API.
 */
export const marketingOutreach = pgTable(
  "marketing_outreach",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id"),
    campaignId: text("campaign_id").notNull(),
    channel: text("channel").notNull(),
    modality: text("modality"),
    countryCode: text("country_code"),
    city: text("city"),
    academyFingerprint: text("academy_fingerprint").notNull(),
    academyId: uuid("academy_id").references(() => academies.id, { onDelete: "set null" }),
    attemptNumber: integer("attempt_number").notNull().default(1),
    templateId: text("template_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    replyAt: timestamp("reply_at", { withTimezone: true }),
    replyKind: text("reply_kind"),
    consentAt: timestamp("consent_at", { withTimezone: true }),
    consentTextVersion: text("consent_text_version"),
    demoSessionId: uuid("demo_session_id"),
    source: text("source").notNull().default("agent"),
    createdByAgentId: text("created_by_agent_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idempotencyUnique: uniqueIndex("marketing_outreach_idempotency_unique").on(
      table.idempotencyKey
    ),
    campaignSentIdx: index("marketing_outreach_campaign_sent_idx").on(
      table.campaignId,
      table.sentAt
    ),
    tenantSentIdx: index("marketing_outreach_tenant_sent_idx").on(
      table.tenantId,
      table.sentAt
    ),
    academySentIdx: index("marketing_outreach_academy_sent_idx").on(
      table.academyFingerprint,
      table.sentAt
    ),
    replyIdx: index("marketing_outreach_reply_idx").on(table.replyAt),
    consentIdx: index("marketing_outreach_consent_idx").on(table.consentAt),
    demoIdx: index("marketing_outreach_demo_idx").on(table.demoSessionId),
    attemptNumberCheck: check(
      "marketing_outreach_attempt_number_check",
      sql`${table.attemptNumber} >= 1 and ${table.attemptNumber} <= 10`
    ),
    channelCheck: check(
      "marketing_outreach_channel_check",
      sql`${table.channel} in ('instagram_dm','whatsapp','email','phone','other')`
    ),
    modalityCheck: check(
      "marketing_outreach_modality_check",
      sql`${table.modality} is null or ${table.modality} in ('gymnastics_artistic','gymnastics_rythmics')`
    ),
    countryCodeCheck: check(
      "marketing_outreach_country_code_check",
      sql`${table.countryCode} is null or ${table.countryCode} ~ '^[A-Z]{2}$'`
    ),
    replyKindCheck: check(
      "marketing_outreach_reply_kind_check",
      sql`${table.replyKind} is null or ${table.replyKind} in ('interested','not_interested','unsubscribe','out_of_office','other')`
    ),
    consentTextVersionCheck: check(
      "marketing_outreach_consent_text_version_check",
      sql`${table.consentTextVersion} is null or ${table.consentTextVersion} ~ '^v[0-9]+-[0-9]{4}-[0-9]{2}-[0-9]{2}$'`
    ),
    timelineCheck: check(
      "marketing_outreach_timeline_check",
      sql`(${table.sentAt} is null or ${table.replyAt} is null or ${table.sentAt} <= ${table.replyAt}) and (${table.replyAt} is null or ${table.consentAt} is null or ${table.replyAt} <= ${table.consentAt})`
    ),
    consentImpliesVersionCheck: check(
      "marketing_outreach_consent_implies_version_check",
      sql`${table.consentAt} is null or (${table.consentTextVersion} is not null and length(${table.consentTextVersion}) > 0)`
    ),
    consentImpliesDemoSessionCheck: check(
      "marketing_outreach_consent_implies_demo_session_check",
      sql`${table.consentAt} is null or ${table.demoSessionId} is not null`
    ),
    sourceCheck: check(
      "marketing_outreach_source_check",
      sql`${table.source} in ('agent','manual','import','test')`
    ),
  })
);

export type MarketingOutreach = typeof marketingOutreach.$inferSelect;
export type NewMarketingOutreach = typeof marketingOutreach.$inferInsert;

export const MARKETING_OUTREACH_CHANNELS = [
  "instagram_dm",
  "whatsapp",
  "email",
  "phone",
  "other",
] as const;
export type MarketingOutreachChannel = (typeof MARKETING_OUTREACH_CHANNELS)[number];

export const MARKETING_OUTREACH_REPLY_KINDS = [
  "interested",
  "not_interested",
  "unsubscribe",
  "out_of_office",
  "other",
] as const;
export type MarketingOutreachReplyKind = (typeof MARKETING_OUTREACH_REPLY_KINDS)[number];

export const MARKETING_OUTREACH_SOURCES = ["agent", "manual", "import", "test"] as const;
export type MarketingOutreachSource = (typeof MARKETING_OUTREACH_SOURCES)[number];
