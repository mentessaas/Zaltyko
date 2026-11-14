import type { OwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";

/**
 * Misma frontera que registrar un pago a mano: solo propiedad o administración.
 * Un recordatorio escribe a una familia en nombre de la academia y muestra
 * saldos, así que ni el rol de gestión ni el de entrenador llegan aquí.
 */
export function requireReminderRole(role: string): void {
  if (role !== "owner" && role !== "admin") {
    throw new OperationalError(
      "FORBIDDEN",
      "Solo la propiedad o administración puede enviar recordatorios de cuotas",
      403
    );
  }
}

/** Sedes que el usuario puede ver; sin ninguna, no hay nada que recordar. */
export function visibleLocationIds(scope: Pick<OwnerScope, "selectedLocationId" | "locations">): string[] {
  const ids = scope.selectedLocationId ? [scope.selectedLocationId] : scope.locations.map((location) => location.id);
  if (ids.length === 0) {
    throw new OperationalError(
      "LOCATION_SCOPE_DENIED",
      "La academia necesita una sede accesible para enviar recordatorios",
      403
    );
  }
  return ids;
}
