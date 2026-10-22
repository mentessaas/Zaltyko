import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { profiles } from "./profiles";

export const athleteImportBatchStatuses = [
  "processing",
  "completed",
  "failed",
  "rolled_back",
] as const;

export type AthleteImportBatchStatus = (typeof athleteImportBatchStatuses)[number];

/**
 * Una importación confirmada es un lote auditable, no una colección anónima
 * de inserts. `academyId` puede ser null cuando un super_admin importa filas
 * de varias academias en el mismo archivo; el alcance real sigue siendo
 * `tenantId` + las academias de los atletas del lote.
 */
export const athleteImportBatches = pgTable(
  "athlete_import_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    academyId: uuid("academy_id").references(() => academies.id, { onDelete: "cascade" }),
    initiatedBy: uuid("initiated_by").references(() => profiles.userId, { onDelete: "set null" }),
    fileHash: text("file_hash").notNull(),
    totalRows: integer("total_rows").notNull().default(0),
    createdCount: integer("created_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    status: text("status").$type<AthleteImportBatchStatus>().notNull().default("processing"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    rolledBackAt: timestamp("rolled_back_at", { withTimezone: true }),
  },
  (table) => ({
    tenantCreatedIdx: index("athlete_import_batches_tenant_created_idx").on(table.tenantId, table.createdAt),
    academyCreatedIdx: index("athlete_import_batches_academy_created_idx").on(table.academyId, table.createdAt),
    statusIdx: index("athlete_import_batches_status_idx").on(table.status),
    fileHashIdx: index("athlete_import_batches_file_hash_idx").on(table.fileHash),
  }),
);
