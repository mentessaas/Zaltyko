"use client";

/** Envía JSON a la API del panel y devuelve `data` (las respuestas usan apiSuccess/apiCreated). */
export async function sendCompetencia<T = Record<string, unknown>>(
  url: string,
  method: "POST" | "PUT" | "PATCH",
  body?: unknown
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      payload?.message ??
        payload?.error?.message ??
        payload?.error ??
        "No se pudo guardar"
    );
  }
  return (payload?.data ?? payload) as T;
}

export function emptyToNull(value: FormDataEntryValue | null): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text : null;
}

export function numberOrNull(value: FormDataEntryValue | null): number | null {
  const text = typeof value === "string" ? value.trim().replace(",", ".") : "";
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}
