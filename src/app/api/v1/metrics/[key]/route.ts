import { NextResponse } from "next/server";
import { z } from "zod";

import { operationalProblem, problemResponse } from "@/app/api/v1/problem";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getMetricSeries, metricSeriesQuerySchema } from "@/modules/owner-dashboard/application/metric-series";
import { OperationalError } from "@/modules/shared/domain/operational-error";

// @auth-flexible route-guard-reason: getCurrentUser verifies the session; getMetricSeries authorizes organization/location scope before reading metric runs.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  const user = await getCurrentUser(request);
  if (!user) {
    return problemResponse({
      status: 401,
      title: "Autenticación requerida",
      detail: "Debes iniciar sesión para consultar la serie de métricas.",
      type: "authentication-required",
    });
  }
  const url = new URL(request.url);
  const parsedParams = z.object({ key: z.string().regex(/^[a-z][a-z0-9_]{1,79}$/) }).safeParse(await params);
  const parsedQuery = metricSeriesQuerySchema.safeParse({
    organizationId: url.searchParams.get("organization_id") ?? undefined,
    locationId: url.searchParams.get("location_id") || undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    currency: url.searchParams.get("currency") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsedParams.success || !parsedQuery.success) {
    return problemResponse({
      status: 400,
      title: "Parámetros inválidos",
      detail: "Revisa la métrica, el período, la moneda, el scope y el cursor.",
      type: "invalid-metric-series-query",
      errors: {
        params: parsedParams.success ? undefined : parsedParams.error.flatten(),
        query: parsedQuery.success ? undefined : parsedQuery.error.flatten(),
      },
    });
  }
  try {
    const series = await getMetricSeries({
      userId: user.id,
      metricKey: parsedParams.data.key,
      ...parsedQuery.data,
    });
    return NextResponse.json(series, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
