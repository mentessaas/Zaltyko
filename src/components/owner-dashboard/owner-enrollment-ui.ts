import type { EnrollmentBundle, StatusFilter } from "./owner-enrollment-types";

export const fieldClassName =
  "min-h-11 w-full border border-slate-400 bg-white px-3 py-2 text-sm text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:bg-slate-100";

export const primaryButtonClassName =
  "touch-target inline-flex min-h-11 items-center justify-center gap-2 bg-teal-800 px-4 py-2 text-sm font-bold text-white hover:bg-teal-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:cursor-not-allowed disabled:opacity-50";

export const secondaryButtonClassName =
  "touch-target inline-flex min-h-11 items-center justify-center gap-2 border border-slate-400 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:cursor-not-allowed disabled:opacity-50";

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

export function statusTone(status: string): string {
  if (status === "active")
    return "border-emerald-300 bg-emerald-50 text-emerald-900";
  if (status === "pending")
    return "border-amber-300 bg-amber-50 text-amber-950";
  if (status === "paused")
    return "border-orange-300 bg-orange-50 text-orange-950";
  return "border-slate-300 bg-slate-100 text-slate-800";
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
