import { z } from "zod";

const restrictedPayloadKey =
  /(^|_)(name|email|phone|address|birth|medical|diagnosis|health|document|guardian)(_|$)/i;

function normalizePayloadKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
}

export const domainEventSchema = z.object({
  eventId: z.guid(),
  eventName: z.string().regex(/^[a-z][a-z0-9_-]*\.[a-z][a-z0-9_.-]*$/),
  eventVersion: z.number().int().positive(),
  organizationId: z.guid(),
  locationId: z.guid().nullable(),
  occurredAt: z.string().datetime({ offset: true }),
  actor: z.object({
    type: z.enum(["user", "system", "integration"]),
    id: z.guid().nullable(),
  }),
  entity: z.object({
    type: z.string().trim().min(1),
    id: z.guid(),
  }),
  idempotencyKey: z.string().trim().min(8).max(200),
  payload: z.record(z.string(), z.unknown()),
});

export type DomainEvent = z.infer<typeof domainEventSchema>;

function findRestrictedKey(
  value: unknown,
  path: readonly string[] = []
): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const match = findRestrictedKey(value[index], [...path, String(index)]);
      if (match) return match;
    }
    return null;
  }

  if (value === null || typeof value !== "object") return null;

  for (const [key, nestedValue] of Object.entries(value)) {
    const nextPath = [...path, key];
    if (restrictedPayloadKey.test(normalizePayloadKey(key)))
      return nextPath.join(".");
    const nestedMatch = findRestrictedKey(nestedValue, nextPath);
    if (nestedMatch) return nestedMatch;
  }

  return null;
}

export function assertAnalyticsSafePayload(
  payload: Record<string, unknown>
): void {
  const restrictedKey = findRestrictedKey(payload);
  if (restrictedKey) {
    throw new Error(
      `El evento contiene un campo restringido: ${restrictedKey}`
    );
  }
}

export function parseDomainEvent(input: unknown): DomainEvent {
  const event = domainEventSchema.parse(input);
  assertAnalyticsSafePayload(event.payload);
  return event;
}
