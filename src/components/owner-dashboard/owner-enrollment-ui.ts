import type { EnrollmentBundle, StatusFilter } from "./owner-enrollment-types";
import { ownerTone } from "./owner-tone-ui";
import { ownerUi } from "./owner-ui";

// Inscripciones comparte la base de /owner: campos, botón principal en tapiz
// y secundario de cinta blanca, sin la variante cuadrada slate/teal anterior.
export const fieldClassName = ownerUi.field;

export const primaryButtonClassName = ownerUi.primaryButton;

export const secondaryButtonClassName = ownerUi.secondaryButton;

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "Pendiente",
    trial: "Prueba",
    active: "Activa",
    paused: "En pausa",
    cancelled: "Baja",
    completed: "Finalizada",
  };
  return labels[status] ?? "Estado desconocido";
}

// Chip de cinta por estado: activa en tapiz, pendiente en ocre de aviso, en
// pausa en polvo (reposo) y el resto (prueba, baja, finalizada) en blanco.
export function statusTone(status: string): string {
  if (status === "active") return ownerTone.chipActive;
  if (status === "pending") return ownerTone.chipWarning;
  if (status === "paused") return ownerTone.chipRest;
  return ownerTone.chipOutline;
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value + "T12:00:00Z"));
}

export function statusHref(
  bundle: EnrollmentBundle,
  status: StatusFilter,
  page = 1,
  locationId = bundle.filterLocationId ?? ""
): string {
  const params = new URLSearchParams({
    organizationId: bundle.organization.id,
  });
  if (locationId) params.set("locationId", locationId);
  if (status !== "all") params.set("status", status);
  if (page > 1) params.set("page", String(page));
  return "/owner/enrollments?" + params.toString();
}

export function monthlyInvoicesHref(
  organizationId: string,
  locationId?: string | null
): string {
  const params = new URLSearchParams({ organizationId });
  if (locationId) params.set("locationId", locationId);
  return "/owner/monthly-invoices?" + params.toString();
}
