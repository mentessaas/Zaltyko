import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

import { requireCronAuth } from "@/lib/cron-auth";
import type { SystemActor } from "@/modules/shared/application/actor";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const systemActorContext = new AsyncLocalStorage<SystemActor>();

export type CronActorResult<T> =
  { ok: true; value: T } | { ok: false; response: Response };

/** The only runtime issuer for a system actor: a valid CRON_SECRET request. */
export async function withCronSystemActor<T>(
  request: Request,
  job: (actor: SystemActor) => Promise<T>
): Promise<CronActorResult<T>> {
  const authError = requireCronAuth(request);
  if (authError) return { ok: false, response: authError };

  const actor: SystemActor = {
    type: "system",
    jobKey: "zaltyko-outbox",
    correlationId: randomUUID(),
  };
  return {
    ok: true,
    value: await systemActorContext.run(actor, () => job(actor)),
  };
}

export function assertCurrentCronSystemActor(actor: SystemActor): void {
  const current = systemActorContext.getStore();
  if (
    !current ||
    current.type !== actor.type ||
    current.jobKey !== actor.jobKey ||
    current.correlationId !== actor.correlationId
  ) {
    throw new OperationalError(
      "FORBIDDEN",
      "El actor de sistema no procede de una petición cron autenticada",
      403
    );
  }
}
