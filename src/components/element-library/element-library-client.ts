import {
  ELEMENT_LIBRARY_UNAVAILABLE_REASON,
  type CatalogApparatus,
  type CatalogDiscipline,
} from "@/modules/element-library/domain/element-library";
import type {
  CatalogElementCard,
  CatalogSearchResult,
  SaveElementNoteResult,
} from "@/modules/element-library/domain/library-requests";

/**
 * Cliente de las rutas de la biblioteca de elementos. Todas las respuestas
 * usan apiSuccess/problem+json: aquí solo se desempaqueta `data` y se traduce
 * el 503 «no disponible» (bandera apagada o candidatas sin aplicar).
 */

export type LibraryFetchResult<T> =
  | { status: "ok"; data: T }
  | { status: "unavailable" }
  | { status: "error"; message: string; code: number };

export const LIBRARY_UNAVAILABLE_MESSAGE = "La biblioteca de elementos todavía no está disponible en tu academia.";

const GENERIC_ERROR = "No se ha podido completar la acción. Comprueba la conexión e inténtalo de nuevo.";

function problemDetail(payload: unknown): string | null {
  if (payload && typeof payload === "object" && "detail" in payload) {
    const detail = (payload as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return null;
}

function unavailableReason(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || !("errors" in payload)) return null;
  const errors = (payload as { errors?: unknown }).errors;
  if (!errors || typeof errors !== "object" || !("reason" in errors)) return null;
  const reason = (errors as { reason?: unknown }).reason;
  return typeof reason === "string" ? reason : null;
}

async function request<T>(url: string, init?: RequestInit): Promise<LibraryFetchResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", ...init });
  } catch {
    return { status: "error", message: GENERIC_ERROR, code: 0 };
  }
  const payload: unknown = await response.json().catch(() => null);
  // Solo el 503 de la biblioteca apagada o sin instalar es «no disponible».
  if (response.status === 503 && unavailableReason(payload) === ELEMENT_LIBRARY_UNAVAILABLE_REASON) {
    return { status: "unavailable" };
  }
  if (!response.ok) {
    return { status: "error", message: problemDetail(payload) ?? GENERIC_ERROR, code: response.status };
  }
  if (payload && typeof payload === "object" && "data" in payload) {
    return { status: "ok", data: (payload as { data: T }).data };
  }
  return { status: "error", message: GENERIC_ERROR, code: response.status };
}

export type LibraryScope = { organizationId: string; locationId: string };

export type CatalogSearchFilters = {
  discipline: CatalogDiscipline;
  apparatus?: CatalogApparatus | null;
  group?: string | null;
  /** Letra («D») o puntos («4,20»). */
  value?: string | null;
  q?: string | null;
};

export function searchCatalog(scope: LibraryScope, filters: CatalogSearchFilters) {
  const params = new URLSearchParams({ ...scope, discipline: filters.discipline });
  if (filters.apparatus) params.set("apparatus", filters.apparatus);
  if (filters.group) params.set("group", filters.group);
  if (filters.value?.trim()) params.set("value", filters.value.trim());
  if (filters.q?.trim()) params.set("q", filters.q.trim());
  return request<CatalogSearchResult>(`/api/v1/owner/element-library?${params.toString()}`);
}

export function fetchCatalogElement(scope: LibraryScope, elementId: string) {
  const params = new URLSearchParams(scope);
  return request<CatalogElementCard>(
    `/api/v1/owner/element-library/${encodeURIComponent(elementId)}?${params.toString()}`
  );
}

export function putElementNote(
  scope: LibraryScope,
  elementId: string,
  body: { expectedRevision: number | null; note: string | null }
) {
  return request<SaveElementNoteResult>(`/api/v1/owner/element-library/${encodeURIComponent(elementId)}/note`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...scope, clientRequestId: crypto.randomUUID(), ...body }),
  });
}
