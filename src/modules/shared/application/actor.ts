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
/**
 * Evaluaciones (insights, health score, métricas): una persona o el trabajo
 * del outbox. El proceso del cobro automático no puede lanzarlas. El tipo se
 * deja como SystemActor para no cambiar las firmas; la restricción es de
 * validación (todas las entradas de evaluación pasan por este esquema).
 */
export const evaluationActorSchema = z.union([
  operationalActorSchema,
  systemActorSchema.refine((actor) => actor.jobKey === OUTBOX_JOB_KEY, {
    message: "Solo el trabajo del outbox puede lanzar evaluaciones",
  }),
]);
export type EvaluationActor = z.infer<typeof evaluationActorSchema>;
