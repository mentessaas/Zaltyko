import { z } from "zod";

export const operationalActorSchema = z.object({
  userId: z.guid(),
  memberId: z.guid(),
});

export type OperationalActor = z.infer<typeof operationalActorSchema>;

/** Trabajo del outbox (procesa eventos y evaluaciones). */
export const OUTBOX_JOB_KEY = "zaltyko-outbox" as const;
/** Proceso diario del cobro automático de cuotas (Fase 3). */
export const FAMILY_COLLECTION_JOB_KEY = "zaltyko-family-collection" as const;

/** Internal job identity; never construct from request body or reuse a member. */
export const systemActorSchema = z.object({
  type: z.literal("system"),
  jobKey: z.enum([OUTBOX_JOB_KEY, FAMILY_COLLECTION_JOB_KEY]),
  correlationId: z.guid(),
});

export type SystemActor = z.infer<typeof systemActorSchema>;
export const evaluationActorSchema = z.union([
  operationalActorSchema,
  systemActorSchema,
]);
export type EvaluationActor = z.infer<typeof evaluationActorSchema>;
