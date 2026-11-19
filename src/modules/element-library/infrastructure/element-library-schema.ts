import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { organizationMembers, organizations, zaltyko } from "@/db/schema/zaltyko-core";

/**
 * Biblioteca de elementos (ADR-0029 §1, §2 y §8).
 *
 * Espejo de las candidatas SQL
 * docs/deployment/candidates/20261119120000_element_library_candidate.sql y
 * docs/deployment/candidates/20261119120500_element_library_notes_candidate.sql,
 * que requieren autorización de Elvis y no están aplicadas en ningún entorno.
 *
 * Igual que los demás candidatos, NO se exporta desde `src/db/schema/index.ts`
 * ni desde `src/db/zaltyko-schema.ts`, y `drizzle.config.ts` no lo lee: un
 * `db:generate`/`push` crearía estas tablas sin RLS ni REVOKE. Al promover las
 * candidatas a migraciones reales, este archivo pasa a `src/db/schema/`.
 * Las claves foráneas a miembros del equipo son `on delete set null (columna)`
 * en el SQL (Drizzle no expresa la lista de columnas): el espejo solo las
 * declara, y por eso esas columnas son opcionales.
 *
 * Las columnas `catalog_element_id` que la candidata añade a `skill_elements`
 * y `session_plan_blocks` viven en los espejos de esos módulos
 * (ELEMENT_LIBRARY_LINK_COLUMNS las enumera).
 * tests/element-library-contract.test.ts comprueba que las candidatas, este
 * archivo y ELEMENT_LIBRARY_TABLES describen las mismas tablas y columnas.
 */

/**
 * Las expresiones CHECK se escriben con el mismo texto que la candidata para
 * que el test de contrato las compare literalmente.
 */
const raw = (expression: string) => sql.raw(expression);

export const catalogElementEditions = zaltyko.table(
  "catalog_element_editions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    discipline: text("discipline").notNull(),
    cycleStart: integer("cycle_start").notNull(),
    cycleEnd: integer("cycle_end").notNull(),
    title: text("title").notNull(),
    documentUrl: text("document_url").notNull(),
    coverDate: date("cover_date").notNull(),
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("catalog_element_editions_code_uq").on(table.code),
    check("catalog_element_editions_code_check", raw("code in ('fig-wag-2025-2028', 'fig-mag-2025-2028')")),
    check("catalog_element_editions_discipline_check", raw("discipline in ('artistic_female', 'artistic_male')")),
    check(
      "catalog_element_editions_code_discipline_check",
      raw(
        "(code = 'fig-wag-2025-2028' and discipline = 'artistic_female') or (code = 'fig-mag-2025-2028' and discipline = 'artistic_male')"
      )
    ),
    check("catalog_element_editions_cycle_check", raw("cycle_end > cycle_start")),
    check(
      "catalog_element_editions_title_check",
      raw("length(btrim(title)) >= 1 and length(title) <= 200 and title !~ '[[:cntrl:]]'")
    ),
    check(
      "catalog_element_editions_document_url_check",
      raw("length(document_url) <= 500 and document_url ~ '^https://' and document_url !~ '[[:space:][:cntrl:]]'")
    ),
    check("catalog_element_editions_status_check", raw("status in ('draft', 'published', 'retired')")),
  ]
);

