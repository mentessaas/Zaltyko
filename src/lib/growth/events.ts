import { db } from "@/db";
import { growthEvents } from "@/db/schema";
import { logger } from "@/lib/logger";

type GrowthProperty = string | number | boolean | null;

interface RecordGrowthEventParams {
  eventName: string;
  visitorId?: string | null;
  userId?: string | null;
  academyId?: string | null;
  tenantId?: string | null;
  planCode?: string | null;
  source: string;
  properties?: Record<string, GrowthProperty>;
  idempotencyKey?: string | null;
  occurredAt?: Date;
}

/**
 * La instrumentación nunca debe romper una acción de negocio. Los fallos se
 * registran para diagnóstico y el caller continúa con su resultado original.
 */
export async function recordGrowthEvent(params: RecordGrowthEventParams): Promise<boolean> {
  try {
    await db
      .insert(growthEvents)
      .values({
        eventName: params.eventName,
        visitorId: params.visitorId ?? null,
        userId: params.userId ?? null,
        academyId: params.academyId ?? null,
        tenantId: params.tenantId ?? null,
        planCode: params.planCode ?? null,
        source: params.source,
        properties: params.properties ?? {},
        idempotencyKey: params.idempotencyKey ?? null,
        occurredAt: params.occurredAt ?? new Date(),
      })
      .onConflictDoNothing({ target: growthEvents.idempotencyKey });

    return true;
  } catch (error) {
    logger.warn("Failed to persist growth event", {
      eventName: params.eventName,
      academyId: params.academyId,
      error,
    });
    return false;
  }
}
