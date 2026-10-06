import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getOwnerDashboard,
  ownerDashboardQuerySchema,
} from "@/modules/owner-dashboard/application/get-owner-dashboard";
import { OperationalError } from "@/modules/shared/domain/operational-error";

function problem(input: {
  status: number;
  title: string;
  detail: string;
  type: string;
  errors?: unknown;
}) {
  return NextResponse.json(
    {
      type: `https://zaltyko.com/problems/${input.type}`,
      title: input.title,
      status: input.status,
      detail: input.detail,
      ...(input.errors ? { errors: input.errors } : {}),
    },
    {
      status: input.status,
      headers: {
        "content-type": "application/problem+json",
        "cache-control": "private, no-store",
      },
    }
  );
}

// @auth-flexible route-guard-reason: getCurrentUser resolves the verified session before URL validation; authorization remains server-side in getOwnerDashboard.
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) {
    return problem({
      status: 401,
      title: "Autenticación requerida",
      detail: "Debes iniciar sesión para consultar el dashboard.",
      type: "authentication-required",
    });
  }

  const url = new URL(request.url);
  const parsed = ownerDashboardQuerySchema.safeParse({
    organizationId: url.searchParams.get("organization_id") ?? undefined,
    locationId: url.searchParams.get("location_id") || undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });
  if (!parsed.success) {
    return problem({
      status: 400,
      title: "Parámetros inválidos",
      detail: "Revisa el período y los identificadores solicitados.",
      type: "invalid-dashboard-query",
      errors: parsed.error.flatten(),
    });
  }

  try {
    const bundle = await getOwnerDashboard({ userId: user.id, ...parsed.data });
    return NextResponse.json(bundle, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof OperationalError) {
      return problem({
        status: error.status,
        title:
          error.status === 403 ? "Acceso denegado" : "Consulta no disponible",
        detail: error.message,
        type: error.code.toLowerCase().replaceAll("_", "-"),
      });
    }
    throw error;
  }
}
