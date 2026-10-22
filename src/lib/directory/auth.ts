import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { apiError } from "@/lib/api-response";
import { ZodError } from "zod";
import { DirectoryError } from "./service";
import { flag } from "./contracts";
import { logger } from "@/lib/logger";
export async function directoryUser() {
  const client = await createClient(await cookies());
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user || !user.email || user.is_anonymous)
    throw new DirectoryError(
      "UNAUTHENTICATED",
      "Inicia sesión con tu cuenta",
      401
    );
  if (!user.email_confirmed_at)
    throw new DirectoryError(
      "EMAIL_UNVERIFIED",
      "Confirma tu correo antes de continuar",
      403
    );
  const [profile] = await db
    .select({ disabled: profiles.isSuspended, canLogin: profiles.canLogin })
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);
  if (profile && (profile.disabled || !profile.canLogin))
    throw new DirectoryError(
      "ACCOUNT_DISABLED",
      "Tu cuenta está desactivada",
      403
    );
  return { id: user.id, email: user.email };
}
export async function directoryRequest(
  request: Request,
  handler: (user: { id: string; email: string }) => Promise<Response>
) {
  try {
    if (!flag("catalog"))
      return apiError(
        "DIRECTORY_DISABLED",
        "El directorio todavía no está activo",
        503
      );
    const origin = request.headers.get("origin");
    if (
      request.method !== "GET" &&
      origin &&
      origin !== new URL(request.url).origin
    )
      throw new DirectoryError("INVALID_ORIGIN", "Origen no permitido", 403);
    const user = await directoryUser();
    const allowed = await rateLimit({
      identifier: `directory:${user.id}`,
      limit: 30,
      window: 60,
    });
    if (!allowed.success)
      throw new DirectoryError(
        "RATE_LIMITED",
        "Espera un momento antes de continuar",
        429
      );
    return await handler(user);
  } catch (error) {
    return directoryFailure(error);
  }
}
export function directoryFailure(error: unknown) {
  if (error instanceof DirectoryError)
    return apiError(error.code, error.message, error.status);
  if (error instanceof SyntaxError)
    return apiError("INVALID_JSON", "El contenido enviado no es válido", 400);
  if (error instanceof ZodError)
    return apiError(
      "INVALID_DATA",
      "Revisa los campos indicados",
      400,
      error.flatten()
    );
  logger.error("Directory operation failed", {
    type: error instanceof Error ? error.name : "unknown",
  });
  return apiError(
    "DIRECTORY_ERROR",
    "No se pudo completar la operación. Inténtalo de nuevo.",
    500
  );
}
