import { sql } from "drizzle-orm";

import { db } from "@/db";
import type { TransactionClient } from "@/lib/db-transactions";
import { OperationalError } from "@/modules/shared/domain/operational-error";

/**
 * Transacción de una operación de asignación. Orden de cerrojos común a todas
 * (sin ciclos):
 *   1. petición (`lockAssignmentRequest`, por clientRequestId);
 *   2. fila de la academia (`for update`, lo toma assertOperationalAccess con
 *      intent "write", igual que el resto de escrituras de /owner);
 *   3. plantilla de clase (`lockTemplateSessions`, el mismo que la generación
 *      de sesiones, que también llega después de la academia);
 *   4. filas de sesión (`for update`), en orden de id.
 * Si aun así PostgreSQL aborta por interbloqueo o serialización, se responde
 * 409 reintentable en vez de 500.
 */
const RETRYABLE_PG_CODES = new Set(["40P01", "40001", "55P03"]);

function pgCode(error: unknown): string | null {
  for (let current: unknown = error, depth = 0; current && depth < 4; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

export function isRetryableAssignmentConflict(error: unknown): boolean {
  const code = pgCode(error);
  return code !== null && RETRYABLE_PG_CODES.has(code);
}

export async function inAssignmentTransaction<T>(work: (tx: TransactionClient) => Promise<T>): Promise<T> {
  try {
    return await db.transaction(work);
  } catch (error) {
    if (error instanceof OperationalError) throw error;
    if (isRetryableAssignmentConflict(error)) {
      throw new OperationalError(
        "VERSION_CONFLICT",
        "Otra operación estaba cambiando estas entrenadoras a la vez. Vuelve a intentarlo.",
        409,
        { retryable: true }
      );
    }
    throw error;
  }
}

/**
 * Cerrojo de la plantilla: el mismo que toma
 * session-service.insertTemplateSessionsInRange. Una generación en curso
 * hereda las titulares de antes o las de después, nunca una mezcla, y un
 * cambio de titulares y una sustitución de la misma clase no se cruzan.
 */
export async function lockTemplateSessions(
  tx: TransactionClient,
  organizationId: string,
  classTemplateId: string
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`${organizationId}:sessions:${classTemplateId}`}, 0))`
  );
}
