import { z } from "zod";

export const operationalActorSchema = z.object({
  userId: z.string().uuid(),
  memberId: z.string().uuid(),
});

export type OperationalActor = z.infer<typeof operationalActorSchema>;

/** Internal job identity; never construct from request body or reuse a member. */
export const systemActorSchema = z.object({
  type: z.literal("system"),
  jobKey: z.literal("zaltyko-outbox"),
  correlationId: z.string().uuid(),
});

export type SystemActor = z.infer<typeof systemActorSchema>;
export const evaluationActorSchema = z.union([
  operationalActorSchema,
  systemActorSchema,
]);
export type EvaluationActor = z.infer<typeof evaluationActorSchema>;
