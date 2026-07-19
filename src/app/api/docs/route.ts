import { NextResponse } from "next/server";

// @route-auth public
export async function GET() {
  // next-swagger-doc usa requires dinámicos; cargarlo solo al solicitar la
  // documentación mantiene el bundle productivo de rutas API aislado.
  const { getApiDocs } = await import("@/lib/swagger");
  const spec = await getApiDocs();
  return NextResponse.json(spec);
}
