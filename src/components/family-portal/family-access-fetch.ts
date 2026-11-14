/**
 * Petición JSON a las rutas del acceso de familias y de los avisos, con una
 * clave de idempotencia nueva por intento del usuario. Nunca muestra detalles
 * técnicos: solo el mensaje que devuelve el servidor o uno genérico.
 */
export type FamilyFetchResult<T> = { ok: true; data: T } | { ok: false; status: number; message: string };

const GENERIC = "No se pudo completar la acción. Vuelve a intentarlo en unos minutos.";

function newKey(): string {
  try {
    return window.crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}-family`;
  }
}

export async function familyRequest<T>(
  path: string,
  body: unknown,
  options: { method?: "POST" | "PUT"; idempotencyKey?: string } = {}
): Promise<FamilyFetchResult<T>> {
  try {
    const response = await fetch(path, {
      method: options.method ?? "POST",
      cache: "no-store",
      credentials: "same-origin",
      referrerPolicy: "no-referrer",
      headers: { "Content-Type": "application/json", "Idempotency-Key": options.idempotencyKey ?? newKey() },
      body: JSON.stringify(body),
    });
    const payload: unknown = await response.json().catch(() => null);
    const record = payload !== null && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
    if (response.ok && record?.ok === true) return { ok: true, data: record.data as T };
    const message = typeof record?.message === "string" && record.message.trim() ? record.message : GENERIC;
    return { ok: false, status: response.status, message };
  } catch {
    return { ok: false, status: 0, message: GENERIC };
  }
}
