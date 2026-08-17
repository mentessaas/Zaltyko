/**
 * ZAL-138 [D-006 v0] — callback público que Supabase invoca después de
 * verificar el magic link. NO usa withTenant: la atleta todavía no tiene
 * perfil en Zaltyko, solo la sesión Supabase.
 *
 * Marca `magic_link_opened_at` en la invitación + crea el stub de atleta
 * y luego redirige al formulario de perfil.
 *
 * Rate limit por IP porque es público.
 */
import { NextResponse } from "next/server";

import { acceptInvitationByEmail } from "@/lib/athletes/invitations";
import { apiError } from "@/lib/api-response";
import {
  rateLimit,
  getClientIdentifier,
  getLimitForRoute,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

async function handleAccept(request: Request) {
  const limit = getLimitForRoute("/api/athlete-invitations/accept");
  const limited = await rateLimit({
    identifier: getClientIdentifier(request),
    ...limit,
  });
  if (!limited.success) {
    return apiError(
      "RATE_LIMIT_EXCEEDED",
      "Demasiados intentos. Vuelve a probar en unos minutos.",
      429
    );
  }

  const result = await acceptInvitationByEmail();

  if (!result) {
    // Sin invitación pendiente para el email actual: redirigir a una página
    // pública que explique el caso (link expirado, no invitado, etc.).
    const url = new URL(request.url);
    const fallback = new URL("/onboarding/athlete/expired", url.origin);
    return NextResponse.redirect(fallback, { status: 302 });
  }

  // Si ya completó el perfil, redirigir al portal limitado de atleta.
  // Si no, redirigir al formulario de perfil de first-athlete.
  const url = new URL(request.url);
  const next = result.status === "opened"
    ? new URL(
        `/onboarding/athlete/profile?invitation=${result.invitationId}`,
        url.origin
      )
    : new URL(`/portal/athlete`, url.origin);

  return NextResponse.redirect(next, { status: 302 });
}

export const GET = handleAccept;
export const POST = handleAccept;
