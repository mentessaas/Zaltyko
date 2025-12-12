import { db } from "@/db";
import { eventLogs } from "@/db/schema";

export type EventType =
  | "academy_created"
  | "group_created"
  | "athlete_created"
  | "charge_created"
  | "charge_marked_paid";

interface LogEventParams {
  academyId?: string | null;
  eventType: EventType;
  metadata?: Record<string, unknown>;
}

/**
 * Logs a business event to the event_logs table.
 * This is used for tracking key actions across the platform for analytics and monitoring.
 */
export async function logEvent({ academyId, eventType, metadata }: LogEventParams): Promise<void> {
  try {
    await db.insert(eventLogs).values({
      academyId: academyId || null,
      eventType,
      metadata: metadata || null,
    });
  } catch (error) {
    // Don't throw errors for logging failures - log to console instead
    console.error("Failed to log event:", { academyId, eventType, error });
  }
}

