import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * @route-auth public
 *
 * Liveness: confirma que la aplicación atiende peticiones sin tocar la base
 * de datos ni ningún proveedor. Sirve para distinguir «la app no responde» de
 * «la base de datos no responde» (eso lo dice /api/health). Sin sesión, sin
 * rate limit y sin datos internos.
 */
export function GET() {
  return NextResponse.json(
    { ok: true, data: { status: "ok", timestamp: new Date().toISOString() } },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    }
  );
}
