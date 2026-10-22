import {
  boolean,
  index,
  integer,
  jsonb,
  pgSchema,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { academies } from "./academies";
import { events } from "./events";
import type { EntryData } from "@/lib/directory/contracts";
// References only: auth is managed by Supabase, never created by directory migrations.
const authUsers = pgSchema("auth").table("users", {
  id: uuid("id").primaryKey(),
});
const id = () => uuid("id").defaultRandom().primaryKey();
const time = (name: string) => timestamp(name, { withTimezone: true });
const created = () => time("created_at").defaultNow().notNull();
export const directoryEntries = pgTable(
  "directory_entries",
  {
    id: id(),
    kind: text("kind").notNull(),
    data: jsonb("data").$type<EntryData>().notNull(),
    slug: text("slug").notNull(),
    publication: text("publication").default("draft").notNull(),
    representation: text("representation").default("unclaimed").notNull(),
    academyId: uuid("academy_id")
      .unique()
      .references(() => academies.id, { onDelete: "set null" }),
    eventId: uuid("event_id")
      .unique()
      .references(() => events.id, { onDelete: "set null" }),
    mergedInto: uuid("merged_into").references(
      (): AnyPgColumn => directoryEntries.id
    ),
    reviewedAt: time("reviewed_at"),
    updatedAt: time("updated_at").defaultNow().notNull(),
    createdAt: created(),
  },
  (t) => [
    index("directory_entries_public_idx").on(t.kind, t.publication),
    index("directory_entries_country_idx").on(sql`(${t.data}->>'countryCode')`),
    index("directory_entries_date_idx").on(sql`(${t.data}->>'startDate')`),
    index("directory_entries_merged_idx").on(t.mergedInto),
  ]
);
export const directoryGrants = pgTable(
  "directory_grants",
  {
    entryId: uuid("entry_id")
      .primaryKey()
      .references(() => directoryEntries.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id),
    approvedBy: uuid("approved_by")
      .notNull()
      .references(() => authUsers.id),
    approvedAt: time("approved_at").defaultNow().notNull(),
  },
  (t) => [
    index("directory_grants_user_idx").on(t.userId),
    index("directory_grants_approver_idx").on(t.approvedBy),
  ]
);
export const directoryClaims = pgTable(
  "directory_claims",
  {
    id: id(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => directoryEntries.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id),
    relationship: text("relationship").notNull(),
    evidence: text("evidence"),
    evidencePath: text("evidence_path"),
    status: text("status").default("pending").notNull(),
    decision: text("decision"),
    decidedBy: uuid("decided_by").references(() => authUsers.id),
    decidedAt: time("decided_at"),
    retainEvidence: boolean("retain_evidence").default(false).notNull(),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("directory_claims_pending_idx")
      .on(t.entryId, t.userId)
      .where(sql`${t.status} IN ('pending','disputed')`),
    index("directory_claims_user_idx").on(t.userId),
    index("directory_claims_decider_idx").on(t.decidedBy),
  ]
);
export const directoryRevisions = pgTable(
  "directory_revisions",
  {
    id: id(),
    entryId: uuid("entry_id").references(() => directoryEntries.id),
    userId: uuid("user_id").references(() => authUsers.id),
    kind: text("kind").notNull(),
    data: jsonb("data").notNull(),
    baseVersion: time("base_version"),
    status: text("status").default("pending").notNull(),
    decision: text("decision"),
    createdAt: created(),
    decidedAt: time("decided_at"),
  },
  (t) => [
    index("directory_revisions_entry_idx").on(t.entryId),
    index("directory_revisions_user_idx").on(t.userId),
  ]
);
export const directorySources = pgTable("directory_sources", {
  id: id(),
  name: text("name").notNull(),
  url: text("url").unique().notNull(),
  countryCode: text("country_code").notNull(),
  adapter: text("adapter").default("manual").notNull(),
  termsUrl: text("terms_url"),
  authorization: text("authorization"),
  enabled: boolean("enabled").default(false).notNull(),
  checkedAt: time("checked_at"),
  lastError: text("last_error"),
  lastResult: jsonb("last_result"),
});
export const directoryBatches = pgTable(
  "directory_batches",
  {
    id: id(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => directorySources.id),
    fingerprint: text("fingerprint").notNull(),
    status: text("status").default("pending").notNull(),
    summary: jsonb("summary").default({}).notNull(),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("directory_batches_source_fingerprint_idx").on(
      t.sourceId,
      t.fingerprint
    ),
  ]
);
export const directoryImportRows = pgTable(
  "directory_import_rows",
  {
    id: id(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => directoryBatches.id),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => directorySources.id),
    externalId: text("external_id").notNull(),
    entryId: uuid("entry_id").references(() => directoryEntries.id),
    candidate: jsonb("candidate").notNull(),
    error: text("error"),
    status: text("status").default("pending").notNull(),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("directory_import_rows_batch_external_idx").on(
      t.batchId,
      t.externalId
    ),
    index("directory_import_rows_source_idx").on(t.sourceId, t.externalId),
    index("directory_import_rows_entry_idx").on(t.entryId),
  ]
);
export const directoryFavorites = pgTable(
  "directory_favorites",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => directoryEntries.id),
    createdAt: created(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.entryId] }),
    index("directory_favorites_entry_idx").on(t.entryId),
  ]
);
export const directorySubscriptions = pgTable(
  "directory_subscriptions",
  {
    id: id(),
    userId: uuid("user_id").references(() => authUsers.id),
    email: text("email").notNull(),
    purpose: text("purpose").notNull(),
    filters: jsonb("filters").default({}).notNull(),
    policyVersion: text("policy_version").notNull(),
    source: text("source").notNull(),
    confirmedAt: time("confirmed_at"),
    withdrawnAt: time("withdrawn_at"),
    tokenHash: text("token_hash").unique().notNull(),
    tokenExpiresAt: time("token_expires_at").notNull(),
    bounceAt: time("bounce_at"),
    complaintAt: time("complaint_at"),
    createdAt: created(),
  },
  (t) => [
    index("directory_subscriptions_user_idx").on(t.userId),
    uniqueIndex("directory_subscriptions_active_idx")
      .on(sql`lower(${t.email})`, t.purpose, sql`md5(${t.filters}::text)`)
      .where(sql`${t.withdrawnAt} IS NULL`),
  ]
);
export const directoryDeliveries = pgTable(
  "directory_deliveries",
  {
    id: id(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => directorySubscriptions.id),
    dedupeKey: text("dedupe_key").unique().notNull(),
    status: text("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    leaseUntil: time("lease_until"),
    providerId: text("provider_id"),
    error: text("error"),
    createdAt: created(),
    sentAt: time("sent_at"),
  },
  (t) => [index("directory_deliveries_subscription_idx").on(t.subscriptionId)]
);
export const directoryAudit = pgTable(
  "directory_audit",
  {
    id: id(),
    entryId: uuid("entry_id").references(() => directoryEntries.id),
    actorId: uuid("actor_id").references(() => authUsers.id),
    action: text("action").notNull(),
    metadata: jsonb("metadata").default({}).notNull(),
    createdAt: created(),
  },
  (t) => [
    index("directory_audit_entry_idx").on(t.entryId),
    index("directory_audit_actor_idx").on(t.actorId),
  ]
);
