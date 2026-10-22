import { resolveUserId } from "@/lib/authz/user-resolver";

/**
 * Tipo de usuario actual mínimo para el contexto de actor-pages.
 * Sustituye el `CurrentUser` global cuando solo necesitamos el id.
 */
export type CurrentUser = {
  id: string; // userId (auth.uid)
};

/**
 * Resuelve el usuario actual desde el Request.
 * Helper ligero para route handlers — delega en resolveUserId.
 */
export async function getCurrentUser(
  request?: Request
): Promise<CurrentUser | null> {
  const req =
    request ??
    (typeof Request !== "undefined"
      ? new Request("http://internal/current-user")
      : undefined);
  if (!req) return null;
  const userId = await resolveUserId(req);
  if (!userId) return null;
  return { id: userId };
}
