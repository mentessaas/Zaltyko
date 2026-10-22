import type { AcademyStatus } from "@/db/schema/academies";

/** Solo estos estados tienen permitido emitir señales SEO indexables. */
export const INDEXABLE_ACADEMY_STATUS_VALUES = ["active", "trial"] as const satisfies ReadonlyArray<AcademyStatus>;

export type AcademyIndexabilityInput = {
  status?: string | null;
  isSuspended?: boolean | null;
  isPublic?: boolean | null;
};

/**
 * Regla única para indexabilidad pública de academias.
 * Datos ausentes, nulos o desconocidos fallan cerrado.
 */
export function isAcademyIndexable(
  academy: AcademyIndexabilityInput | null | undefined
): boolean {
  if (!academy || academy.isPublic !== true || academy.isSuspended !== false) {
    return false;
  }

  return (
    academy.status === INDEXABLE_ACADEMY_STATUS_VALUES[0] ||
    academy.status === INDEXABLE_ACADEMY_STATUS_VALUES[1]
  );
}
