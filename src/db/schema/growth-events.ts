import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { academies } from "./academies";
import { profiles } from "./profiles";

/**
 * Fuente first-party para los hitos comerciales de mayor señal.
 *
 * PostHog/Vercel siguen cubriendo navegación y exploración, pero esta tabla
 * conserva los eventos que deben poder reconciliarse con academia, trial y
 * suscripción sin depender de un identificador de navegador.
 */
export const growthEvents = pgTable(
  "growth_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventName: text("event_name").notNull(),
    visitorId: text("visitor_id"),
    userId: uuid("user_id").references(() => profiles.userId, { onDelete: "set null" }),
    academyId: uuid("academy_id").references(() => academies.id, { onDelete: "set null" }),
    tenantId: uuid("tenant_id"),
    planCode: text("plan_code"),
    source: text("source").notNull().default("app"),
    properties: jsonb("properties").$type<Record<string, string | number | boolean | null>>(),
    idempotencyKey: text("idempotency_key"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    eventOccurredIdx: index("growth_events_event_occurred_idx").on(
      table.eventName,
      table.occurredAt
    ),
    academyOccurredIdx: index("growth_events_academy_occurred_idx").on(
      table.academyId,
      table.occurredAt
    ),
    visitorOccurredIdx: index("growth_events_visitor_occurred_idx").on(
      table.visitorId,
      table.occurredAt
    ),
    idempotencyUnique: uniqueIndex("growth_events_idempotency_unique").on(
      table.idempotencyKey
    ),
  })
);

export type GrowthEvent = typeof growthEvents.$inferSelect;
export type NewGrowthEvent = typeof growthEvents.$inferInsert;
