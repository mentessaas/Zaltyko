import { NextResponse } from "next/server";

import { operationalProblem, problemResponse } from "@/app/api/v1/problem";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  insightListQuerySchema,
  listInsights,
} from "@/modules/insights/application/insight-query";
import { OperationalError } from "@/modules/shared/domain/operational-error";

// @auth-flexible route-guard-reason: getCurrentUser resolves the verified session before URL validation; listInsights enforces organization and location scope server-side.
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) {
    return problemResponse({
      status: 401,
      title: "Autenticación requerida",
      detail: "Debes iniciar sesión para consultar insights.",
      type: "authentication-required",
    });
  }
  const url = new URL(request.url);
  const parsed = insightListQuerySchema.safeParse({
    organizationId: url.searchParams.get("organization_id") ?? undefined,
    locationId: url.searchParams.get("location_id") || undefined,
    status: url.searchParams.get("status") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return problemResponse({
      status: 400,
      title: "Parámetros inválidos",
      detail: "Revisa los filtros y el cursor.",
      type: "invalid-insight-query",
      errors: parsed.error.flatten(),
    });
  }
  try {
    const bundle = await listInsights({ userId: user.id, ...parsed.data });
    return NextResponse.json(bundle, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