export const catalogElements = zaltyko.table(
  "catalog_elements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    editionId: uuid("edition_id")
      .notNull()
      .references(() => catalogElementEditions.id, { onDelete: "restrict" }),
    elementKey: text("element_key").notNull(),
    discipline: text("discipline").notNull(),
    apparatus: text("apparatus").notNull(),
    elementGroup: text("element_group").notNull(),
    valueLetter: text("value_letter"),
    valuePoints: numeric("value_points", { precision: 4, scale: 2 }),
    figReference: text("fig_reference"),
    name: text("name").notNull(),
    shortName: text("short_name").notNull(),
    description: text("description"),
    sourcePage: integer("source_page").notNull(),
    sourceCheckedOn: date("source_checked_on").notNull(),
    draftedBy: text("drafted_by").notNull(),
    draftedOn: date("drafted_on").notNull(),
    batch: integer("batch").notNull(),
    reviewStatus: text("review_status").notNull().default("draft"),
    reviewedOn: date("reviewed_on"),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    withdrawnReason: text("withdrawn_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("catalog_elements_edition_key_uq").on(table.editionId, table.elementKey),
    index("catalog_elements_browse_idx").on(table.editionId, table.apparatus, table.elementGroup),
    check("catalog_elements_key_check", raw("element_key ~ '^[a-z][a-z0-9_]{2,63}$'")),
    check("catalog_elements_discipline_check", raw("discipline in ('artistic_female', 'artistic_male')")),
    check(
      "catalog_elements_apparatus_check",
      raw(
        "(discipline = 'artistic_female' and apparatus in ('vault', 'uneven_bars', 'beam', 'floor')) or (discipline = 'artistic_male' and apparatus in ('floor', 'pommel_horse', 'rings', 'vault', 'parallel_bars', 'high_bar'))"
      )
    ),
    check("catalog_elements_group_check", raw("element_group ~ '^[A-Za-z0-9_-]{1,20}$'")),
    check("catalog_elements_value_letter_check", raw("value_letter is null or value_letter ~ '^[A-J]$'")),
    check("catalog_elements_value_points_check", raw("value_points is null or value_points > 0")),
    check("catalog_elements_value_one_check", raw("(value_letter is null) <> (value_points is null)")),
    check("catalog_elements_value_points_vault_check", raw("value_points is null or apparatus = 'vault'")),
    check(
      "catalog_elements_fig_reference_check",
      raw(
        "fig_reference is null or (length(btrim(fig_reference)) >= 1 and length(fig_reference) <= 20 and fig_reference !~ '[[:cntrl:]]')"
      )
    ),
    check(
      "catalog_elements_name_check",
      raw("length(btrim(name)) >= 2 and length(name) <= 100 and name !~ '[[:cntrl:]]'")
    ),
    check(
      "catalog_elements_short_name_check",
      raw("length(btrim(short_name)) >= 1 and length(short_name) <= 40 and short_name !~ '[[:cntrl:]]'")
    ),
    check(
      "catalog_elements_description_check",
      raw(
        "description is null or (length(btrim(description)) >= 1 and length(description) <= 300 and description !~ '[[:cntrl:]]')"
      )
    ),
    check("catalog_elements_source_page_check", raw("source_page > 0")),
    check("catalog_elements_drafted_by_check", raw("length(btrim(drafted_by)) >= 1 and length(drafted_by) <= 40")),
    check("catalog_elements_batch_check", raw("batch > 0")),
    check("catalog_elements_review_status_check", raw("review_status in ('draft', 'reviewed')")),
    check("catalog_elements_reviewed_on_check", raw("(review_status = 'reviewed') = (reviewed_on is not null)")),
    check("catalog_elements_withdrawn_check", raw("(withdrawn_at is null) = (withdrawn_reason is null)")),
    check(
      "catalog_elements_withdrawn_reason_check",
      raw(
        "withdrawn_reason is null or (length(btrim(withdrawn_reason)) >= 1 and length(withdrawn_reason) <= 500)"
      )
    ),
  ]
);

