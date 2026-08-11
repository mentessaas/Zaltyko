/**
 * Schema Drizzle para `owner_consent` + `owner_consent_audit`.
 *
 * Companion a: supabase/migrations/20260808120000_owner_consent.sql
 *
 * Issue:    ZAL-158 [GTM-DEP.2] Consent gate tracking (server-side)
 * Parent:   ZAL-156 [GTM-DEP]
 * Spec:     vault/03-Negocio/RESEARCH/ZAL-158 owner_consent design v1 2026-08-08.md
 * Owner:    Web Developer (agent 5bcea506)
 *
 * Decisiones (ver design doc):
 *  - Consent por owner (no por academia).
 *  - `unset` NO se persiste. Cliente infiere "no hay fila".
 *  - Audit append-only enforced en DB (no en código).
 *  - MVP: source ∈ {signup, claim, settings}. `imported` rechazado en DB.
 */

import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { profiles } from "./profiles";

export const CONSENT_STATES = ["granted", "revoked"] as const;
export type ConsentStateDb = (typeof CONSENT_STATES)[number];

export const CONSENT_SOURCES = ["signup", "claim", "settings"] as const;
export type ConsentSourceDb = (typeof CONSENT_SOURCES)[number];

export const CONSENT_AUDIT_EVENTS = [
  "grant",
  "revoke",
  "policy_bump",
  "re_grant",
] as const;
export type ConsentAuditEventDb = (typeof CONSENT_AUDIT_EVENTS)[number];

/**
 * Tabla principal. Una fila por owner.
 *
 * - `owner_id` referencia `profiles.user_id` (no `profiles.id`): el subject
 *   del consent es la cuenta Auth, no la fila perfil interna.
 * - `state ∈ {granted, revoked}`. `unset` se infiere por ausencia de fila.
 * - `consent_proof` validado en DB con regex; la API valida Zod adicional.
 */
export const ownerConsent = pgTable(
  "owner_consent",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .unique()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    state: text("state").notNull().default("granted").$type<ConsentStateDb>(),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    policyVersion: text("policy_version").notNull(),
    source: text("source").notNull().$type<ConsentSourceDb>(),
    consentProof: text("consent_proof").notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revocationReason: text("revocation_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    policyVersionIdx: index("owner_consent_policy_version_idx").on(
      table.policyVersion
    ),
    // Constraints CHECK replican los del SQL para que `pnpm db:generate`
    // produzca migraciones que no rompan la DB al re-ejecutar.
    stateCheck: check(
      "owner_consent_state_check",
      sql`${table.state} IN ('granted', 'revoked')`
    ),
    sourceCheck: check(
      "owner_consent_source_check",
      sql`${table.source} IN ('signup', 'claim', 'settings')`
    ),
    policyVersionFormatCheck: check(
      "owner_consent_policy_version_format_check",
      sql`${table.policyVersion} ~ '^v[0-9]+-[0-9]{4}-[0-9]{2}-[0-9]{2}$'`
    ),
    consentProofFormatCheck: check(
      "owner_consent_consent_proof_format_check",
      sql`${table.consentProof} ~ '^(signup|claim|settings):[a-zA-Z0-9_-]{1,128}$'`
    ),
  })
);

/**
 * Audit log append-only. NO UPDATE, NO DELETE (enforced por trigger en SQL).
 */
export const ownerConsentAudit = pgTable(
  "owner_consent_audit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull(),
    event: text("event").notNull().$type<ConsentAuditEventDb>(),
    policyVersion: text("policy_version").notNull(),
    source: text("source").notNull().$type<ConsentSourceDb>(),
    consentProof: text("consent_proof").notNull(),
    actor: text("actor").notNull(),
    reason: text("reason"),
    previousAuditId: uuid("previous_audit_id"),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    ownerRecordedIdx: index("owner_consent_audit_owner_recorded_idx").on(
      table.ownerId,
      table.recordedAt
    ),
    eventRecordedIdx: index("owner_consent_audit_event_recorded_idx").on(
      table.event,
      table.recordedAt
    ),
    eventCheck: check(
      "owner_consent_audit_event_check",
      sql`${table.event} IN ('grant', 'revoke', 'policy_bump', 're_grant')`
    ),
    sourceCheck: check(
      "owner_consent_audit_source_check",
      sql`${table.source} IN ('signup', 'claim', 'settings')`
    ),
    policyVersionFormatCheck: check(
      "owner_consent_audit_policy_version_format_check",
      sql`${table.policyVersion} ~ '^v[0-9]+-[0-9]{4}-[0-9]{2}-[0-9]{2}$'`
    ),
    consentProofFormatCheck: check(
      "owner_consent_audit_consent_proof_format_check",
      sql`${table.consentProof} ~ '^(signup|claim|settings):[a-zA-Z0-9_-]{1,128}$'`
    ),
    actorFormatCheck: check(
      "owner_consent_audit_actor_format_check",
      sql`${table.actor} ~ '^(owner|system|admin):[a-zA-Z0-9_-]{1,128}$'`
    ),
  })
);

export type OwnerConsent = typeof ownerConsent.$inferSelect;
export type NewOwnerConsent = typeof ownerConsent.$inferInsert;
export type OwnerConsentAudit = typeof ownerConsentAudit.$inferSelect;
export type NewOwnerConsentAudit = typeof ownerConsentAudit.$inferInsert;
