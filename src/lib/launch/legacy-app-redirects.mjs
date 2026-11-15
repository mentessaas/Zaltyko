// El panel antiguo /app (esquema legacy, con datos de salud de gimnastas) se
// retiró. Sus URLs responden un redirect permanente desde next.config.mjs
// (antes del middleware y del App Router) al equivalente de /owner, /familia o
// al inicio de /owner cuando no hay equivalente.
//
// El academyId de la URL antigua NO se reutiliza: /owner vuelve a resolver
// organización y sede desde la identidad autenticada (ADR-0007).
//
// Mapa del primer segmento tras /app/:academyId. Cualquier otro segmento
// (dashboard, reports, events, assessments, announcements, messages, settings,
// support, whatsapp, licenses, documentos de gimnasta…) acaba en /owner.
/** @type {Readonly<Record<string, string>>} */
export const LEGACY_APP_SEGMENT_DESTINATIONS = Object.freeze({
  athletes: "/owner/athletes",
  classes: "/owner/classes",
  groups: "/owner/groups",
  attendance: "/owner/attendance",
  coach: "/owner/attendance",
  coaches: "/owner/staff",
  billing: "/owner/payments",
  trials: "/owner/requests",
  "my-dashboard": "/familia",
  "my-events": "/familia",
});

export const LEGACY_APP_FALLBACK = "/owner";

/** Destino en /owner (o /familia) de un primer segmento del antiguo /app/:academyId/. */
export function ownerPathForLegacyAppSegment(segment) {
  return (segment && LEGACY_APP_SEGMENT_DESTINATIONS[segment]) || LEGACY_APP_FALLBACK;
}

/** @type {ReadonlyArray<readonly [source: string, destination: string]>} */
export const LEGACY_APP_REDIRECTS = Object.freeze([
  ...Object.entries(LEGACY_APP_SEGMENT_DESTINATIONS).flatMap(([segment, destination]) => [
    [`/app/:academyId/${segment}`, destination],
    [`/app/:academyId/${segment}/:path*`, destination],
  ]),
  // /app, /app/:academyId, /app/athlete|coach|supplier/:id/public-page y el
  // resto de subrutas sin equivalente.
  ["/app", LEGACY_APP_FALLBACK],
  ["/app/:path*", LEGACY_APP_FALLBACK],
]);

/**
 * Destino que da LEGACY_APP_REDIRECTS a una URL del antiguo /app, o null si la
 * ruta no es de /app. Sirve a las pruebas; next.config.mjs aplica la lista.
 */
export function legacyAppDestination(pathname) {
  const parts = pathname.split("?")[0].split("/").filter(Boolean);
  if (parts[0] !== "app") return null;
  return ownerPathForLegacyAppSegment(parts[2]);
}
