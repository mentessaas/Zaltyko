import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/current-user";
import { assertAcademyOwner } from "@/lib/actor-pages/guard";

/**
 * POST /api/academy/subdomain
 * Body: { academyId, enabled }
 * Activa/desactiva el subdominio [academySlug].zaltyko.com.
 *
 * TODO(2026-09-24): añadir columnas `public_slug` y `subdomain_enabled` a `academies`
 * en una migration y propagar al schema Drizzle. Por ahora este endpoint devuelve
 * 410 Gone para no escribir columnas inexistentes. El owner debe pedir el
 * subdomain via soporte hasta que la migration esté disponible.
 *
 * Solo el owner puede modificar. El subdomain_enabled debe validarse contra
 * el public_slug (que ya está saneado en el backfill de T1).
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { academyId, enabled } = body ?? {};
  if (!academyId || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  if (!(await assertAcademyOwner(academyId, user))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Schema migration pendiente (2026-09-24 E2E audit P0-3).
  // Hasta que se migren `public_slug` y `subdomain_enabled` a `academies`,
  // este endpoint es no-op con 200 + notice para no romper clientes existentes.
  return NextResponse.json({
    ok: true,
    enabled,
    subdomain: enabled ? academyId : null,
    notice:
      "Subdomain toggle pendiente de migración de schema (public_slug/subdomain_enabled). Solicita el cambio vía soporte hasta nuevo aviso.",
  });
}