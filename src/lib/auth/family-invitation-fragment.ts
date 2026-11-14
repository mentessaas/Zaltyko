/**
 * Token de invitación al portal de familias: vive solo en la memoria de este
 * documento, nunca en almacenamiento. Mismo diseño que
 * team-invitation-fragment.ts: se lee del fragmento exacto `#token=…`, se
 * limpia la dirección antes de la telemetría y se entrega una sola vez.
 */
export const FAMILY_INVITATION_PATH = "/familia/aceptar";

let pendingToken: string | null = null;

/** La llama la instrumentación del navegador antes de iniciar SDKs, y la página. */
export function captureFamilyInvitationFragment(): boolean {
  if (typeof window === "undefined" || window.location.pathname !== FAMILY_INVITATION_PATH) {
    pendingToken = null;
    return false;
  }
  const fragment = window.location.hash;
  if (fragment || window.location.search) {
    // Rechaza campos ambiguos o de más en vez de extraer una credencial de ellos.
    const match = /^#token=([A-Za-z0-9_-]{43})$/.exec(fragment);
    pendingToken = null;
    try {
      window.history.replaceState(window.history.state, "", FAMILY_INVITATION_PATH);
      pendingToken = match?.[1] ?? null;
    } catch {
      // Nunca se expone la credencial si no se pudo limpiar la dirección.
      pendingToken = null;
    }
  }
  return true;
}

/** Una navegación abandona la credencial no consumida. */
export function discardFamilyInvitationToken(): void {
  pendingToken = null;
}

/** La página la toma una vez; las lecturas siguientes no la revelan. */
export function takeFamilyInvitationToken(): string | null {
  const token = pendingToken;
  pendingToken = null;
  return token;
}
