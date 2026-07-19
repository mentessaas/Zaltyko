import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { membershipRoleEnum, profileRoleEnum } from "./enums";
import { profiles } from "./profiles";

export const academyLinkRequests = pgTable(
  "academy_link_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "cascade" }),
    targetProfileId: uuid("target_profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    requestedByProfileId: uuid("requested_by_profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    requestedProfileRole: profileRoleEnum("requested_profile_role").notNull(),
    requestedMembershipRole: membershipRoleEnum("requested_membership_role").notNull(),
    status: text("status").notNull().default("pending"),
    message: text("message"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    academyStatusIdx: index("academy_link_requests_academy_status_idx").on(
      table.academyId,
      table.status
    ),
    targetStatusIdx: index("academy_link_requests_target_status_idx").on(
      table.targetProfileId,
      table.status
    ),
    pendingUnique: uniqueIndex("academy_link_requests_pending_unique")
      .on(table.academyId, table.targetProfileId)
      .where(sql`status = 'pending'`),
  })
);
