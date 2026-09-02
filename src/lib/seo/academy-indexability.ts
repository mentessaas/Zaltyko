import type { AcademyStatus } from "@/db/schema/academies";

/**
 * Estados que pueden aparecer en el directorio público.
 *
 * La lista es deliberadamente explícita: un estado nuevo, nulo o desconocido
 * no debe ganar indexación por accidente.
 */
export const INDEXABLE_ACADEMY_STATUS_VALUES = [
  "active",
  "trial",
] as const satisfies ReadonlyArray<AcademyStatus>;

export type AcademyIndexabilityInput = {
  status?: string | null;
  isSuspended?: boolean | null;
  isPublic?: boolean | null;
};

/**
 * Única regla de indexación de academias.
 *
 * `isPublic` es opcional para permitir reutilizar el predicado después de un
 * query que ya haya aplicado el filtro público. Si se entrega, false bloquea.
 * Los datos incompletos quedan fuera (fail-closed).
 */
export function isAcademyIndexable(
  academy: AcademyIndexabilityInput | null | undefined
): boolean {
  if (!academy) return false;
  if (academy.isPublic === false) return false;
  if (academy.isSuspended !== false) return false;
  if (
    academy.status !== INDEXABLE_ACADEMY_STATUS_VALUES[0] &&
    academy.status !== INDEXABLE_ACADEMY_STATUS_VALUES[1]
  ) {
    return false;
  }
  return true;
}
