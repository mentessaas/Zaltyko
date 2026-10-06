import { NextResponse } from "next/server";
import { z } from "zod";

import { operationalProblem, problemResponse } from "@/app/api/v1/problem";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getInsightDetail } from "@/modules/insights/application/insight-query";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const querySchema = z.object({
  organizationId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
});

// @auth-flexible route-guard-reason: getCurrentUser resolves the verified session before params/query validation; getInsightDetail enforces organization and location scope server-side.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser(request);
  if (!user) {
    return problemResponse({
      status: 401,
      title: "Autenticación requerida",
      detail: "Debes iniciar sesión para consultar el insight.",
      type: "authentication-required",
    });
  }
  const url = new URL(request.url);
  const parsedParams = z
    .object({ id: z.string().uuid() })
    .safeParse(await params);
  const parsedQuery = querySchema.safeParse({
    organizationId: url.searchParams.get("organization_id") ?? undefined,
    locationId: url.searchParams.get("location_id") || undefined,
  });
  if (!parsedParams.success || !parsedQuery.success) {
    return problemResponse({
      status: 400,
      title: "Parámetros inválidos",
      detail: "Revisa el insight y su ámbito.",
      type: "invalid-insight-detail-query",
    });
  }
  try {
    const detail = await getInsightDetail({
      userId: user.id,
      insightId: parsedParams.data.id,
      ...parsedQuery.data,
    });
    return NextResponse.json(detail, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
