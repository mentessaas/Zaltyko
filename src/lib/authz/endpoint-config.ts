/**
 * Configuración de endpoints que requieren casos especiales de autenticación/autorización
 */

export interface EndpointConfig {
  /** Endpoints que pueden acceder sin tenantId (públicos o especiales) */
  publicEndpoints: string[];
  /** Endpoints que pueden obtener tenantId del body/params */
  flexibleTenantEndpoints: string[];
  /** Endpoints que requieren tenantId pero pueden obtenerlo de academyId */
  academyBasedEndpoints: string[];
}

/**
 * Determina si un endpoint es público (no requiere tenantId)
 */
export function isPublicEndpoint(pathname: string, method: string): boolean {
  const publicPatterns = [
    { path: "/api/academies", method: "GET" },
    { path: "/api/public", method: "GET" },
  ];

  return publicPatterns.some(
    (pattern) => pathname.startsWith(pattern.path) && method === pattern.method
  );
}

/**
 * Determina si un endpoint puede crear academias (no requiere tenantId inicial)
 */
export function isAcademyCreationEndpoint(pathname: string, method: string): boolean {
  return method === "POST" && pathname.startsWith("/api/academies");
}

/**
 * Determina si un endpoint puede obtener tenantId de forma flexible
 */
export function isFlexibleTenantEndpoint(pathname: string): boolean {
  const flexiblePatterns = [
    "/api/dashboard/",
    "/api/tooltips",
    "/api/groups",
    "/api/athletes",
    "/api/events",
  ];

  return flexiblePatterns.some((pattern) => pathname.startsWith(pattern));
}

/**
 * Extrae el academyId de diferentes fuentes (header, path, query)
 */
export function extractAcademyId(
  request: Request,
  context?: { params?: Record<string, string> }
): string | undefined {
  // Desde header
  const headerAcademyId = request.headers.get("x-academy-id");
  if (headerAcademyId) {
    return headerAcademyId;
  }

  // Desde params (rutas dinámicas)
  const paramAcademyId = context?.params?.academyId;
  if (paramAcademyId) {
    return paramAcademyId;
  }

  // Desde pathname (rutas como /api/dashboard/[academyId])
  const pathname = new URL(request.url).pathname;
  const dashboardMatch = pathname.match(/^\/api\/dashboard\/([^/]+)/);
  if (dashboardMatch) {
    return dashboardMatch[1];
  }

  // Desde query params
  const url = new URL(request.url);
  const queryAcademyId = url.searchParams.get("academyId");
  if (queryAcademyId) {
    return queryAcademyId;
  }

  return undefined;
}