export const contentNotices = zaltyko.table(
  "content_notices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    senderName: text("sender_name"),
    senderEmail: text("sender_email"),
    contentUrl: text("content_url").notNull(),
    contentKind: text("content_kind").notNull(),
    contentKey: text("content_key"),
    reason: text("reason").notNull(),
    goodFaithConfirmed: boolean("good_faith_confirmed").notNull(),
    status: text("status").notNull().default("received"),
    response: text("response"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    senderErasedAt: timestamp("sender_erased_at", { withTimezone: true }),
    submissionHash: text("submission_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("content_notices_submission_hash_uq").on(table.submissionHash),
    index("content_notices_status_idx").on(table.status, table.closedAt),
    check(
      "content_notices_sender_name_check",
      raw(
        "sender_name is null or (length(btrim(sender_name)) >= 1 and length(sender_name) <= 120 and sender_name !~ '[[:cntrl:]]')"
      )
    ),
    check(
      "content_notices_sender_email_check",
      raw(
        "sender_email is null or (length(sender_email) <= 254 and sender_email ~ '^[^[:space:][:cntrl:]@]+@[^[:space:][:cntrl:]@]+$')"
      )
    ),
    check(
      "content_notices_sender_check",
      raw(
        "(sender_erased_at is null and sender_name is not null and sender_email is not null) or (sender_erased_at is not null and sender_name is null and sender_email is null)"
      )
    ),
    check(
      "content_notices_content_url_check",
      raw("length(btrim(content_url)) >= 1 and length(content_url) <= 500 and content_url !~ '[[:space:][:cntrl:]]'")
    ),
    check("content_notices_content_kind_check", raw("content_kind in ('element', 'federation_template', 'other')")),
    check(
      "content_notices_content_key_check",
      raw("content_key is null or (length(content_key) between 1 and 64 and content_key !~ '[[:space:][:cntrl:]]')")
    ),
    check("content_notices_reason_check", raw("length(btrim(reason)) >= 10 and length(reason) <= 2000")),
    check("content_notices_good_faith_check", raw("good_faith_confirmed = true")),
    check("content_notices_status_check", raw("status in ('received', 'reviewing', 'closed')")),
    check(
      "content_notices_response_check",
      raw("response is null or (length(btrim(response)) >= 1 and length(response) <= 2000)")
    ),
    check("content_notices_closed_check", raw("(status = 'closed') = (closed_at is not null)")),
    check("content_notices_submission_hash_check", raw("submission_hash ~ '^[0-9a-f]{64}$'")),
  ]
);

export const contentWithdrawals = zaltyko.table(
  "content_withdrawals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    key: text("key").notNull(),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }).notNull().defaultNow(),
    reason: text("reason").notNull(),
    noticeId: uuid("notice_id").references(() => contentNotices.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("content_withdrawals_kind_key_uq").on(table.kind, table.key),
    index("content_withdrawals_notice_idx").on(table.noticeId),
    check("content_withdrawals_kind_check", raw("kind in ('federation_template')")),
    check(
      "content_withdrawals_key_check",
      raw("length(key) between 1 and 64 and key !~ '[[:space:][:cntrl:]]'")
    ),
    check("content_withdrawals_reason_check", raw("length(btrim(reason)) >= 1 and length(reason) <= 500")),
  ]
);

export const academyElementNotes = zaltyko.table(
  "academy_element_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    catalogElementId: uuid("catalog_element_id")
      .notNull()
      .references(() => catalogElements.id, { onDelete: "restrict" }),
    note: text("note").notNull(),
    revision: integer("revision").notNull().default(1),
    createdByMemberId: uuid("created_by_member_id"),
    updatedByMemberId: uuid("updated_by_member_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("academy_element_notes_org_id_uq").on(table.organizationId, table.id),
    unique("academy_element_notes_element_uq").on(table.organizationId, table.catalogElementId),
    index("academy_element_notes_element_idx").on(table.catalogElementId),
    index("academy_element_notes_created_by_idx").on(table.organizationId, table.createdByMemberId),
    index("academy_element_notes_updated_by_idx").on(table.organizationId, table.updatedByMemberId),
    check("academy_element_notes_note_check", raw("length(btrim(note)) >= 1 and length(note) <= 500")),
    check("academy_element_notes_revision_check", raw("revision > 0")),
    foreignKey({
      name: "academy_element_notes_created_by_fk",
      columns: [table.organizationId, table.createdByMemberId],
      foreignColumns: [organizationMembers.organizationId, organizationMembers.id],
    }),
    foreignKey({
      name: "academy_element_notes_updated_by_fk",
      columns: [table.organizationId, table.updatedByMemberId],
      foreignColumns: [organizationMembers.organizationId, organizationMembers.id],
    }),
  ]
);

/**
 * Columnas exactas de cada tabla de las candidatas, en orden alfabético. La
 * detección de almacenamiento de la aplicación exige este conjunto (ni una
 * columna más ni una menos) antes de usar la biblioteca.
 */
export const ELEMENT_LIBRARY_TABLES = {
  academy_element_notes: [
    "catalog_element_id",
    "created_at",
    "created_by_member_id",
    "id",
    "note",
    "organization_id",
    "revision",
    "updated_at",
    "updated_by_member_id",
  ],
  catalog_element_editions: [
    "code",
    "cover_date",
    "created_at",
    "cycle_end",
    "cycle_start",
    "discipline",
    "document_url",
    "id",
    "status",
    "title",
    "updated_at",
  ],
  catalog_elements: [
    "apparatus",
    "batch",
    "created_at",
    "description",
    "discipline",
    "drafted_by",
    "drafted_on",
    "edition_id",
    "element_group",
    "element_key",
    "fig_reference",
    "id",
    "name",
    "review_status",
    "reviewed_on",
    "short_name",
    "source_checked_on",
    "source_page",
    "updated_at",
    "value_letter",
    "value_points",
    "withdrawn_at",
    "withdrawn_reason",
  ],
  content_notices: [
    "closed_at",
    "content_key",
    "content_kind",
    "content_url",
    "created_at",
    "good_faith_confirmed",
    "id",
    "reason",
    "received_at",
    "response",
    "sender_email",
    "sender_erased_at",
    "sender_name",
    "status",
    "submission_hash",
    "updated_at",
  ],
  content_withdrawals: ["created_at", "id", "key", "kind", "notice_id", "reason", "withdrawn_at"],
} as const satisfies Record<string, readonly string[]>;

export type ElementLibraryTable = keyof typeof ELEMENT_LIBRARY_TABLES;

/** Columnas que la candidata añade a tablas de otros módulos (enlace opcional). */
export const ELEMENT_LIBRARY_LINK_COLUMNS = {
  skill_elements: ["catalog_element_id"],
  session_plan_blocks: ["catalog_element_id"],
} as const;
