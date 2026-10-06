import { z } from "zod";

export const operationalActorSchema = z.object({
  userId: z.string().uuid(),
  memberId: z.string().uuid(),
});

export type OperationalActor = z.infer<typeof operationalActorSchema>;
